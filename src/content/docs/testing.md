---
title: "Тестирование приложения на ядре"
sidebar:
  order: 2
---

Документ для того, кто начинает приложение или модуль на ядре `@aom-js/*` и хочет проверять цепочки маршрутов: что взять из ядра готовым, что передать ядру и что написать самому.

Граница одна: **ядро выгружает факты о цепочке и проверяет правила, одинаковые для любого приложения; что чем считается — решает приложение.** Факты — место шага, точка прикрепления, родитель, цели параметров, объявленный и выведенный из классов ядра вид, текст дампа. Толкования — какие классы контейнеры данных, какой шаг пишет и какой читает, какой маршрут служебный, пороги, остатки, архетипы — живут в приложении.

Читать до: [`@aom-js/router`](packages/router.md) [«Метаданные цепочки»](packages/router.md#метаданные-цепочки-tojson-routeof-cursorkind) — форма проекции, словари видов, `via`. Свойства цепочки пронумерованы 1–9 (в комментариях кода ядра — `P1`…`P9`); 3–5 опираются на данные приложения, и их проверку пишет приложение (см. «Что решает приложение»).

## Что ядро выгружает

### Проекция `@aom-js/router`

- `Router.toJSON()`, `AomRoute.toJSON()`, `AomCursor.toJSON()` — цепочка как данные: шаги по порядку исполнения, `via`/`viaGroup` (почему шаг в цепочке), `parameters` (что внедряет каждый параметр и его цель), `creates`/`hooks`, `kind` — **только объявленный** `@CursorKind`. Форма полей — в readme роутера (ссылка выше).
- `router.routeOf(Эндпоинт)` — маршрут по ссылке на обработчик; `cursor.parameters()` — цели параметров классами, а не строками (`{kind: "this", target}` у `@This(S)`, `{kind: "state", target?}` у `@State`).
- `@aom-js/router/testing` (`packages/router/src/testing/chain.ts`): `parentsOf(cursors)` — индекс родителя каждого курсора по идентичности (`before` — ближайший следующий курсор своей точки прикрепления, `after`/`next` — ближайший предыдущий, верхние — `-1`); `routeName(route)` — `method path` без регулярных выражений параметров, для сообщений.

### Вид шага и выгрузка `@aom-js/api/testing`

Вид шага выводится из классов `@aom-js/api` (гейт доступа, билдеры, ID-контроллеры), а `@aom-js/router` от `api` не зависит — поэтому вид и выгрузка живут в подпути `@aom-js/api/testing` (`packages/api/src/testing/manifest.ts`), правила без классов `api` — в `@aom-js/router/testing`.

| Экспорт | Сигнатура | Что даёт |
|---|---|---|
| `ManifestOptions` | `{ kindOf?: (cursor) => AomCursorKind \| undefined }` | вид шагов классов приложения; `undefined` — решают правила ядра |
| `kindOf` | `kindOf(cursor, options?): AomCursorKind` | вид одного шага |
| `describeRoute` | `describeRoute(route, options?): DescribedRoute` | `route.toJSON()`, у каждого шага `parent` и `kind` |
| `describeRouter` | `describeRouter(router, options?): { version: 1; routes: DescribedRoute[] }` | то же для всех маршрутов, в порядке `Router.toJSON` (по `method path`) |
| `manifestOf` | `manifestOf(router, options?): string` | текст дампа: JSON с отступом 2 и переводом строки в конце |
| `DescribedStep`, `DescribedRoute` | `AomCursorJSON & { kind; parent }` | типы выгрузки |

Порядок правил вида (`packages/api/src/testing/manifest.ts` (`kindOf`)) — первое сработавшее побеждает:

1. объявленный `@CursorKind` на определении шага;
2. эндпоинт маршрута — `Handler` (и тогда, когда класс эндпоинта — наследник `BaseAccessController`);
3. `options.kindOf` приложения, если вернул вид;
4. шаг наследника `BaseAccessController` — `Checkpoint`;
5. унаследованный шаг базы билдера (`BodyBuilder`, `QueryStringBuilder`, `HeadersBuilder`, `CookieBuilder`, `ParamsBuilder`) или `IDController` — `Input`; свой метод наследника билдера (фильтр) — не вход;
6. пустой классовый шаг (`Setup`, в том числе с `@UseTag`: своя точка прикрепления — класс, нет параметров и своих прикреплений) — `Meta`;
7. остальное — `Step`.

Остальные виды словаря (`Transport`, `Collector`, `Value`, `Filter`, `Pager`, `Response`) ядро не выводит: их даёт приложение через `options.kindOf` или пометкой `@CursorKind`.

В шаге выгрузки `parent` и `kind` стоят сразу после места шага (`i`, `step`, `origin`, `via`, `viaGroup`) — одинаково у всех шагов, дамп читается и сравнивается построчно; остальные поля проекции ядра идут следом в порядке ядра, так что новое поле проекции попадает в выгрузку без правки `describeRoute`. Пример шага дампа:

```json
{ "i": 0, "step": "AccessController.Init", "origin": "OrdersRoutes", "via": "class-before", "parent": -1,
  "kind": "checkpoint", "parameters": [{ "kind": "this", "subject": "AccessController" }],
  "creates": ["AccessController"], "hooks": [] }
```

Вид своих классов приложение передаёт функцией:

```ts
const options = {
  kindOf: ({ $ }: AomCursor) => ($._.target === Shells ? AomCursorKind.Transport : undefined),
};
expect(kindOf(stepOf(router, Pages.T, Shells.Carry), options)).toBe(AomCursorKind.Transport);
expect(kindOf(stepOf(router, Pages.T, Shells.Carry))).toBe(AomCursorKind.Step);
```

## Что решает приложение

Ядро не импортирует классы приложения и не зашивает толкование одного приложения. Приложение решает и пишет само:

- **Вид своих классов** — функция `ManifestOptions.kindOf` (например, наследники своего базового класса-обёртки получают `Transport`). Без неё ядро выводит виды только из своих классов.
- **Вид, который нельзя вывести** из того, чем код является, — `@CursorKind(...)` на определении шага (например, `Collector` у шага, собирающего главный запрос, `Value` у шага-вопроса). Смысл объявленного вида задаёт приложение: в словаре ядра (`packages/router/src/common/kinds.ts` (`AomCursorKind`)) `Value` описан узко — вопрос по id из пути, а приложение может пометить им и вопрос на копии контейнера; ядро такой вид хранит и выгружает, но не толкует.
- **Кто пишет и кто читает** контейнер — функции приложения над `cursor.parameters()` и видом (например, `writtenBy`/`readBy` и список «не писателей»: `Handler`, `Collector`, `Value`).
- **Служебный маршрут** (без гейта и данных) — предикат приложения (например, `isService`).
- **Правила с данными приложения** — например, свойства 3–5 (писатель раньше читателя, гейт раньше данных, параметр пути закрыт): ядро даёт для них факты (цели параметров, родители, вид), проверку пишет приложение.
- **Пороги, остатки, храповики** — «поиск жив» с зафиксированным числом, списки разрешённых исключений с причинами, списки публичных маршрутов.
- **Архетипы** — грамматики цепочек (список, карточка, создание, мутация) и всё, что на них опирается.
- **Какие роутеры выгружать и куда класть дамп.**

## Общие правила

Правило ядра — функция «роутер (или маршрут) → нарушения». Она не вызывает `expect`, не зависит от раннера (ядро гоняет их в vitest, приложение — в своём раннере) и возвращает строки по-английски или факты. Тест с порогом и остатком пишет приложение. Если роутер не сериализуется (неразрешимая ссылка), `accessIdents`/`identCollisions` и `describeRoute`/`describeRouter` бросают исключение, поэтому свойство 7 (`serializationErrors`) проверяют первым.

| Свойство | Функция | Что ловит | Результат |
|---|---|---|---|
| 1. Один эндпоинт — один маршрут | `sharedEndpoints(router)` | эндпоинт под двумя мостами или с двумя методами: `routeOf` по нему неоднозначен, правка цепочки задевает чужой маршрут | `string[]` |
| 2. `ident` точки доступа уникален | `identCollisions(router)`; факты — `accessIdents(router)` | два разных элемента с одним `ident` (`String(origin)`) среди точек доступа маркеров: гранты хранятся строками, совпадение дало бы права на чужую точку; считаются только курсоры с маркером | `string[]`; `Map<ident, Set<источник>>` |
| 6. Повтор шага объяснён | `repeatsOf(route, options)` | тот же шаг (`$._`) раньше в цепочке без причины | `Repeat[]` с `branch` или без |
| 7. Роутер сериализуется | `serializationErrors(router)` | неразрешимая ссылка (`FwdRef`, `ThisRef`) — `JSON.stringify(router)` бросает | `string[]` |
| 8. Нет `ThisRef` и `@This()` без аргумента в конструкторах | `constructorThisRefs(router)` | параметр конструктора класса маршрута (рекурсивно по целям `@This`), чья цель зависит от курсора, первым создавшего класс | `{ inspected: number; found: string[] }` |
| 9. Дамп совпадает с кодом | `manifestOf(router, options)` | устаревший файл дампа | текст для побайтной сверки (раздел «Дамп») |

Все функции — `packages/router/src/testing/chain.ts` (`sharedEndpoints`, `accessIdents`, `identCollisions`, `serializationErrors`, `constructorThisRefs`, `repeatsOf`), кроме `manifestOf`. Роутер без маршрутов — пустые результаты, не ошибка.

**Как приложение оформляет тест.** Над всеми роутерами приложения: число проверенных объектов в названии теста и храповик «поиск жив» (не ниже зафиксированного — иначе проверка тихо перестала что-то видеть), затем `toEqual([])` по нарушениям с именем модуля. Пример:

```ts
// routers — пары [модуль, роутер] из фасада приложения; ROUTES_FLOOR — зафиксированный порог
const routesTotal = routers.reduce((n, [, router]) => n + router.routes.length, 0);

describe("свойство 1: один эндпоинт — один маршрут в пределах роутера", () => {
  test(`поиск жив: ${routesTotal} маршрутов в ${routers.length} роутерах, у каждого эндпоинта один маршрут`, () => {
    expect(routesTotal, "проверено маршрутов: набор сократился").toBeGreaterThanOrEqual(ROUTES_FLOOR);
    expect(routers.flatMap(([module, router]) => sharedEndpoints(router).map((v) => `${module}: ${v}`))).toEqual([]);
  });
});
```

Числа «поиск жив»: у свойства 1 — `router.routes.length`, у 2 — `accessIdents(router).size`, у 7 — число роутеров, у 8 — `constructorThisRefs(router).inspected`. Синтетический нарушитель с классом приложения (например, два одноимённых класса под гейтом приложения для свойства 2) приложение держит рядом — правило ядра проверено на своих классах, связка с классами приложения — нет.

### Свойство 6: повторы

`repeatsOf(route, { kindOf, writes, harmless })` (`packages/router/src/testing/chain.ts` (`repeatsOf`, `RepeatOptions`)) находит каждый повтор шага и ветку, которая его объясняет: `"kind"` — вид из `harmless`; `"next-group"` — все прежние вхождения в других группах `@Next` (группа — `viaGroup` ближайшего предка с `via === "next"`); `"after-handler"` — повтор после обработчика у шага, который не пишет. Нет `branch` — повтор не объяснён. Что такое «пишет» и какие виды безвредны, правило получает параметрами — это толкование приложения. Пример:

```ts
// repeatsByRule — repeatsOf из @aom-js/router/testing; kindOf и writtenBy — из фасада приложения
const repeatsOf = (route: Route) =>
  repeatsByRule(route, {
    kindOf,
    writes: (cursor) => writtenBy(cursor).length > 0,
    harmless: [AomCursorKind.Transport, AomCursorKind.Checkpoint],
  });
```

Повторы без ветки, которые приложение признаёт допустимыми, оно держит остатком с причиной; остаток только убывает.

## Дамп

Дамп — обогащённая выгрузка каждого роутера в файл, который коммитится: в diff ревью видно, что правка декоратора уехала в цепочку соседнего маршрута. Ядро даёт текст (`manifestOf`), приложение — список роутеров, путь файла, скрипт записи и тест актуальности:

- скрипт записи — для каждого модуля пишет `manifestOf` фасада в свой файл (например, `manifests/<module>.json`) через `node:fs`;
- тест актуальности — пересобирает текст в памяти и сравнивает с файлом побайтно; сообщение называет модуль и команду перегенерации.

```ts
// тест актуальности; modules, routerOf, manifestPath — из фасада приложения
test.each(modules)("дамп %s совпадает с кодом", async (module) => {
  const actual = manifestOf(await routerOf(module));
  const committed = readFileSync(manifestPath(module), "utf8");
  expect(actual, `дамп модуля ${module} устарел (${manifestPath(module)}) — перезаписать скриптом дампа`).toBe(committed);
});
```

Дамп руками не правится. Правка сборки цепочки, проекции в `router` или выгрузки в `@aom-js/api/testing` — пересборка ядра (`bun run build`) и перезапись дампа в приложении; изменившиеся файлы коммитятся в приложение.

## Как подключить новое приложение

1. **Фасад** — один модуль приложения над `@aom-js/api/testing`: список роутеров, свой вывод вида, толкования. Тесты и скрипт дампа берут всё из него, а не из ядра напрямую — тогда `options` передаются в одном месте. Обычный набор фасада — `kindOf`, `describe`, `describeRouter`, `manifestOf` и толкования (`writtenBy`, `readBy`, `isService`):

   ```ts
   // псевдокод: MyShellsBase и модули — классы и имена приложения
   import { describeRouter as coreDescribeRouter, kindOf as coreKindOf, manifestOf as coreManifestOf } from "@aom-js/api/testing";
   import { AomCursorKind, type AomCursor, type Router } from "@aom-js/router";

   export { parentsOf, routeName } from "@aom-js/router/testing";

   export const modules = ["users", "orders"];
   export const routerOf = async (module: string): Promise<Router> => (await import(`@/modules/${module}/api/router`)).router;

   const appKind = ({ $ }: AomCursor) =>
     $._.target === MyShellsBase || ($._.target as Function).prototype instanceof MyShellsBase ? AomCursorKind.Transport : undefined;

   export const kindOf = (cursor: AomCursor) => coreKindOf(cursor, { kindOf: appKind });
   export const describeRouter = (router: Router) => coreDescribeRouter(router, { kindOf: appKind });
   export const manifestOf = (router: Router) => coreManifestOf(router, { kindOf: appKind });
   ```

   Нет своих классов, которым нужен вид, — фасад без `appKind`, функции ядра вызываются без `options`.
2. **Первые тесты-свойства** — 1, 2, 7, 8 над всеми роутерами фасада по образцу выше (храповик «поиск жив» + `toEqual([])`); 6 — когда появятся толкования «пишет» и безвредные виды.
3. **Дамп** — скрипт записи и тест актуальности (раздел «Дамп»), файлы — в коммит.
4. **Свои правила** — порядок писателей и читателей, гейт раньше данных, архетипы — по мере того, как приложение вводит соответствующие понятия; данные для них — `describeRoute`, `parentsOf`, `cursor.parameters()`.
5. **Зонды** — для того, что существует только во время запроса (что накопили шаги, условия из хуков): `@aom-js/router/testing`, раздел [«Зонды»](packages/router.md#зонды-aom-jsroutertesting) readme роутера. Порядок шагов и маркеры читаются выгрузкой, а не зондом.

Приложение исполняет собранный `dist` ядра: после правки `src` ядра — `bun run build` до прогона тестов приложения ([Архитектура ядра](architecture.md#как-менять-ядро)).
