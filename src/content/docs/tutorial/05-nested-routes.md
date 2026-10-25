---
title: "Вложенные маршруты"
sidebar:
  order: 5
---

Как сделать маршруты вида `/countries/{countryId}/cities/{cityId}`: страна из адреса загружается один раз и видна всем шагам маршрута, город ищется только внутри своей страны, на каждом уровне свой ответ `404`. Заодно — журнал запросов: один шаг в корне дерева пишет метод, путь, статус и длительность каждого запроса. Код — каталог `examples/05-nested-routes/`, тест `examples/05-nested-routes/nested-routes.test.ts` поднимает его на свободном порту.

## Из чего состоит пример

| Файл | Что в нём |
| --- | --- |
| `store.ts` | страны и города в памяти, счётчик чтений страны |
| `params.ts` | параметры пути: номер страны и номер города |
| `values.ts` | шаги «страна из адреса» и «город из адреса» |
| `cities.ts` | маршруты городов страны |
| `countries.ts` | маршруты стран, мост к городам |
| `log.ts` | приёмник журнала запросов |
| `router.ts` | корень дерева: журнал и мост к странам |

Итоговые маршруты:

```
GET /countries                             список стран
GET /countries/{countryId}                 страна
GET /countries/{countryId}/cities          города страны
GET /countries/{countryId}/cities/{cityId} город страны
```

## Данные

```ts title="05-nested-routes/store.ts"
export type Country = { id: number; name: string };
export type City = { id: number; countryId: number; name: string };

export const countries: Country[] = [
  { id: 1, name: "Франция" },
  { id: 2, name: "Япония" },
];

export const cities: City[] = [
  { id: 1, countryId: 1, name: "Париж" },
  { id: 2, countryId: 1, name: "Лион" },
  { id: 3, countryId: 2, name: "Токио" },
];

// сколько раз страну читали из «базы»: тест сверяет, что за запрос — один раз
export const reads = { countries: 0 };

export function findCountry(id: number) {
  reads.countries++;
  return countries.find((country) => country.id === id); // здесь был бы запрос к базе
}
```

В настоящем приложении здесь была бы база; `findCountry` — то место, где стоял бы запрос. Счётчик `reads` нужен только тесту: по нему видно, сколько раз за запрос страну читали из «базы».

## Параметры пути

```ts title="05-nested-routes/params.ts"
import { NumberIDParam } from "@aom-js/api";
import { Controller } from "@aom-js/router";

// сегменты пути: `${CountryID}` в шаблоне маршрута превращается в `:countryId(...)`
@Controller()
export class CountryID extends NumberIDParam("countryId") {}

@Controller()
export class CityID extends NumberIDParam("cityId") {}
```

