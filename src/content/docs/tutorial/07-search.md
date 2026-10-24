---
title: "Поиск и фильтры"
sidebar:
  order: 7
---

Список, который можно сузить из строки запроса: поиск по части названия (`?search=`), логический флаг (`?active=true`), выбор по списку id (`?ids=1&ids=2` или `?ids=1,2`), сортировка и страницы (`limit`, `offset`, `sort`). Рядом — маршрут `/total`, который считает записи по тому же фильтру. Строка запроса проверяется по схеме: неизвестные параметры отбрасываются, неверные значения дают 400, а все параметры попадают в документ OpenAPI. Всё на этой странице — файлы каталога `examples/07-search/`, тест `examples/07-search/search.test.ts` проверяет их по HTTP.

## Из чего состоит пример

| Файл | Что в нём |
| --- | --- |
| `store.ts` | данные: массив стран в памяти |
| `query.ts` | схемы строки запроса: фильтр и страница; билдеры над ними |
| `data.ts` | выборка: шаг, который превращает фильтр в условия, и два обработчика — страница и счётчик |
| `routes.ts` | маршруты `GET /` и `GET /total` |
| `root.ts`, `router.ts` | корень модуля и дерево маршрутов, как в [первой главе](01-first-service.md) |

Главная мысль главы: условия выборки собираются **шагами до обработчика**, а обработчик только применяет их. Тогда список и счётчик берут один и тот же шаг подготовки и не могут разойтись в том, что считают.

## Данные

```ts title="07-search/store.ts"
export interface Country {
  id: number;
  name: string;
  code: string;
  active: boolean;
}

// здесь была бы таблица в базе; в примере — массив в памяти процесса
export const countries: Country[] = [
  { id: 1, name: "Россия", code: "RU", active: true },
  { id: 2, name: "Беларусь", code: "BY", active: true },
  { id: 3, name: "Казахстан", code: "KZ", active: true },
  { id: 4, name: "Армения", code: "AM", active: false },
  { id: 5, name: "Грузия", code: "GE", active: true },
  { id: 6, name: "Германия", code: "DE", active: false },
];
```

В настоящем приложении здесь таблица в базе, а условия — части SQL-запроса. В примере условие — функция-предикат: суть та же, только без базы.

## Схема строки запроса

```ts title="07-search/query.ts"
import { QueryStringBuilder, TransformToArray, TransformTrim } from "@aom-js/api";
import { Controller } from "@aom-js/router";
import { ComponentSchema, PropertySchema } from "@aom-js/schemer";

@ComponentSchema({ description: "Фильтр списка стран" })
export class CountriesFilter {
  @PropertySchema.String({
    isOptional: true,
    decorators: [TransformTrim()],
    description: "Часть названия, без учёта регистра",
  })
  search?: string;

  @PropertySchema.Boolean({ isOptional: true, description: "true — только активные, false — только выключенные" })
  active?: boolean;

  // строки, а не числа: PropertySchema.Number приводит значение целиком и список не разбирает
  @PropertySchema.String({
    isArray: true,
    isOptional: true,
    pattern: "^\\d+$",
    decorators: [TransformToArray()],
    description: "ID стран: ?ids=1&ids=2 или ?ids=1,2",
  })
  ids?: string[];
}

@Controller()
export class CountriesFilterQuery extends QueryStringBuilder(CountriesFilter) {}

export enum CountriesSort {
  id = "id",
  idDesc = "-id",
  name = "name",
  nameDesc = "-name",
}

@ComponentSchema({ description: "Страница списка и её порядок" })
export class Pager {
  // default пишет значение только в документ OpenAPI, а в запрос его подставляет инициализатор поля
  @PropertySchema.Number({
    isOptional: true,
    minValue: 1,
    maxValue: 100,
    default: 20,
    description: "Сколько записей отдать",
  })
  limit = 20;

  @PropertySchema.Number({ isOptional: true, minValue: 0, default: 0, description: "Сколько записей пропустить" })
  offset = 0;

  @PropertySchema.Enum({
    value: CountriesSort,
    isOptional: true,
    default: CountriesSort.id,
    description: "Поле сортировки, «-» — по убыванию",
  })
  sort = CountriesSort.id;
}

@Controller()
export class QueryStringPager extends QueryStringBuilder(Pager) {}
```

