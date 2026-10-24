---
title: "Проверка входящих данных"
sidebar:
  order: 6
---

Как проверить тело запроса по схеме до того, как до него дойдёт обработчик. К концу главы у сервиса есть создание страны с обязательными полями, частичная правка, где можно прислать любые поля, и создание страны вместе с городами одним составным телом. Неверное тело получает ответ 400 с именем поля и причиной, лишние поля отбрасываются, пробелы по краям строк обрезаются, а схема каждого тела видна в документе OpenAPI. Всё на этой странице — файлы каталога `examples/06-body/`, тест `examples/06-body/body.test.ts` поднимает их на свободном порту и ходит в них по HTTP.

## Как устроена проверка

Проверка складывается из трёх частей:

1. **Схема тела** — класс с `@ComponentSchema()`, поля описаны фабриками `PropertySchema.*` из `@aom-js/schemer`. Одна фабрика даёт сразу и проверку поля, и его описание в OpenAPI.
2. **Билдер** — `BodyBuilder(схема)` из `@aom-js/api` строит контроллер с готовым шагом `Body`: шаг читает тело, переводит его в экземпляр схемы, проверяет и кладёт результат в поле `body` экземпляра контроллера.
3. **Маршрут** подключает шаг через `@Before(XBody.Body)` и берёт проверенное тело из `@This(XBody)`.