`NumberIDParam("countryId")` из `@aom-js/api` даёт класс параметра. В шаблоне маршрута он превращается в сегмент с проверкой формата: `` `/${CountryID}` `` — это `/:countryId([0-9]{1,12})`. Адрес, который не подходит под формат (`/countries/abc`), до шагов маршрута не доходит: сервер отвечает `404` «путь не найден». Шаг `CountryID.PathID` кладёт значение из адреса в поле `value` объекта `CountryID` и описывает параметр в документе OpenAPI. Подробнее — [`@aom-js/api`](../packages/api.md#idcontroller--uuidparam).

## Значение из адреса

```ts title="05-nested-routes/values.ts"
import { NotFoundResponse } from "@aom-js/api";
import { Before, Controller, Middleware, Responses, This } from "@aom-js/router";

import { CityID, CountryID } from "./params";
import { cities, type City, type Country, findCountry } from "./store";

/** Страна из адреса: один объект на запрос, его видят все шаги маршрута через `@This(CountryValue)`. */
@Controller()
export class CountryValue {
  value: Country;

  @Middleware()
  @Before(CountryID.PathID)
  @Responses(NotFoundResponse.JSONSchema())
  static async Init(@This() self: CountryValue, @This(CountryID) { value }: CountryID) {
    const country = findCountry(Number(value));
    if (!country) throw new NotFoundResponse("REFERENCES:COUNTRY_NOT_FOUND");
    self.value = country;
  }
}

/** Город из адреса — только среди городов страны, уже найденной выше по маршруту. */
@Controller()
export class CityValue {
  value: City;

  @Middleware()
  @Before(CityID.PathID)
  @Responses(NotFoundResponse.JSONSchema())
  static async Init(
    @This() self: CityValue,
    @This(CityID) { value }: CityID,
    @This(CountryValue) { value: country }: CountryValue,
  ) {
    // условие на страну обязательно: без него /countries/2/cities/1 отдал бы Париж «как японский»
    const city = cities.find((c) => c.id === Number(value) && c.countryId === country.id);
    if (!city) throw new NotFoundResponse("REFERENCES:CITY_NOT_FOUND");
    self.value = city;
  }
}
```

`CountryValue.Init` — составной шаг: сначала `@Before(CountryID.PathID)` достаёт номер из адреса, затем сам `Init` ищет страну и отвечает `404`, если её нет. `@Responses` добавляет этот ответ в документ всех маршрутов, где шаг стоит.

Страна загружается один раз: `@This(CountryValue)` — объект класса на этот запрос ([глава 4](04-crud.md#запись-из-адреса)), поэтому `CityValue.Init` и `City.Index` получают тот же объект, который заполнил `Init`, и не ищут страну заново.

`CityValue.Init` ищет город с условием на страну из адреса. Это и есть изоляция дочернего ресурса: город чужой страны неотличим от несуществующего — тот же `404`.

## Дерево маршрутов

```ts title="05-nested-routes/cities.ts"
import { Before, Bridge, Controller, Get, MergeNextTags, Middleware, This, Title, UseTag } from "@aom-js/router";

import { CityID } from "./params";
import { cities } from "./store";
import { CityValue, CountryValue } from "./values";

@Controller()
@Before(CityValue.Init)
export class City {
  @Get("/")
  @Title("Город")
  static async Index(
    @This(CityValue) { value: city }: CityValue,
    @This(CountryValue) { value: country }: CountryValue,
  ) {
    return { ...city, country: country.name };
  }
}

@Controller()
@Title("Города")
@Before(Cities.Setup)
@Bridge(`/${CityID}`, City)
export class Cities {
  // тег «Города» дописывается к тегу родителя: в документе — «Страны > Города»
  @Middleware()
  @UseTag(Cities)
  @MergeNextTags()
  static async Setup() {}

  @Get("/")
  @Title("Города страны")
  static async Index(@This(CountryValue) { value: country }: CountryValue) {
    return cities.filter((city) => city.countryId === country.id); // здесь был бы запрос к базе
  }
}
```

```ts title="05-nested-routes/countries.ts"
import { Before, Bridge, Controller, Get, Middleware, This, Title, UseTag } from "@aom-js/router";

import { Cities } from "./cities";
import { CountryID } from "./params";
import { countries } from "./store";
import { CountryValue } from "./values";

// классовый @Before уходит во все мосты класса: страна найдена и для /cities, и для /cities/{cityId}
@Controller()
@Before(CountryValue.Init)
@Bridge("/cities", Cities)
export class Country {
  @Get("/")
  @Title("Страна")
  static async Index(@This(CountryValue) { value }: CountryValue) {
    return value;
  }
}

@Controller()
@Title("Страны")
@Before(Countries.Setup)
@Bridge(`/${CountryID}`, Country)
export class Countries {
  @Middleware()
  @UseTag(Countries)
  static async Setup() {}

  @Get("/")
  @Title("Список стран")
  static async Index() {
    return countries; // здесь был бы запрос к базе
  }
}
```

Главное здесь — `@Before(CountryValue.Init)` на классе `Country`. Классовый `@Before` получают не только маршруты самого класса, но и все маршруты его мостов: `GET /countries/{countryId}/cities` и `GET /countries/{countryId}/cities/{cityId}` начинаются с поиска страны так же, как `GET /countries/{countryId}`. Так же `City` получает `CityValue.Init`. Порядок шагов одного маршрута фиксирован:

```
классовые @Before → классовые @After → методные @Before → обработчик → методные @After
```

и классовые `@Before` родителей идут раньше классовых `@Before` потомков. Для `GET /countries/1/cities/2` выходит: `Logger.Init` → `Countries.Setup` → `CountryID.PathID` (с его внутренними шагами) → `CountryValue.Init` → `Cities.Setup` → `CityID.PathID` → `CityValue.Init` → `City.Index`. Подробно — [`@aom-js/router`](../packages/router.md#раскладка-курсоров-и-порядок-исполнения-plain).

Шаги `Setup` пустые: они только несут тег раздела документа. `@UseTag` ставится на шаг (на метод, а не на класс), имя тега берётся из `@Title` класса. Тег потомка по умолчанию заменяет тег родителя; `@MergeNextTags()` рядом с `@UseTag` дописывает его: операции городов попадают в раздел «Страны > Города». Режим слияния действует и дальше вниз по цепочке: теги ниже по маршруту тоже дописываются, даже без своего `@MergeNextTags()`. Сам `@MergeNextTags()`, как и `@IgnoreNextTags()` и `@ReplaceNextTags()`, можно поставить и на шаг без своего `@UseTag` ([`@aom-js/router`](../packages/router.md#сборка-openapi-openapiregisterpath)).

Файлы разложены так, чтобы импорты шли в одну сторону: `countries.ts` → `cities.ts` → `values.ts` → `params.ts`. Шаги значений вынесены в `values.ts`, потому что их берут оба уровня; держи их `countries.ts` — `cities.ts` импортировал бы его, а он `cities.ts`: циклический импорт.

## Журнал запросов

```ts title="05-nested-routes/log.ts"
import { Logger } from "@aom-js/api";

/** Снимок записи: объект `Logger` один на запрос и меняется после записи, а в его поле `route` — весь маршрут. */
export const entry = ({ route, status, duration }: Logger) => ({
  method: route.method,
  path: route.path,
  status,
  duration,
});

export const journal: (ReturnType<typeof entry> & { message: string })[] = [];

const write = (message: string, log: Logger) => journal.push({ message, ...entry(log) });

// приёмник журнала: в примере — массив, его читает тест
Logger.ENGINE = { info: write, warn: write, error: write, debug: write, log: write };
```

```ts title="05-nested-routes/router.ts"
import { Logger } from "@aom-js/api";
import { Before, Bridge, Controller, OpenApi, Router } from "@aom-js/router";

import { Countries } from "./countries";
import "./log";

export const docs = new OpenApi({ title: "Countries API", version: "1.0.0" });

// журнал — первый шаг корня: он есть у каждого маршрута дерева
@Controller()
@Before(Logger.Init)
@Bridge("/countries", Countries)
class Index {}

export const router = new Router(Index, docs);
```

Журнал — готовый шаг ядра `Logger.Init` из `@aom-js/api`. Он стоит классовым `@Before` у корня, значит, есть у каждого маршрута дерева. На каждый запрос создаётся свой объект `Logger`: время начала, маршрут, а когда ответ ушёл — статус и длительность. Записи `Logger` отдаёт в `Logger.ENGINE` — объект с методами `info`, `warn`, `error`, `debug`, `log`; по умолчанию это `console`, в примере — функция `write`, которая складывает записи в массив. Записей на запрос две:

| Сообщение | Когда | Уровень |
| --- | --- | --- |
| `Logger initiated:` | шаг `Init` выполнился | `info` |
| `Request success:` / `Request rejected:` / `Request error:` | ответ ушёл, статус 1xx–3xx / 4xx / 5xx | `info` / `warn` / `error` |

Путь в записи — шаблон маршрута (`/countries/:countryId([0-9]{1,12})/cities/:cityId([0-9]{1,12})`), а не адрес запроса: записи одного маршрута легко собрать вместе. Метод — в нижнем регистре, как его хранит маршрут. Порядок записи и уровни — [`@aom-js/api`](../packages/api.md#logger).

`Logger.ENGINE` — одно значение на весь процесс; его задают до первого запроса. Здесь это делает импорт `./log` в `router.ts`.

Ядро зовёт приёмник как `info(сообщение, объект Logger)`. `pino` и `winston` подставить как есть нельзя: `pino` ждёт `(поля, сообщение)`, а сам объект `Logger` в запись не годится — в его поле `route` весь маршрут, и после записи объект ещё меняется. Нужен адаптер, как `write`: он переставляет аргументы и передаёт снимок `entry`. Для `pino` — в `log.ts` вместо `write` и массива:

```ts
import pino from "pino";

const pinoLogger = pino();
const to = (level: "info" | "warn" | "error" | "debug") => (message: string, log: Logger) =>
  pinoLogger[level](entry(log), message);

Logger.ENGINE = { info: to("info"), warn: to("warn"), error: to("error"), debug: to("debug"), log: to("info") };
```

Для `winston` порядок обычный — сообщение, затем поля: `(message, log) => winstonLogger[level](message, entry(log))`. Этот набросок тестом примера не проверяется: в примере нет ни `pino`, ни `winston`.

## Проверка

```bash
curl http://localhost:3000/countries/1/cities/2   # {"id":2,"countryId":1,"name":"Лион","country":"Франция"}
curl http://localhost:3000/countries/1/cities/3   # 404 {"message":"REFERENCES:CITY_NOT_FOUND","status":404}
curl http://localhost:3000/countries/9/cities     # 404 {"message":"REFERENCES:COUNTRY_NOT_FOUND","status":404}
```

Тест `examples/05-nested-routes/nested-routes.test.ts` проверяет пути («страна, её города и город страны доступны по вложенным путям»), отказы на обоих уровнях («нет страны — 404 и у неё, и у всех её дочерних маршрутов», «город чужой страны — 404, как несуществующий»), одно чтение страны («страна читается один раз за запрос, даже когда её берут несколько шагов»), журнал («журнал пишет метод, шаблон пути, статус и длительность каждого запроса», «запрос мимо маршрутов — 404 без записи в журнале») и документ OpenAPI («документ: параметры пути по родителю и потомку, тег потомка дописан к тегу родителя»). Подводные камни ниже проверяет тот же тест на отдельном дереве с ошибками («классовый @After у родителя: сам маршрут работает, у дочерних — 500», «шаг родителя, повторённый у потомка, выполняется дважды», «теги: без @MergeNextTags тег заменяет предыдущий, после него дописываются и следующие»).

## Подводные камни

- **Классовый `@After` вместо `@Before` у родителя.** Классовый `@After` получают только маршруты самого класса, в мосты он не уходит. С `@After(CountryValue.Init)` на `Country` маршрут `GET /countries/{countryId}` работает, а у городов `Init` не выполняется вовсе: `@This(CountryValue)` отдаёт пустой объект, `country.id` падает, и клиент получает `500` вместо списка или `404`.
- **Повтор шага родителя у потомка.** Шаги не склеиваются: если поставить `@Before(CountryValue.Init)` ещё и на `City`, страна будет искаться дважды за запрос. Объект тот же, но запрос к базе — второй. Шаг родителя ставится один раз, на уровне, с которого начинаются все нуждающиеся в нём маршруты.
- **Ищите дочернюю запись с условием на родителя.** Номер страны в пути сам ничего не ограничивает: без `c.countryId === country.id` в поиске город нашёлся бы по адресу любой страны. Условие на родителя ставьте в тот же запрос, что и поиск записи.
- **Сохраняйте снимок, а не объект `Logger`.** Объект один на запрос, и статус с длительностью записываются в него же, когда ответ ушёл. Приёмник, который держит ссылку на объект, читает его уже другим, чем в момент записи; поэтому `log.ts` копирует поля через `entry`.
- **Запросы мимо маршрутов в журнал не попадают.** `Logger.Init` — шаг маршрута: если адрес не подошёл ни под один шаблон, шагов нет и записи нет. Такие ответы видно только в журнале прокси перед сервисом, если он есть.
- **В тестах ждите итоговую запись.** Запись со статусом появляется по событию `finish` ответа, которое может прийти чуть позже, чем клиент прочёл тело. Тест ждёт её через `vi.waitFor`, а отсутствие записи доказывает следующим запросом: после него в журнале только его записи.

Дальше — [проверка входящих данных](06-body.md): тело запроса по схеме, обязательные поля и частичная правка.