Строка запроса описывается обычной схемой `@ComponentSchema` — той же, что описывает тело запроса или ответ (см. [`@aom-js/schemer`](../packages/schemer.md)). Каждое поле — параметр, у каждого параметра есть тип, ограничения и описание.

- **`search`** — строка. `TransformTrim()` срезает пробелы по краям, поэтому `?search=` и `?search=%20%20` значат «без поиска». В строке запроса он безопасен: значение там всегда строка, а не число или `null`, которые он молча превратил бы в текст (почему в теле запроса он опасен — в главе [«Проверка входящих данных»](06-body.md)).
- **`active`** — логическое. Через HTTP приходит строка, `PropertySchema.Boolean` сам превращает `"true"`/`"false"` в `true`/`false`, отдельный `QueryBoolean` из `@aom-js/api` для этого не нужен.
- **`ids`** — список. Повтор параметра (`?ids=1&ids=2`) сервер уже складывает в массив, а `TransformToArray()` из `@aom-js/api` разбирает ещё и запятые (`?ids=1,2`). `pattern` проверяет каждый элемент, потому что поле объявлено с `isArray: true`.
- **`limit`, `offset`, `sort`** — страница. У них есть значения по умолчанию, поэтому `isOptional: true`: без параметров список отдаёт первые 20 записей по возрастанию `id`. Значение по умолчанию записано дважды, и оба нужны: `default` попадает только в документ OpenAPI, а в разобранный запрос значение подставляет инициализатор поля (`limit = 20`). Без инициализатора `limit` останется `undefined`, без `default` документ не покажет значение. `sort` — перечисление: ничего, кроме четырёх объявленных значений, не пройдёт. В документе OpenAPI эти параметры необязательные, со своими значениями по умолчанию.

