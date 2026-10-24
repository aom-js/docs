import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Код на страницах учебника — тот же, что в исполняемых примерах: блок кода с `title="<глава>/<файл>"`
 * совпадает с файлом `examples/<глава>/<файл>` целиком. Тесты самих примеров — `examples/<глава>/*.test.ts`.
 */
const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const PAGES = join(ROOT, "src/content/docs/tutorial");
const EXAMPLES = join(ROOT, "examples");

/** Блоки кода с заголовком-файлом: `{ title, code }`. */
export function titledBlocks(md: string): { title: string; code: string }[] {
  return [...md.matchAll(/^```\w*[^\n]*?\btitle="([^"]+)"[^\n]*\n([\s\S]*?)^```\s*$/gm)].map(
    ([, title, code]) => ({ title, code }),
  );
}

// глава — страница с номером; обзор учебника (`index.md`) кода не несёт
const pages = existsSync(PAGES) ? readdirSync(PAGES).filter((f) => /^\d+-.+\.md$/.test(f)) : [];
const blocks = pages.flatMap((page) =>
  titledBlocks(readFileSync(join(PAGES, page), "utf8")).map((b) => ({ page, ...b })),
);

describe("учебник: код на страницах = код примеров", () => {
  it("у каждой главы учебника есть код из примеров", () => {
    expect(pages.length).toBeGreaterThan(0);
    const bare = pages.filter((p) => !blocks.some((b) => b.page === p));
    expect(bare).toEqual([]);
  });

  it("блок с title совпадает с файлом примера", () => {
    const bad = blocks.flatMap(({ page, title, code }) => {
      const file = join(EXAMPLES, title);
      if (!existsSync(file)) return [`${page}: нет файла examples/${title}`];
      return readFileSync(file, "utf8") === code ? [] : [`${page}: ${title} расходится с файлом`];
    });
    expect(bad).toEqual([]);
  });

  it("разбор находит блок с title и только его", () => {
    const md = '```ts title="a/b.ts"\nconst x = 1;\n```\n\n```ts\nnope\n```\n';
    expect(titledBlocks(md)).toEqual([{ title: "a/b.ts", code: "const x = 1;\n" }]);
  });
});