Если проверка не прошла, шаг бросает `WrongDataResponse` — клиент получает 400, обработчик не вызывается. Поля, у которых в схеме нет ни одной проверки, из результата удаляются: так отбрасывается всё лишнее, что прислал клиент. Подробно — [`@aom-js/api`](../packages/api.md#билдеры-схема--контроллер) §«Билдеры: схема → контроллер» и [`@aom-js/schemer`](../packages/schemer.md#schemervalidate) §«`Schemer.validate`».

## Схемы

```ts title="06-body/schemas.ts"
import { ComponentSchema, PartialType, PickType, PropertySchema } from "@aom-js/schemer";
import { Transform } from "class-transformer";
import { IsDefined } from "class-validator";

// обрезает только строки: число или null остаются как есть, и проверка типа их отвергнет
const Trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));

/** Страна в хранилище — то, что отдаёт API. */
@ComponentSchema({ description: "Страна" })
export class Country {
  @PropertySchema.String({ readOnly: true, description: "ID" })
  id!: string;

  // обрезка — в decorators: так её унаследуют тела из PickType и PartialType
  @PropertySchema.String({ minLength: 1, maxLength: 64, decorators: [Trim()], description: "Название" })
  name!: string;

  @PropertySchema.String({ minLength: 2, maxLength: 2, decorators: [Trim()], description: "Код ISO 3166" })
  isoCode!: string;

  @PropertySchema.Boolean({ isOptional: true, description: "Показывать в списках" })
  enabled?: boolean;
}

/** Город в хранилище. */
@ComponentSchema({ description: "Город" })
export class City {
  @PropertySchema.String({ readOnly: true, description: "ID" })
  id!: string;

  @PropertySchema.String({ readOnly: true, description: "ID страны" })
  countryId!: string;

  @PropertySchema.String({ minLength: 1, maxLength: 64, decorators: [Trim()], description: "Название" })
  name!: string;

  @PropertySchema.Number({ minValue: 0, isOptional: true, description: "Население" })
  population?: number;
}

// тела запросов собираются из схем хранилища, а не переписываются: id задаёт сервер, клиенту его не передать
@ComponentSchema({ description: "Новая страна" })
export class CountryBodyDTO extends PickType(Country, ["name", "isoCode", "enabled"]) {}

@ComponentSchema({ description: "Правка страны: любые поля новой страны" })
export class CountryPartialBodyDTO extends PartialType(CountryBodyDTO) {}

@ComponentSchema({ description: "Новый город" })
export class CityBodyDTO extends PickType(City, ["name", "population"]) {}

/** Составное тело: страна и её города, каждая часть — по своей схеме. */
@ComponentSchema({ description: "Страна вместе с городами" })
export class CountryWithCitiesDTO {
  // без IsDefined вложенное поле можно не прислать вовсе: ValidateNested пропускает undefined
  @PropertySchema.Type({ value: () => CountryBodyDTO, decorators: [IsDefined()], description: "Страна" })
  country!: CountryBodyDTO;

  @PropertySchema.Type({
    value: () => CityBodyDTO,
    isArray: true,
    decorators: [IsDefined()],
    description: "Города",
  })
  cities!: CityBodyDTO[];
}
```

`Country` и `City` — то, что лежит в хранилище и уходит в ответах. Тела запросов из них не переписываются заново, а собираются:

- `PickType(Country, [...])` берёт нужные поля вместе с их проверками. `id` в списке нет: его задаёт сервер, и прислать его клиент не сможет — поле просто отбросится.
- `PartialType(CountryBodyDTO)` делает все поля необязательными, но присланные проверяет по тем же правилам. Это тело частичной правки.
- `CountryWithCitiesDTO` — составное тело: каждая его часть описана своей схемой через `PropertySchema.Type`. `isArray: true` — массив, каждый элемент которого проверяется по `CityBodyDTO`.

Результат `PickType`/`PartialType` оборачивается в именованный класс со своим `@ComponentSchema()`: имя класса становится именем схемы в OpenAPI. Подробно о сборке тел — [`@aom-js/schemer`](../packages/schemer.md#mapped-types) §«Mapped-types».

Обрезка пробелов и `IsDefined` переданы в параметр `decorators`, а не повешены рядом отдельными декораторами: `PickType` и `PartialType` пересобирают поля из параметров фабрики, и только то, что лежит в них, попадает в новые схемы.

## Тела

```ts title="06-body/body.ts"
import { BodyBuilder } from "@aom-js/api";
import { Controller } from "@aom-js/router";

import { CountryBodyDTO, CountryPartialBodyDTO, CountryWithCitiesDTO } from "./schemas";

@Controller()
export class CountryBody extends BodyBuilder(CountryBodyDTO) {}

@Controller()
export class CountryBodyPartial extends BodyBuilder(CountryPartialBodyDTO) {}

@Controller()
export class CountryWithCitiesBody extends BodyBuilder(CountryWithCitiesDTO) {}
```

Каждое тело — отдельный контроллер со своим `@Controller()`. Схема, описание для OpenAPI и ответ 400 у шага `Body` уже есть — подключать их вручную не нужно.

## Хранилище

```ts title="06-body/store.ts"
import type { City, Country } from "./schemas";

// здесь была бы база: таблицы стран и городов вместо массивов
export const store = { countries: [] as Country[], cities: [] as City[] };

export function resetStore() {
  store.countries.length = 0;
  store.cities.length = 0;
}
```

## Идентификатор в адресе

```ts title="06-body/params.ts"
import { UUIDParam } from "@aom-js/api";
import { Controller } from "@aom-js/router";

@Controller()
export class CountryID extends UUIDParam("countryId") {}
```

`UUIDParam("countryId")` даёт сегмент адреса `:countryId` с шаблоном UUID и шаг `PathID`, который кладёт значение из адреса в поле `value`. Класс параметра стоит в пути моста к карточке, как в [главе о ресурсе](04-crud.md).

## Страна из адреса

```ts title="06-body/values.ts"
import { NotFoundResponse } from "@aom-js/api";
import { Before, Controller, Middleware, Responses, This } from "@aom-js/router";

import { CountryID } from "./params";
import type { Country } from "./schemas";
import { store } from "./store";

/** Страна из адреса: загружается до проверки тела, поэтому неизвестная страна получает 404 раньше 400. */
@Controller()
export class CountryValue {
  value: Country;

  @Middleware()
  @Before(CountryID.PathID)
  @Responses(NotFoundResponse.JSONSchema())
  static async Init(@This() self: CountryValue, @This(CountryID) { value }: CountryID) {
    const country = store.countries.find((item) => item.id === value);
    if (!country) throw new NotFoundResponse("REFERENCES:COUNTRY_NOT_FOUND");
    self.value = country;
  }
}
```

Запись ищет отдельный шаг `CountryValue.Init`, а не обработчик. Карточка подключает его классовым `@Before`, и он выполняется раньше шага тела. Поэтому правка неизвестной страны получает 404, даже если тело неверное: проверять тело записи, которой нет, незачем. Подробнее о значениях из пути — в [главе о вложенных маршрутах](05-nested-routes.md).

## Маршруты

```ts title="06-body/countries.ts"
import { randomUUID } from "node:crypto";
import { WrongDataResponse } from "@aom-js/api";
import { Before, Bridge, Controller, Patch, Post, This, Title } from "@aom-js/router";

import { CountryBody, CountryBodyPartial, CountryWithCitiesBody } from "./body";
import { CountryID } from "./params";
import { store } from "./store";
import { CountryValue } from "./values";

@Controller()
@Before(CountryValue.Init)
export class Country {
  @Patch("/")
  @Title("Изменить страну")
  @Before(CountryBodyPartial.Body)
  static async Update(
    @This(CountryValue) { value }: CountryValue,
    @This(CountryBodyPartial) { body }: CountryBodyPartial,
  ) {
    // необязательное поле пропускает и null, а стирать обязательные поля правкой нельзя
    const erased = Object.keys(body).filter((key) => body[key as keyof typeof body] === null);
    if (erased.length) throw new WrongDataResponse("REFERENCES:COUNTRY_REQUIRED_FIELDS", erased);
    // в теле только присланные поля: остальные остаются как были
    return Object.assign(value, body);
  }
}

@Controller()
@Bridge(`/${CountryID}`, Country)
export class Countries {
  @Post("/")
  @Title("Добавить страну")
  @Before(CountryBody.Body)
  static async Add(@This(CountryBody) { body }: CountryBody) {
    const country = { id: randomUUID(), enabled: true, ...body };
    store.countries.push(country);
    return country;
  }

  @Post("/with-cities")
  @Title("Добавить страну с городами")
  @Before(CountryWithCitiesBody.Body)
  static async AddWithCities(@This(CountryWithCitiesBody) { body }: CountryWithCitiesBody) {
    // тело проверено целиком до первой записи: ошибка в любом городе — и не записано ничего
    const country = { id: randomUUID(), enabled: true, ...body.country };
    const cities = body.cities.map((city) => ({ id: randomUUID(), countryId: country.id, ...city }));
    store.countries.push(country);
    store.cities.push(...cities);
    return { ...country, cities };
  }
}
```

- **Создание** (`POST /countries`) получает тело, где обязательные поля уже на месте и проверены; обработчику остаётся дописать `id` и значение по умолчанию.
- **Правка** (`PATCH /countries/{countryId}`) — обработчик карточки `Country`. К нему приходят уже найденная страна и только присланные поля, поэтому `Object.assign` не трогает остальные. Одна проверка всё же остаётся обработчику: необязательное поле пропускает `null`, и без неё `{"name": null}` стёр бы название.
- **Составное тело** (`POST /countries/with-cities`) проверяется целиком до обработчика. Если неверен хоть один город, обработчик не вызывается и в хранилище не попадает ни страна, ни города. Так и стоит строить сложные операции: сначала полная проверка, потом запись.

## Роутер

```ts title="06-body/router.ts"
import { Bridge, Controller, OpenApi, Router } from "@aom-js/router";

import { Countries } from "./countries";

export const docs = new OpenApi({ title: "Countries API", version: "1.0.0" });

@Controller()
@Bridge("/countries", Countries)
class Index {}

export const router = new Router(Index, docs);
```

В документе `docs` у каждого маршрута есть `requestBody` со ссылкой на схему тела (`#/components/schemas/CountryBodyDTO` и т.д.) и ответ 400. Как отдать документ по `GET /openapi.json` — в [первой главе](01-first-service.md).

## Как выглядит ошибка

Ответ на `POST /countries` без `isoCode`:

```json
{
  "message": "AOM_API:ERROR_WRONG_DATA",
  "status": 400,
  "data": [
    {
      "target": { "name": "Франция" },
      "property": "isoCode",
      "children": [],
      "constraints": {
        "minLength": "isoCode must be longer than or equal to 2 characters",
        "maxLength": "isoCode must be shorter than or equal to 2 characters",
        "isString": "isoCode must be a string"
      }
    }
  ]
}
```

`data` — список ошибок class-validator: `property` — поле, `constraints` — какие правила нарушены. Ошибка во вложенной части приходит деревом через `children`: для неверного населения второго города путь такой — `cities` → `1` → `population`.

## Проверка

```bash
curl -X POST localhost:3000/countries -H 'content-type: application/json' \
  -d '{"name": "  Россия ", "isoCode": "RU", "id": "hack"}'
# {"id":"<uuid>","enabled":true,"name":"Россия","isoCode":"RU"}
curl -X POST localhost:3000/countries -H 'content-type: application/json' -d '{"name": "Франция"}'
# 400, data[0].property = "isoCode"
```

Тест `examples/06-body/body.test.ts` проверяет:

- создание: «POST /countries создаёт страну: строки обрезаны, лишние поля и чужой id отброшены», «без обязательного поля — 400 с именем поля, в хранилище ничего», «неверный тип или длина — 400; строка из пробелов после обрезки пуста»;
- частичную правку: «PATCH меняет только присланные поля», «PATCH проверяет присланные поля по той же схеме», «PATCH не даёт стереть обязательное поле через null», «PATCH неизвестной страны — 404 раньше проверки тела»;
- составное тело: «страна и города проверяются каждый по своей схеме и записываются вместе», «ошибка в одном городе — 400 с путём до поля, не записано ничего», «без вложенной части — 400»;
- подводные камни ниже: «строка вместо булева не даёт 400: ядро приводит её к boolean», «TransformTrim из ядра делает строкой что угодно, и проверка типа не срабатывает», «PropertySchema.Type без IsDefined пропускает тело без вложенной части, хотя в схеме она required», «mapped-type прямо в BodyBuilder: схемы получают одно служебное имя, в документе остаётся первая», «декоратор рядом с PropertySchema, а не в decorators, PartialType теряет»;
- документ: «схемы тел — в документе OpenAPI».

После каждого теста хранилище сбрасывается (`resetStore`), чтобы тесты не зависели от порядка.

## Подводные камни

- **`TransformTrim` из `@aom-js/api` делает строкой что угодно.** Он вызывает `String(value).trim()`: число `123` становится `"123"`, `null` — строкой `"null"`, и проверка типа после него уже не срабатывает. Поэтому в теле запроса нужна своя обрезка `Trim`, которая трогает только строки.
- **Булево приводится до проверки.** `PropertySchema.Boolean` понимает `"true"` и `"false"`, а другую строку переводит в булево через число: `"yes"` даёт `false`, а не 400.
- **`PropertySchema.Type` без `isOptional` не требует поле.** В схеме OpenAPI оно в списке `required`, но тело без него проверку проходит, и обработчик получает `undefined`. Нужен `IsDefined()` в `decorators`, как в `CountryWithCitiesDTO`.
- **`PartialType` пропускает `null`.** Он делает поля необязательными через `isOptional`, а необязательное поле в class-validator принимает и `undefined`, и `null`. Если поле нельзя стирать, проверьте это в обработчике, как в `Country.Update`.
- **Декоратор рядом с `PropertySchema` теряется в `PickType`/`PartialType`.** Они переносят только параметры фабрики. `@Transform(...)` над полем работает в исходной схеме и молча пропадает в производной — дополнительные проверки и преобразования передавайте через `decorators`.
- **Mapped-type прямо в `BodyBuilder`.** `BodyBuilder(PartialType(CountryBodyDTO))` проверяет тело верно, но в OpenAPI схема получит служебное имя `PartialClassType`, общее для всех таких классов, и из нескольких таких схем в документе останется только первая. Оборачивайте в именованный класс — [`@aom-js/schemer`](../packages/schemer.md#ограничения) §«Ограничения».

Дальше — [поиск и фильтры](07-search.md): строка запроса по схеме, фильтры и постраничный список.
