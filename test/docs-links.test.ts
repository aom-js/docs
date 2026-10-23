import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Сторож текстов сайта (`src/content/docs/**.md`): ссылки ведут только на то, что есть в текстах и в ядре.
 * Тексты и код ядра — одно дерево путей: страница `packages/router.md` и файл `packages/router/src/…` из клона
 * `aom-js/main` (`AOM_MAIN`, по умолчанию `../main` рядом с этим репозиторием) не пересекаются. Пути в обратных
 * кавычках — от файла страницы, от каталога пакета (у страницы пакета), от корня ядра или короткое имя (хвост
 * пути) любого файла; адрес markdown-ссылки — только страница от файла страницы, как открывает GitHub. Якорь
 * `файл#якорь` и знак раздела с «Заголовком» находят заголовок; `путь` (`Символ`) — слово символа есть в файле;
 * «цитата» после пути к `*.test.ts` дословно есть в названии теста этого файла; запрещённого из `FORBIDDEN`
 * (`scripts/links-rules.ts` ядра) нет. Каждая проверка собирает нарушения `файл:строка — причина`.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(HERE, "../src/content/docs");
const MAIN = resolve(process.env.AOM_MAIN ?? resolve(HERE, "../../main"));
const rules: typeof import("../../main/scripts/links-rules") = await import(
  join(MAIN, "scripts/links-rules.ts")
);
const { commentLines, forbiddenIn } = rules;
const SKIP = new Set(["node_modules", "dist"]);

/** Все файлы и каталоги дерева (каталог — с `/` на конце) от `root`; скрытые каталоги и сборка пропускаются. */
function walk(root: string, dir = "", out: string[] = []): string[] {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (SKIP.has(e.name) || (e.isDirectory() && e.name.startsWith("."))) continue;
    const p = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) walk(root, p, out).push(`${p}/`);
    else out.push(p);
  }
  return out;
}
const docs = walk(DOCS)
  .filter((f) => f.endsWith(".md"))
  .sort();
const index = [...new Set([...walk(DOCS), ...walk(MAIN)])].sort();

/** Файл дерева путей → абсолютный путь: сначала тексты, затем ядро; `null` — нет ни там, ни там. */
const at = (rel: string) =>
  rel.startsWith("..")
    ? null
    : [join(DOCS, rel), join(MAIN, rel)].find((abs) => existsSync(abs)) ?? null;

const files = new Map<string, string>();
const read = (rel: string) =>
  files.get(rel) ?? files.set(rel, readFileSync(at(rel)!, "utf8")).get(rel)!;
const why = (file: string, line: number, reason: string) => `${file}:${line} — ${reason}`;
const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // не %-кодирование — берём как написано
  }
};

// ───────────────────────── заголовки и якоря ─────────────────────────

