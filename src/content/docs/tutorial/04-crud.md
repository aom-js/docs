---
title: "Ресурс из схемы данных"
sidebar:
  order: 4
---

Чаще всего API — это справочники: список записей, карточка одной записи, добавление, правка, удаление. К концу главы у нас будет справочник стран из шести маршрутов. Запись по id в нём загружается одним шагом, и карточка, правка и удаление берут её готовой. В конце главы — как вынести одинаковые шаги в общий контроллер, когда справочников много. Всё на странице — файлы каталога `examples/04-crud/`, тест `examples/04-crud/crud.test.ts` проходит весь цикл по HTTP.

| Маршрут | Что делает |
| --- | --- |
| `GET /countries` | список стран |
| `GET /countries/total` | число стран |
| `POST /countries` | добавить страну |
| `GET /countries/{countryId}` | карточка страны |
| `PATCH /countries/{countryId}` | изменить переданные поля |
| `DELETE /countries/{countryId}` | удалить страну |

## Из чего состоит ресурс

| Файл | Что в нём |
| --- | --- |
| `schemas.ts` | схемы записи и тел запросов |
| `store.ts` | хранилище в памяти — на месте таблиц базы |
| `params.ts` | id из пути |
| `body.ts` | тела запросов |
| `value.ts` | шаг, который загружает страну по id |
| `routes.ts` | маршруты: список и карточка |
| `router.ts` | дерево маршрутов и документ OpenAPI |
| `entity.ts`, `currencies.ts` | общий контроллер и второй справочник на нём — конец главы |

Файлы лежат в одном каталоге, чтобы глава читалась целиком; в приложении их раскладывают, как в [главе 2](02-structure.md).

## Схемы

```ts title="04-crud/schemas.ts"
import { ComponentSchema, PartialType, PropertySchema } from "@aom-js/schemer";

@ComponentSchema({ description: "Данные страны" })
export class CountryBodyDTO {
  @PropertySchema.String({ minLength: 1, maxLength: 64, description: "Название" })
  name!: string;

  @PropertySchema.String({ minLength: 2, maxLength: 2, description: "Код ISO 3166-1" })
  isoCode!: string;
}

// правка — те же поля, но все необязательные
@ComponentSchema({ description: "Правка страны" })
export class CountryPartialBodyDTO extends PartialType(CountryBodyDTO) {}

@ComponentSchema({ description: "Страна" })
export class CountryDTO extends CountryBodyDTO {
  @PropertySchema.String({ description: "Идентификатор" })
  id!: string;
}
```