`QueryStringBuilder(схема)` превращает схему в билдер — контроллер с готовым шагом (см. [`@aom-js/api`](../packages/api.md#билдеры-схема--контроллер)). У него есть шаг `Query`: он проверяет строку запроса по схеме, кладёт результат в поле `query` своего объекта и регистрирует параметры в OpenAPI того маршрута, где стоит. Проверка не прошла — шаг бросает `WrongDataResponse`, клиент получает 400 со списком ошибок. У наследника обязательно `@Controller()`: без него билдер не узнает свою схему.

Фильтр и страница — две разные схемы нарочно: счётчику нужен фильтр, но не нужна страница.

## Выборка: условия до обработчика

```ts title="07-search/data.ts"
import { Before, Controller, Middleware, Nextpoint, This } from "@aom-js/router";

import { CountriesFilterQuery, QueryStringPager } from "./query";
import { countries, type Country } from "./store";

/** Выборка стран: шаги до обработчика копят условия, обработчики только применяют их. */
@Controller()
export class CountriesData {
  where: ((country: Country) => boolean)[] = [];

  // здесь был бы запрос к базе с собранными условиями
  rows() {
    return countries.filter((country) => this.where.every((test) => test(country)));
  }

  @Middleware()
  @Before(CountriesFilterQuery.Query)
  static async Filter(@This() self: CountriesData, @This(CountriesFilterQuery) { query }: CountriesFilterQuery) {
    if (query.search) {
      const search = query.search.toLowerCase();
      self.where.push((country) => country.name.toLowerCase().includes(search));
    }
    if (query.active !== undefined) {
      self.where.push((country) => country.active === query.active);
    }
    if (query.ids) {
      const ids = query.ids.map(Number);
      self.where.push((country) => ids.includes(country.id));
    }
  }

  @Nextpoint()
  @Before(QueryStringPager.Query)
  static async Page(@This() self: CountriesData, @This(QueryStringPager) { query }: QueryStringPager) {
    const field = query.sort.replace("-", "") as "id" | "name";
    const direction = query.sort.startsWith("-") ? -1 : 1;
    return self
      .rows()
      .sort((a, b) => direction * String(a[field]).localeCompare(String(b[field]), "ru", { numeric: true }))
      .slice(query.offset, query.offset + query.limit);
  }

  @Nextpoint()
  static async Total(@This() self: CountriesData) {
    return { total: self.rows().length };
  }
}
```

`CountriesData` — объект одного запроса (как `@This()` раздаёт такие объекты шагам, разобрано в главе [«Ресурс из схемы данных»](04-crud.md)). В нём копятся условия `where`.

- **`Filter`** — шаг (`@Middleware()`). Через `@Before(CountriesFilterQuery.Query)` он сначала получает проверенный фильтр, затем добавляет по условию на каждый заданный параметр. Не задан параметр — нет и условия. Условия складываются через «и»: `?search=ия&active=true` — страны, в названии которых есть «ия» и которые активны.
- **`Page`** и **`Total`** — обработчики-продолжения (`@Nextpoint()`): они ничего не решают про фильтр, только выполняют собранную выборку. `Page` перед собой берёт `QueryStringPager.Query`, поэтому параметры страницы проверяются и показываются в OpenAPI только у списка.

Объект `query` у билдера — экземпляр схемы, а не сырые строки: `limit` уже число, `active` уже `true`/`false`, `ids` уже массив, у `sort` уже есть значение по умолчанию.

## Маршруты

```ts title="07-search/routes.ts"
import { Before, Controller, Get, Middleware, Next, Title } from "@aom-js/router";

import { CountriesData } from "./data";

@Controller()
export class Countries {
  // общая подготовка списка и счётчика: один и тот же фильтр для обоих
  @Middleware()
  @Before(CountriesData.Filter)
  static async PrepareBaseQuery() {}

  @Get("/")
  @Title("Список стран")
  @Before(Countries.PrepareBaseQuery)
  @Next(CountriesData.Page)
  static async Index() {}

  @Get("/total")
  @Title("Количество стран по фильтру")
  @Before(Countries.PrepareBaseQuery)
  @Next(CountriesData.Total)
  static async Total() {}
}
```

`PrepareBaseQuery` — пустой шаг, который только подключает подготовку (`@Before(CountriesData.Filter)`). Оба маршрута ставят его перед собой, а дальше расходятся: список уходит в `CountriesData.Page`, счётчик — в `CountriesData.Total` (`@Next`). Новый фильтр добавляется в одном месте — в `Filter` — и сразу работает в обоих маршрутах.

Порядок шагов списка: `CountriesFilterQuery.Query` → `CountriesData.Filter` → `PrepareBaseQuery` → `Index` → `QueryStringPager.Query` → `CountriesData.Page`. Как раскладываются `@Before` и `@Next`, разобрано в [`@aom-js/router`](../packages/router.md#раскладка-курсоров-и-порядок-исполнения-plain).

## Корень и дерево маршрутов

```ts title="07-search/root.ts"
import { BaseRootController, RouteElement, RoutesStructure } from "@aom-js/api";
import { Controller, OpenApi } from "@aom-js/router";
import { ComponentSchema } from "@aom-js/schemer";

export const docs = new OpenApi({ title: "Countries API", version: "1.0.0" });

@ComponentSchema()
class CountriesRoute extends RouteElement {}

@ComponentSchema()
class CountriesRoutes extends RoutesStructure<CountriesRoute> {}

@Controller()
export class ModuleRoot extends BaseRootController {
  static readonly RoutesStructure = CountriesRoutes;

  readonly RouteElement = CountriesRoute;

  readonly ident = "countries";

  readonly docs = docs;

  markersToRoute() {}
}
```

```ts title="07-search/router.ts"
import { Bridge, Controller, Router } from "@aom-js/router";

import { docs, ModuleRoot } from "./root";
import { Countries } from "./routes";

@Controller()
@Bridge("/countries", Countries)
class Api {}

@Controller()
@Bridge("/", ModuleRoot)
@Bridge("/api", Api)
class Index {}

export const router = new Router(Index, docs);
```

Корень нужен ради `GET /openapi.json`: в документе видно, какие параметры принимает каждый маршрут. Путь собирается мостами по одному сегменту: `/api` → `/countries`.

## Проверка

```bash
curl 'http://localhost:3000/api/countries?search=ия&active=true'   # Россия, Грузия
curl 'http://localhost:3000/api/countries?ids=1,4,6&sort=-name'     # Россия, Германия, Армения
curl 'http://localhost:3000/api/countries/total?active=false'       # {"total":2}
curl 'http://localhost:3000/api/countries?limit=abc'                # 400
```

Ответ 400 — тот же, что при неверном теле запроса (сокращено):

```json
{
  "message": "AOM_API:ERROR_WRONG_DATA",
  "status": 400,
  "data": [{ "property": "limit", "constraints": { "isNumber": "limit must be a number conforming to the specified constraints" } }]
}
```

Тест `examples/07-search/search.test.ts` проверяет:

- «без параметров — первая страница по id и общее число»;
- «search ищет подстроку названия без учёта регистра, пробелы по краям срезаются»;
- «active=true и active=false делят список на две части»;
- «ids принимает повтор параметра и список через запятую»;
- «несколько фильтров сужают выборку вместе»;
- «limit и offset режут страницу, sort задаёт порядок»;
- «total считает по тому же фильтру и не смотрит на страницу»;
- «неизвестные параметры отбрасываются»;
- «неверные значения — 400»;
- «повтор строкового параметра не даёт 400: search=a&search=b склеивается в одну строку»;
- «логический флаг не отказывает на мусоре: active=yes значит false»;
- «документ OpenAPI показывает параметры фильтра у обоих маршрутов, страницы — только у списка»;
- «не разбирает ни один id, ни список через запятую» — антипример `PropertySchema.Number` со списком из подводных камней.

## Подводные камни

- **Неизвестный параметр не ошибка.** Проверка оставляет только поля схемы, остальное молча выбрасывает (см. [`@aom-js/schemer`](../packages/schemer.md#schemervalidate)). Опечатка `?actve=true` вернёт весь список, а не 400. Счётчик по той же причине не замечает `?limit=abc`: параметра `limit` в его схемах нет.
- **`?active=yes` — это `false`, а не 400.** Приведение логического поля понимает `"true"`/`"false"`, а всё прочее превращает в число и затем в логическое: `"1"` — `true`, `"yes"` и `"abc"` — `false`. До проверки доходит уже правильный `boolean`, поэтому отказа нет. Клиентам стоит слать только `true`/`false`.
- **Список чисел через `PropertySchema.Number` не работает.** Встроенное приведение делает `Number(value)` со всем значением сразу и срабатывает раньше `TransformToArray()`: `?ids=1` превращается в `["1"]` и не проходит проверку числа, `?ids=1,2` — в `NaN`. Рабочий путь — строки с `pattern`, как в `query.ts`, и `Number` уже в условии.
- **Повтор и запятые вместе не смешиваются.** `TransformToArray()` разбирает запятые только в одиночной строке; массив от повтора он пропускает как есть. Поэтому `?ids=1,3&ids=5` даёт элемент `"1,3"` и 400.
- **Повтор строкового параметра склеивается.** `TransformTrim()` приводит значение к строке, и `?search=a&search=b` превращается в поиск по `"a,b"`, а не в 400.
- **Страницу проверяйте у обработчика списка, а не в общем шаге.** `QueryStringPager.Query` в `PrepareBaseQuery` заставил бы `/total` принимать `limit` и `offset`, которые на счёт не влияют.

Дальше — [авторизация и права](08-access.md): кто вызывает маршрут и что ему можно.