/** Строки markdown с номерами; `fence` — строка внутри блока кода (```), его ограда или frontmatter. */
function docLines(md: string): { line: number; text: string; fence: boolean }[] {
  let fence = false;
  let front = md.startsWith("---\n");
  return md.split("\n").map((text, i) => {
    if (front) {
      if (i > 0 && text === "---") front = false;
      return { line: i + 1, text, fence: true };
    }
    const edge = /^\s*(```|~~~)/.test(text);
    if (edge) fence = !fence;
    return { line: i + 1, text, fence: fence || edge };
  });
}

/** Текст заголовков без `#`; блоки кода пропускаются. */
const headings = (md: string) =>
  docLines(md).flatMap(({ text, fence }) => {
    const h = !fence && /^#{1,6}\s+(.*)/.exec(text)?.[1];
    return h ? [h.trim()] : [];
  });

/** Якорь заголовка, как у GitHub: нижний регистр, без обратных кавычек и знаков кроме букв, цифр, `_`, `-` и пробела; пробел → `-`. */
const slug = (heading: string) =>
  heading
    .trim()
    .toLowerCase()
    .replaceAll("`", "")
    .replace(/[^\p{L}\p{N}_\- ]/gu, "")
    .replaceAll(" ", "-");

/** Якоря заголовков; повтор заголовка получает `-1`, `-2`, … как на GitHub. */
function anchorsOf(md: string): Set<string> {
  const seen = new Map<string, number>();
  const out = new Set<string>();
  for (const h of headings(md)) {
    const s = slug(h);
    const k = seen.get(s) ?? 0;
    seen.set(s, k + 1);
    out.add(k ? `${s}-${k}` : s);
  }
  return out;
}

/** Есть ли заголовок с таким названием: без обратных кавычек и номера раздела (`5.4.`); `…` в конце — начало названия. */
function hasHeading(md: string, title: string): boolean {
  const plain = (s: string) => s.replaceAll("`", "").replace(/\s+/g, " ").trim();
  const t = plain(title);
  const prefix = t.endsWith("…");
  const want = prefix ? t.slice(0, -1).trim() : t;
  return headings(md).some((h) =>
    [plain(h), plain(h).replace(/^\d+(?:\.\d+)*\.?\s+/, "")].some((c) =>
      prefix ? c.startsWith(want) : c === want,
    ),
  );
}

// ───────────────────────── пути ─────────────────────────

/** Начала путей от корня ядра: такой путь должен существовать в точности, без поиска по хвосту. */
const EXACT_ROOTS = ["packages/", "scripts/"];

/** Каталог пакета у страницы пакета (`packages/router.md` → `packages/router`): пути `src/…` в ней — от него. */
const packageDir = (doc: string) => /^packages\/([^/]+)\.md$/.exec(doc)?.[0].slice(0, -3) ?? null;

/**
 * Путь в обратных кавычках из файла `doc` → пути дерева, пусто — не разрешается. `#якорь` и `:N`
 * отбрасываются. От каталога `doc`, от каталога пакета, от корня, иначе короткое имя — все файлы с таким хвостом
 * пути (`core.ts` может значить любой из них). Путь за пределы дерева не разрешается.
 */
function resolveAll(doc: string, target: string): string[] {
  const p = target
    .split("#")[0]
    .replace(/:[\d,-]+$/, "")
    .replace(/[.,;:)]+$/, "");
  if (!p) return [];
  const pkg = packageDir(doc);
  const direct = [join(dirname(doc), p), ...(pkg ? [join(pkg, p)] : []), p]
    .map(normalize)
    .find((rel) => at(rel));
  if (direct) return [direct];
  if (p.startsWith("../") || EXACT_ROOTS.some((r) => p.startsWith(r))) return [];
  const tail = p.replace(/^\.\//, "");
  return index.filter((f) => f === tail || f.endsWith(`/${tail}`)).map((f) => f.replace(/\/$/, ""));
}

/** Адрес markdown-ссылки → страница, только от каталога `doc`; `null` — такой страницы нет. */
function resolveMarkdownLink(doc: string, target: string): string | null {
  const p = decode(target.split("#")[0]);
  if (!p) return null;
  const rel = normalize(join(dirname(doc), p));
  return !rel.startsWith("..") && existsSync(join(DOCS, rel)) ? rel : null;
}

const resolvePathRef = (doc: string, r: { path: string; link: boolean }) =>
  r.link ? resolveMarkdownLink(doc, r.path) : (resolveAll(doc, r.path)[0] ?? null);

// ───────────────────────── ссылки в docs ─────────────────────────

/**
 * Что в строке docs проверяется (блоки кода пропускаются): `path` — адрес ссылки `[…](…)` (`link`) или путь в
 * обратных кавычках, `anchor` — после `#`, путь пуст у якоря своего файла; `symbol` — `` `путь` (`Символ`, …) ``,
 * имена как в коде (`Класс.метод` без `()` и `@`); `section` — знак раздела с «названием», `near` — ближайший путь
 * к `.md` в строке (null — раздел своего файла); `quote` — «цитата» после пути к `*.test.ts`: до `)`, что
 * закрывает скобку сразу за путём, без скобки — до конца фразы; многоточие пропускает часть названия.
 */
type DocRef =
  | { kind: "path"; line: number; path: string; anchor: string | null; link: boolean }
  | { kind: "symbol"; line: number; path: string; names: string[] }
  | { kind: "section"; line: number; title: string; near: string | null }
  | { kind: "quote"; line: number; text: string; test: string };

const FILE_EXT = /[\p{L}\p{N}_-]\.(?:ts|tsx|js|mjs|cjs|json|sh|md|yml|yaml|sql|py|toml|html)$/u;
/** Путь от корня пакета или ядра, с выходом из каталога: так пишут пути к файлам и каталогам. */
const REPO_ROOT = /^(?:\.\.\/)*(?:src|test|packages|scripts|docs)\//;
const IDENT_CHAIN = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const baseOf = (t: string) => t.split("#")[0].replace(/:[\d,-]+$/, "");
const isPathLike = (span: string) => {
  const b = baseOf(span);
  return (
    /^[\p{L}\p{N}_./-]+$/u.test(b) && !b.startsWith("/") && (FILE_EXT.test(b) || REPO_ROOT.test(b))
  );
};
const OPEN = /\s*\(\s*/y;
const SEP = /\s*(?:,|и|\/)\s*/y;
const GROUP = /\s*\(/y;

/** «…» строки вне обратных кавычек, текста ссылки `[…](` и не после знака раздела; `at` — позиция. */
function lineQuotes(text: string): { at: number; text: string }[] {
  const skip = [...text.matchAll(/`[^`\n]+`/g), ...text.matchAll(/\[[^\]\n]*\]\(/g)].map((m) => [
    m.index,
    m.index + m[0].length,
  ]);
  return [...text.matchAll(/«([^»]*)»/g)]
    .filter(
      (m) =>
        !skip.some(([from, to]) => from <= m.index && m.index < to) &&
        !/§\s?$/.test(text.slice(0, m.index)),
    )
    .map((m) => ({ at: m.index, text: m[1].replace(/\s+/g, " ").trim() }))
    .filter((q) => q.text);
}

/**
 * Где кончаются цитаты пути к тесту, который кончается в `from`: на `)`, закрывающей скобку сразу за путём, иначе
 * в конце фразы; раньше — на границе ячейки таблицы (`|`) и на `limit` (следующий путь к тесту).
 */
function citedTo(
  text: string,
  from: number,
  limit: number,
  inSpan: (at: number) => boolean,
): number {
  GROUP.lastIndex = from;
  const grouped = GROUP.test(text);
  let depth = 0;
  for (let k = grouped ? GROUP.lastIndex - 1 : from; k < limit; k++) {
    if (inSpan(k)) continue;
    const c = text[k];
    if (c === "«") k = Math.max(text.indexOf("»", k), k);
    else if (c === "|" && text[k - 1] !== "\\") return k;
    else if (grouped && c === "(") depth++;
    else if (
      grouped ? c === ")" && --depth === 0 : /[.!?]/.test(c) && /\s/.test(text[k + 1] ?? " ")
    )
      return k;
  }
  return limit;
}

function docRefs(md: string): DocRef[] {
  const out: DocRef[] = [];
  for (const { line, text, fence } of docLines(md)) {
    if (fence) continue;
    // пути к .md и якоря своего файла (target null) — для ближайшего к знаку раздела
    const mds: { at: number; end: number; target: string | null }[] = [];
    const path = (target: string, at: number, end: number, link: boolean) => {
      const [p, ...a] = target.split("#");
      out.push({ kind: "path", line, path: p, anchor: a.length ? a.join("#") : null, link });
      if (baseOf(target).endsWith(".md")) mds.push({ at, end, target: baseOf(target) });
      else if (!p && a.length) mds.push({ at, end, target: null });
    };
    const spans = [...text.matchAll(/`([^`\n]+)`/g)].map((m) => ({
      s: m[1],
      at: m.index,
      end: m.index + m[0].length,
    }));
    const inSpan = (at: number) => spans.some((sp) => sp.at <= at && at < sp.end);
    const quotes = lineQuotes(text);
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g))
      if (!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(m[1]) && !inSpan(m.index))
        path(m[1], m.index + 2, m.index + 2 + m[1].length, true);
    spans.forEach((sp, i) => {
      if (!isPathLike(sp.s)) return;
      path(sp.s, sp.at, sp.end, false);
      OPEN.lastIndex = sp.end;
      if (OPEN.test(text)) {
        const names: string[] = [];
        for (let k = i + 1, pos = OPEN.lastIndex; spans[k]?.at === pos; k++) {
          names.push(spans[k].s.replace(/\(\)$/, "").replace(/^@/, ""));
          SEP.lastIndex = spans[k].end;
          if (!SEP.test(text)) break;
          pos = SEP.lastIndex;
        }
        const idents = names.filter((n) => IDENT_CHAIN.test(n) && !FILE_EXT.test(n));
        if (idents.length) out.push({ kind: "symbol", line, path: baseOf(sp.s), names: idents });
      }
      if (baseOf(sp.s).endsWith(".test.ts")) {
        const next = spans
          .slice(i + 1)
          .find((o) => isPathLike(o.s) && baseOf(o.s).endsWith(".test.ts"));
        const to = citedTo(text, sp.end, next?.at ?? text.length, inSpan);
        for (const q of quotes)
          if (sp.end <= q.at && q.at < to)
            out.push({ kind: "quote", line, text: q.text, test: baseOf(sp.s) });
      }
    });
    for (const m of text.matchAll(/§\s?«([^»]+)»/g)) {
      if (inSpan(m.index)) continue; // образец записи в обратных кавычках
      const gap = (f: { at: number; end: number }) =>
        m.index >= f.end ? m.index - f.end : f.at - m.index;
      const near = mds.reduce<(typeof mds)[number] | null>(
        (b, f) => (b && gap(b) <= gap(f) ? b : f),
        null,
      );
      out.push({ kind: "section", line, title: m[1], near: near?.target ?? null });
    }
  }
  return out;
}

/** Текст для сравнения цитаты с названием: экранирование снято, «ёлочки» и кавычки — одно, пробелы сжаты. */
const flat = (s: string) =>
  s
    .replace(/\\(["'`\\])/g, "$1")
    .replace(/[«»“”]/g, '"')
    .replace(/\s+/g, " ");

/** Все куски цитаты между многоточиями идут в названии теста по порядку; цитата из одного многоточия — образец, не цитата. */
function quoteIn(title: string, quote: string): boolean {
  const parts = quote
    .split(/…|\.\.\./)
    .map((p) => p.trim())
    .filter(Boolean);
  const src = flat(title);
  let from = 0;
  for (const part of parts) {
    const at = src.indexOf(flat(part), from);
    if (at < 0) return false;
    from = at + flat(part).length;
  }
  return true;
}

/** Слово целиком: кириллица и `$` тоже буквы идентификатора. */
const hasWord = (src: string, word: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}_$])${word.replaceAll("$", "\\$")}(?![\\p{L}\\p{N}_$])`, "u").test(
    src,
  );
const isFile = (rel: string) => statSync(at(rel)!).isFile();

// ───────────────────────── проверки docs ─────────────────────────

const refs = docs.map((doc) => ({ doc, refs: docRefs(read(doc)) }));

describe("docs: тексты ссылаются только на тексты и ядро", () => {
  it("docs: пути к файлам существуют", () => {
    expect(docs.length).toBeGreaterThan(0);
    const bad = refs.flatMap(({ doc, refs }) =>
      refs.flatMap((r) =>
        r.kind === "path" && r.path && !resolvePathRef(doc, r)
          ? [why(doc, r.line, `нет файла ${r.path}`)]
          : [],
      ),
    );
    expect(bad).toEqual([]);
  });

  it("docs: якоря открываются", () => {
    const bad: string[] = [];
    for (const { doc, refs: rs } of refs)
      for (const r of rs) {
        if (r.kind !== "path" || r.anchor === null) continue;
        const target = r.path ? resolvePathRef(doc, r) : doc;
        if (!target) continue; // нет файла — нарушение проверки путей
        const anchor = decode(r.anchor);
        if (!target.endsWith(".md"))
          bad.push(why(doc, r.line, `якорь #${anchor} у файла не markdown ${target}`));
        else if (!anchorsOf(read(target)).has(anchor))
          bad.push(why(doc, r.line, `в ${target} нет якоря #${anchor}`));
      }
    expect(bad).toEqual([]);
  });

  it("docs: раздел «названием» находит заголовок", () => {
    const bad: string[] = [];
    for (const { doc, refs: rs } of refs)
      for (const r of rs) {
        if (r.kind !== "section") continue;
        const target = r.near ? (resolveAll(doc, r.near)[0] ?? null) : doc;
        if (!target) bad.push(why(doc, r.line, `нет файла ${r.near} для раздела «${r.title}»`));
        else if (!hasHeading(read(target), r.title))
          bad.push(why(doc, r.line, `в ${target} нет заголовка «${r.title}»`));
      }
    expect(bad).toEqual([]);
  });

  it("docs: символ в `путь` (`Символ`) есть в файле", () => {
    const bad: string[] = [];
    for (const { doc, refs: rs } of refs)
      for (const r of rs) {
        if (r.kind !== "symbol") continue;
        // короткое имя может значить несколько файлов — слову достаточно одного из них
        const found = resolveAll(doc, r.path).filter(isFile);
        if (!found.length) continue; // нет файла — нарушение проверки путей
        for (const part of new Set(r.names.flatMap((n) => n.split("."))))
          if (!found.some((f) => hasWord(read(f), part)))
            bad.push(why(doc, r.line, `нет слова ${part} в ${found.join(", ")} (${r.path})`));
      }
    expect(bad).toEqual([]);
  });

  it("docs: цитата названия теста есть в названии теста своего файла", () => {
    const bad: string[] = [];
    for (const { doc, refs: rs } of refs)
      for (const r of rs) {
        if (r.kind !== "quote") continue;
        const tests = resolveAll(doc, r.test).filter(isFile);
        const titles = tests.flatMap((t) =>
          commentLines(read(t), t)
            .filter((c) => c.title)
            .map((c) => c.text),
        );
        if (!tests.length) bad.push(why(doc, r.line, `нет файла теста ${r.test}`));
        else if (!titles.some((t) => quoteIn(t, r.text)))
          bad.push(why(doc, r.line, `в названиях тестов ${tests.join(", ")} нет «${r.text}»`));
      }
    expect(bad).toEqual([]);
  });

  it("docs: нет запрещённых ссылок", () => {
    const bad = docs.flatMap((doc) =>
      docLines(read(doc)).flatMap(({ line, text }) =>
        forbiddenIn(text, "docs").map((rule) => why(doc, line, `${rule}: ${text.slice(0, 120)}`)),
      ),
    );
    expect(bad).toEqual([]);
  });

  // поиск жив: без этого сломанный разбор молча сделал бы все проверки выше пустыми; цитат тестов в текстах
  // сейчас нет — их разбор держат тест-данные ниже
  it("docs: разбор находит в docs ссылки всех видов", () => {
    const kinds = new Set(
      refs.flatMap(({ refs: rs }) =>
        rs.map((r) => (r.kind === "path" && r.anchor !== null ? "anchor" : r.kind)),
      ),
    );
    for (const k of ["anchor", "path", "section", "symbol"]) expect(kinds).toContain(k);
  });
});