Одна схема — три применения: `CountryBodyDTO` проверяет тело добавления, `CountryPartialBodyDTO` — тело правки (те же поля, все необязательные: `PartialType`), `CountryDTO` описывает запись в ответах. Имена классов становятся именами компонентов в документе OpenAPI. Схемы подробно — на странице [`@aom-js/schemer`](../packages/schemer.md#mapped-types), проверка тел глубже — в [главе 6](06-body.md).

## Хранилище

```ts title="04-crud/store.ts"
import { randomUUID } from "node:crypto";

import type { CurrencyDTO } from "./currencies";
import type { CountryDTO } from "./schemas";

// здесь были бы таблицы в базе; Map по id — чтобы пример запускался без неё
export const countries = new Map<string, CountryDTO>();
export const currencies = new Map<string, CurrencyDTO>();

/** Возвращает хранилище к исходным записям: тесты не зависят друг от друга. */
export function resetStore() {
  countries.clear();
  for (const [name, isoCode] of [["Россия", "RU"], ["Казахстан", "KZ"]]) {
    const id = randomUUID();
    countries.set(id, { id, name, isoCode });
  }
  currencies.clear();
  const id = randomUUID();
  currencies.set(id, { id, code: "RUB", name: "Российский рубль" });
}

resetStore();
```

`Map` по id стоит там, где в настоящем приложении таблица и ORM. `resetStore` нужен тестам: каждый начинает с исходных записей. Валюты понадобятся в конце главы.

## id из пути

```ts title="04-crud/params.ts"
import { Controller } from "@aom-js/router";
import { UUIDParam } from "@aom-js/api";

// `${CountryID}` в пути — сегмент `:countryId(<regexp UUID>)`
@Controller()
export class CountryID extends UUIDParam("countryId") {}
```

`UUIDParam("countryId")` — контроллер одного id. Подставленный в строку пути, он даёт сегмент с именем и регулярным выражением UUID, а его шаг `PathID` описывает параметр в OpenAPI и кладёт значение из адреса в `value`. Проверка формата здесь одна — сам маршрут: адрес с id другого вида не совпадёт ни с одним маршрутом ([`@aom-js/api`](../packages/api.md#idcontroller--uuidparam)).

## Тела запросов

```ts title="04-crud/body.ts"
import { Controller } from "@aom-js/router";
import { BodyBuilder } from "@aom-js/api";

import { CountryBodyDTO, CountryPartialBodyDTO } from "./schemas";

@Controller()
export class CountryBody extends BodyBuilder(CountryBodyDTO) {}

@Controller()
export class CountryBodyPartial extends BodyBuilder(CountryPartialBodyDTO) {}
```

`BodyBuilder(схема)` — билдер тела: его шаг `Body` проверяет JSON по схеме, кладёт результат в `body` и при ошибке отвечает 400; схема тела попадает в документ OpenAPI ([билдеры в `@aom-js/api`](../packages/api.md#билдеры-схема--контроллер)).

## Запись из адреса

```ts title="04-crud/value.ts"
import { Before, Controller, Middleware, Responses, This } from "@aom-js/router";
import { NotFoundResponse } from "@aom-js/api";

import { CountryID } from "./params";
import type { CountryDTO } from "./schemas";
import { countries } from "./store";

/** Значение одной страны — запись из адреса; объект один на запрос. */
@Controller()
export class CountryValue {
  value!: CountryDTO;

  /** Шаг-значение: id из пути → запись → 404, если её нет. */
  @Middleware()
  @Before(CountryID.PathID)
  @Responses(NotFoundResponse.JSONSchema())
  static async Init(@This() self: CountryValue, @This(CountryID) { value }: CountryID) {
    const country = countries.get(value); // здесь был бы запрос к базе по id
    if (!country) throw new NotFoundResponse("REFERENCES:COUNTRY_NOT_FOUND");
    self.value = country;
  }
}
```

Здесь впервые встречаются три понятия, на которых держатся все следующие главы:

- **Шаг** — статический метод с `@Middleware()`. Сам по себе маршрута он не создаёт: его ставят перед обработчиком через `@Before`. Шаг ничего не возвращает — отвечает обработчик.
- **`@Before(шаг)`** — выполнить шаг раньше. У `Init` это `CountryID.PathID`: сначала id из пути, потом поиск.
- **`@This(X)`** — объект класса `X` на этот запрос. Он создаётся один раз на класс и запрос, поэтому то, что `Init` положил в `CountryValue.value`, обработчик получит через `@This(CountryValue)`. `@This()` без аргумента — объект класса, которому принадлежит шаг.

Если записи нет, `Init` бросает `NotFoundResponse`, и обработчик не выполняется. Коды — как в [главе 3](03-responses.md#коды-сообщений), словаря в примерах нет: клиент видит код как есть. `@Responses` у шага описывает ответ 404 у каждого маршрута, куда шаг попал.

## Маршруты

```ts title="04-crud/routes.ts"
import { randomUUID } from "node:crypto";
import { Before, Bridge, Controller, Delete, Get, Patch, Post } from "@aom-js/router";
import { Responses, This, Title } from "@aom-js/router";
import { NumberResponse } from "@aom-js/api";

import { CountryBody, CountryBodyPartial } from "./body";
import { CountryID } from "./params";
import { CountryDTO } from "./schemas";
import { countries } from "./store";
import { CountryValue } from "./value";

const CountryResponse = { status: 200, schema: CountryDTO, description: "Страна" };

/** Одна страна: перед каждым обработчиком шаг `CountryValue.Init` загружает запись. */
@Controller()
@Before(CountryValue.Init)
export class Country {
  @Get("/")
  @Title("Информация о стране")
  @Responses(CountryResponse)
  static async Index(@This(CountryValue) { value }: CountryValue) {
    return value;
  }

  @Patch("/")
  @Title("Изменить страну")
  @Before(CountryBodyPartial.Body)
  @Responses(CountryResponse)
  static async Patch(
    @This(CountryValue) { value }: CountryValue,
    @This(CountryBodyPartial) { body }: CountryBodyPartial,
  ) {
    return Object.assign(value, body); // здесь было бы обновление в базе
  }

  @Delete("/")
  @Title("Удалить страну")
  @Responses(CountryResponse)
  static async Remove(@This(CountryValue) { value }: CountryValue) {
    countries.delete(value.id); // здесь было бы удаление из базы
    return value;
  }
}

@Controller()
@Bridge(`/${CountryID}`, Country)
export class Countries {
  @Get("/")
  @Title("Список стран")
  @Responses({ ...CountryResponse, isArray: true, description: "Список стран" })
  static async Index() {
    return [...countries.values()]; // здесь был бы запрос к базе
  }

  @Get("/total")
  @Title("Число стран")
  @Responses(NumberResponse.JSONSchema("Число стран"))
  static async Total() {
    return new NumberResponse(countries.size); // здесь был бы count-запрос
  }

  @Post("/")
  @Title("Добавить страну")
  @Before(CountryBody.Body)
  @Responses(CountryResponse)
  static async Add(@This(CountryBody) { body }: CountryBody) {
    const country = { ...body, id: randomUUID() };
    countries.set(country.id, country); // здесь была бы вставка в базу
    return country;
  }
}
```

`@Before(CountryValue.Init)` на классе `Country` ставит загрузку перед каждым его обработчиком. Поэтому карточка, правка и удаление получают запись готовой, а на несуществующий id все трое отвечают 404. Правка выполняется так:

1. `CountryValue.Init` — id из пути, запись, 404;
2. `CountryBodyPartial.Body` — проверка тела, 400;
3. обработчик `Patch` — переносит поля тела в запись и отвечает ею.

Шаг класса стоит раньше шагов обработчика, поэтому правка несуществующей записи с неверным телом отвечает 404, а не 400.

Карточка подключена мостом с параметром: `` @Bridge(`/${CountryID}`, Country) `` даёт обработчикам `Country` префикс `/countries/:countryId(…)`. Путь `/total` с ним не спорит — `total` не UUID. Схему ответа каждый обработчик описывает сам: `CountryResponse` — запись, тот же объект с `isArray: true` — список.

## Дерево маршрутов

```ts title="04-crud/router.ts"
import { Bridge, Controller, OpenApi, Router } from "@aom-js/router";

import { Currencies } from "./currencies";
import { Countries } from "./routes";

export const docs = new OpenApi({ title: "References API", version: "1.0.0" });

@Controller()
@Bridge("/countries", Countries)
@Bridge("/currencies", Currencies)
class Index {}

export const router = new Router(Index, docs);
```

Корень модуля и Swagger из [главы 1](01-first-service.md) здесь опущены, чтобы не отвлекать; документ OpenAPI собирается тем же `OpenApi`.

## Общий контроллер

Когда ресурсов много, одинаковые действия выносят в общий контроллер. Обработчики стран почти не зависят от стран: прочитать все записи, сосчитать, найти по id, создать. Их пишут один раз — шагами общего контроллера. Ресурс наследует его, задаёт своё хранилище и схему, а его маршруты только связывают готовые шаги. Глава показывает это на валютах; остальные главы пишут обработчики руками, как у стран.

```ts title="04-crud/entity.ts"
import { randomUUID } from "node:crypto";
import { Controller, DelayRefStack, Middleware, Nextpoint } from "@aom-js/router";
import { Responses, This, ThisRef, type OpenApiResponse, type RefFunction } from "@aom-js/router";
import { NotFoundResponse, NumberResponse, type ClassConstructor } from "@aom-js/api";

// ThisRef вызывает функцию с классом, через который подключён шаг. Тип RefFunction видит в нём
// любой класс, поэтому функцию с параметром «наш класс» приводим к RefFunction явно
const ListResponse = ThisRef(((ctor: typeof EntityController) => [
  Responses(ctor.JSONSchema(true)),
]) as RefFunction);

const ValueResponse = ThisRef(((ctor: typeof EntityController) => [
  Responses(ctor.JSONSchema()),
]) as RefFunction);

/**
 * Общий контроллер над хранилищем записей: наследник задаёт `store` и `schema`
 * и получает готовые шаги — список, счёт, 404, создание и ответ записью.
 */
@Controller()
export class EntityController<T extends { id: string } = { id: string }> {
  static store: Map<string, any>;

  static schema: ClassConstructor;

  value?: T;

  body: Partial<T> = {};

  @Nextpoint()
  @DelayRefStack(ListResponse)
  static async Data() {
    return [...this.store.values()]; // здесь был бы запрос к базе
  }

  @Nextpoint()
  @Responses(NumberResponse.JSONSchema("Число записей"))
  static async TotalCount() {
    return new NumberResponse(this.store.size); // здесь был бы count-запрос
  }

  /** Проверка значения: шаг загрузки положил в `value` пусто — ответ 404. */
  @Middleware()
  @Responses(NotFoundResponse.JSONSchema())
  static async Define(@This() self: EntityController) {
    if (!self.value) throw new NotFoundResponse("REFERENCES:RECORD_NOT_FOUND");
  }

  @Middleware()
  static async Create(@This() self: EntityController) {
    self.value = { ...self.body, id: randomUUID() };
    this.store.set(self.value.id, self.value); // здесь была бы вставка в базу
  }

  @Nextpoint()
  @DelayRefStack(ValueResponse)
  static async Value(@This() self: EntityController) {
    return self.value;
  }

  static JSONSchema(isArray = false): OpenApiResponse {
    return { status: 200, schema: this.schema, isArray, description: "Запись" };
  }
}
```

```ts title="04-crud/currencies.ts"
import { After, Before, Bridge, Controller, Get, Middleware, Next, Post, This, Title } from "@aom-js/router";
import { BodyBuilder, UUIDParam } from "@aom-js/api";
import { ComponentSchema, PropertySchema } from "@aom-js/schemer";

import { EntityController } from "./entity";
import { currencies } from "./store";

@ComponentSchema({ description: "Данные валюты" })
export class CurrencyBodyDTO {
  @PropertySchema.String({ minLength: 3, maxLength: 3, description: "Код ISO 4217" })
  code!: string;

  @PropertySchema.String({ minLength: 1, maxLength: 64, description: "Название" })
  name!: string;
}

@ComponentSchema({ description: "Валюта" })
export class CurrencyDTO extends CurrencyBodyDTO {
  @PropertySchema.String({ description: "Идентификатор" })
  id!: string;
}

@Controller()
export class CurrencyID extends UUIDParam("currencyId") {}

@Controller()
export class CurrencyBody extends BodyBuilder(CurrencyBodyDTO) {}

/** Общий контроллер, привязанный к валютам, и загрузка валюты по id. */
@Controller()
export class CurrencyValue extends EntityController<CurrencyDTO> {
  static store = currencies;

  static schema = CurrencyDTO;

  @Middleware()
  @Before(CurrencyID.PathID)
  @After(CurrencyValue.Define)
  static async Init(@This() self: CurrencyValue, @This(CurrencyID) { value }: CurrencyID) {
    self.value = this.store.get(value); // здесь был бы запрос к базе по id
  }
}

// маршруты только связывают готовые шаги
@Controller()
@Before(CurrencyValue.Init)
export class Currency {
  @Get("/")
  @Title("Информация о валюте")
  @Next(CurrencyValue.Value)
  static async Index() {}
}

@Controller()
@Bridge(`/${CurrencyID}`, Currency)
export class Currencies {
  @Get("/")
  @Title("Список валют")
  @Next(CurrencyValue.Data)
  static async Index() {}

  @Get("/total")
  @Title("Число валют")
  @Next(CurrencyValue.TotalCount)
  static async Total() {}

  @Post("/")
  @Title("Добавить валюту")
  @Before(CurrencyBody.Body)
  @After(CurrencyValue.Create)
  @Next(CurrencyValue.Value)
  static async Add(@This(CurrencyBody) { body }: CurrencyBody, @This(CurrencyValue) currency: CurrencyValue) {
    currency.body = body;
  }
}
```

Что нового по сравнению со странами:

- **`@Nextpoint()`** — шаг, который отвечает клиенту. Обработчик `Currencies.Index` пуст, а `@Next(CurrencyValue.Data)` передаёт ответ этому шагу. **`@After(шаг)`** — выполнить шаг после обработчика: у добавления обработчик кладёт тело в объект, `CurrencyValue.Create` сохраняет, `CurrencyValue.Value` отвечает.
- **`this` в шаге — класс, через который шаг подключён.** Маршрут пишет `CurrencyValue.Data`, и внутри `this.store` — хранилище валют. У другого наследника тот же шаг возьмёт своё хранилище.
- **Схема ответа — у наследника.** Базовый класс не знает схемы записи, поэтому `@Responses` у `Data` и `Value` отложены: `ThisRef` достаёт схему у класса, через который подключён шаг, а `@DelayRefStack` применяет декоратор при сборке маршрута. Так в документ попадает массив `CurrencyDTO`. Механизм — в справочнике [`@aom-js/router`](../packages/router.md#отложенные-ссылки-и-delayrefstack).
- **Загрузка по id та же:** `CurrencyValue.Init` берёт id из пути и кладёт запись в `value`, а 404 отвечает общий шаг `Define`, подключённый через `@After`.

## Проверка

```bash
curl http://localhost:3000/countries
curl -X POST http://localhost:3000/countries -H 'Content-Type: application/json' -d '{"name":"Беларусь","isoCode":"BY"}'
curl -X PATCH http://localhost:3000/countries/<id> -H 'Content-Type: application/json' -d '{"name":"Республика Беларусь"}'
curl -X DELETE http://localhost:3000/countries/<id>
```

Тест `examples/04-crud/crud.test.ts` проходит весь цикл: «GET /countries отдаёт список, GET /countries/total — число записей», «POST /countries добавляет страну, и она открывается карточкой», «PATCH /countries/{id} меняет только переданные поля», «DELETE /countries/{id} удаляет запись, после этого карточка отвечает 404». Отказы: «несуществующий id: карточка, правка и удаление отвечают 404 раньше проверки тела», «id не в формате UUID и косая черта в конце не подходят под маршрут: 404 от сервера», «тело не по схеме — 400, запись не создаётся и не меняется». Документ: «документ OpenAPI: у списка массив CountryDTO, у карточки параметр пути и ответы 200, 400, 404». Общий контроллер: «валюты собраны из готовых шагов: список, счёт, добавление, карточка и 404», «схему ответа общий шаг берёт у наследника: у списка валют массив CurrencyDTO».

## Подводные камни

- **Два разных 404.** Id верного формата, которого нет в хранилище, — ответ шага `Init`: `{"status":404,"message":"REFERENCES:COUNTRY_NOT_FOUND"}`. Id не того формата и `/countries/` с косой чертой в конце не совпадают ни с одним маршрутом — 404 отвечает сам сервер с кодом `AOM_API:PATH_NOT_FOUND`, и ни один шаг ресурса не выполняется.
- **`@This` объект не заполняет.** Обработчик, у которого перед собой нет `CountryValue.Init`, получит через `@This(CountryValue)` пустой объект: `value` заполняет только шаг (тест «без шага CountryValue.Init объект значения пуст: @This его не заполнит»). Подробно о жизни объекта класса — рецепт [`@This`, `@OnInstance` и жизненный цикл объекта класса](../cookbook/this-and-instances.md).
- **Общий шаг берут у наследника.** `@Next(EntityController.Data)` — шаг без хранилища и без схемы: роутер падает уже при сборке ошибкой `OPENAPI_SCHEMA_UNDEFINED_ERROR: response of EntityController.Data` — у шага нет схемы ответа (тест «шаг, взятый у самого общего контроллера, роняет сборку роутера: схемы ответа нет»). Пишите `CurrencyValue.Data`.

Дальше — [вложенные маршруты](05-nested-routes.md): что ещё можно повесить на `/countries/{countryId}/…` и как шаги делят общий контекст.