describe("docs: разбор ссылок", () => {
  const doc = "packages/router.md";

  it("docs: путь — короткое имя, от страницы, от пакета страницы, от корня; приложение не разрешается", () => {
    expect(resolveAll(doc, "cursor.ts")).toContain("packages/router/src/common/cursor.ts");
    expect(resolveAll(doc, "src/common/cursor.ts:12")).toEqual([
      "packages/router/src/common/cursor.ts",
    ]);
    expect(resolveAll(doc, "architecture.md#как-менять-ядро")).toEqual(["architecture.md"]);
    expect(resolveAll(doc, "docs/architecture.md")).toEqual([]);
    expect(resolveAll("testing.md", "../test/docs/README.md")).toEqual([]);
    expect(resolveAll("testing.md", "../../test/README.md")).toEqual([]);
  });

  it("docs: markdown-ссылка — только страница от файла страницы", () => {
    expect(resolveMarkdownLink(doc, "core.md#x")).toBe("packages/core.md");
    expect(resolveMarkdownLink(doc, "packages/core.md")).toBeNull();
    expect(resolveMarkdownLink(doc, "router/src/index.ts")).toBeNull();
    expect(resolveMarkdownLink(doc, "")).toBeNull();
  });

  it("docs: якорь как у GitHub, повтор заголовка с номером", () => {
    expect(slug("Инстансы, `state` и `@OnInstance`…")).toBe("инстансы-state-и-oninstance");
    expect([...anchorsOf("# А б\n```\n# не заголовок\n```\n## А б\n")]).toEqual(["а-б", "а-б-1"]);
    expect(hasHeading("## 5.4. Ленивые значения контекста\n", "Ленивые значения…")).toBe(true);
    expect(hasHeading("## Ленивые\n", "Ленивые значения")).toBe(false);
  });

  it("docs: строка docs даёт путь, якорь, ссылку, символ, раздел и цитату теста", () => {
    const md = [
      "См. [ядро](../core/readme.md#ключевые-механизмы) и `cursor.ts` (`AomCursor.realizeDelay`, `@Next()`).",
      "Тест `test/cursor.test.ts` («собирает маршрут… по курсору») и `packages/api/readme.md` §«Ленивое тело».",
      "Внешний [сайт](https://example.com) и образец `[x](нет.md)` — не ссылки.",
      "```",
      "`нет.ts` в блоке кода не читается",
      "```",
    ].join("\n");
    expect(docRefs(md)).toEqual([
      {
        kind: "path",
        line: 1,
        path: "../core/readme.md",
        anchor: "ключевые-механизмы",
        link: true,
      },
      { kind: "path", line: 1, path: "cursor.ts", anchor: null, link: false },
      { kind: "symbol", line: 1, path: "cursor.ts", names: ["AomCursor.realizeDelay", "Next"] },
      { kind: "path", line: 2, path: "test/cursor.test.ts", anchor: null, link: false },
      { kind: "quote", line: 2, text: "собирает маршрут… по курсору", test: "test/cursor.test.ts" },
      { kind: "path", line: 2, path: "packages/api/readme.md", anchor: null, link: false },
      { kind: "section", line: 2, title: "Ленивое тело", near: "packages/api/readme.md" },
    ]);
  });

  it("docs: цитата сверяется с названием теста по кускам между многоточиями", () => {
    expect(
      quoteIn('собирает маршрут \\"api\\" по курсору', "собирает маршрут «api»… курсору"),
    ).toBe(true);
    expect(quoteIn("собирает маршрут по курсору", "курсору… собирает")).toBe(false);
  });

  it("docs: в docs знак раздела с «названием» разрешён, без названия и с номером — нет", () => {
    expect(forbiddenIn("`a.md` §«Раздел»", "docs")).toEqual([]);
    expect(forbiddenIn("см. § выше", "docs")).toEqual(["знак § без «названия»"]);
    expect(forbiddenIn("см. §5", "docs")).toEqual(["раздел §N"]);
    expect(forbiddenIn("`../test/docs/README.md`", "docs")).toEqual(["путь в приложение"]);
  });
});
