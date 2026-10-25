---
title: "Общий раздел для разных ресурсов"
sidebar:
  order: 10
---

Как сделать раздел, который одинаково работает у нескольких ресурсов, — например, переводы названия у страны и у города. Маршруты и обработчики раздела объявлены один раз, в базовом классе. Наследник маршрутов не повторяет: он перегружает только шаги-пустышки — установочный («чья это запись») и свою проверку («можно ли сейчас писать»). В базе пустышка бросает ошибку, поэтому забытая перегрузка не проходит незаметно. Код — каталог `examples/10-shared-routes/`, тест `examples/10-shared-routes/shared-routes.test.ts` поднимает его на свободном порту.

В [главе 4](04-crud.md#общий-контроллер) общий контроллер давал готовые шаги, а маршруты каждый ресурс писал сам. Здесь наоборот: маршруты общие, а ресурс даёт шаги. Так удобно, когда у ресурсов один и тот же набор маршрутов, а различаются они только тем, откуда взять запись и какие у неё правила.

## Из чего состоит пример

| Файл | Что в нём |
| --- | --- |
| `store.ts` | страны и города в памяти, у каждой записи — переводы её названия |
| `params.ts` | параметры пути: номер страны и номер города |
| `values.ts` | шаги «страна из адреса» и «город из адреса» |
| `translations.ts` | общий раздел переводов: схема тела, пустышки, маршруты |
| `countries.ts` | переводы страны — наследник раздела, мосты страны |
| `cities.ts` | переводы города — наследник раздела, мосты города |
| `router.ts` | корень дерева |

Итоговые маршруты:

```
GET  /countries/{countryId}/translations                   переводы страны
POST /countries/{countryId}/translations                   добавить перевод страны
GET  /countries/{countryId}/cities/{cityId}/translations   переводы города
POST /countries/{countryId}/cities/{cityId}/translations   добавить перевод города
```

## Данные

```ts title="10-shared-routes/store.ts"
export type Translation = { locale: string; name: string };
export type Country = { id: number; name: string; archived: boolean; translations: Translation[] };
export type City = { id: number; countryId: number; name: string; translations: Translation[] };

// здесь была бы база: таблицы стран, городов и переводов их названий
export const countries: Country[] = [];
export const cities: City[] = [];

export function resetStore() {
  countries.splice(0, countries.length,
    { id: 1, name: "Франция", archived: false, translations: [{ locale: "en", name: "France" }] },
    { id: 2, name: "Византия", archived: true, translations: [] },
  );
  cities.splice(0, cities.length,
    { id: 1, countryId: 1, name: "Париж", translations: [{ locale: "en", name: "Paris" }] },
    { id: 2, countryId: 2, name: "Константинополь", translations: [] },
  );
}

resetStore();
```

Вторая страна в архиве: на ней пример покажет проверку, которая есть только у стран.

## Страна и город из адреса

Параметры пути и шаги загрузки — те же, что в [главе о вложенных маршрутах](05-nested-routes.md#значение-из-адреса), только без счётчика чтений.

```ts title="10-shared-routes/params.ts"
import { NumberIDParam } from "@aom-js/api";
import { Controller } from "@aom-js/router";

@Controller()
export class CountryID extends NumberIDParam("countryId") {}

@Controller()
export class CityID extends NumberIDParam("cityId") {}
```

```ts title="10-shared-routes/values.ts"
import { NotFoundResponse } from "@aom-js/api";
import { Before, Controller, Middleware, Responses, This } from "@aom-js/router";

import { CityID, CountryID } from "./params";
import { cities, countries, type City, type Country } from "./store";

/** Страна из адреса — как в главе о вложенных маршрутах. */
@Controller()
export class CountryValue {
  value: Country;

  @Middleware()
  @Before(CountryID.PathID)
  @Responses(NotFoundResponse.JSONSchema())
  static async Init(@This() self: CountryValue, @This(CountryID) { value }: CountryID) {
    const country = countries.find((c) => c.id === Number(value)); // здесь был бы запрос к базе
    if (!country) throw new NotFoundResponse("REFERENCES:COUNTRY_NOT_FOUND");
    self.value = country;
  }
}

/** Город из адреса — только среди городов найденной страны. */
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
    const city = cities.find((c) => c.id === Number(value) && c.countryId === country.id);
    if (!city) throw new NotFoundResponse("REFERENCES:CITY_NOT_FOUND");
    self.value = city;
  }
}
```

## Общий раздел

```ts title="10-shared-routes/translations.ts"
import { BodyBuilder, ConflictResponse } from "@aom-js/api";
import { Before, Controller, Get, Middleware, Post, Responses, This, Title } from "@aom-js/router";
import { ComponentSchema, PropertySchema } from "@aom-js/schemer";

import type { Translation } from "./store";

@ComponentSchema({ description: "Перевод названия" })
export class TranslationDTO {
  @PropertySchema.String({ minLength: 2, maxLength: 2, description: "Язык, код ISO 639-1" })
  locale!: string;

  @PropertySchema.String({ minLength: 1, maxLength: 64, description: "Название на этом языке" })
  name!: string;
}

@Controller()
export class TranslationBody extends BodyBuilder(TranslationDTO) {}

/**
 * Раздел «переводы названия» для любого ресурса. Маршруты и работа с переводами — здесь,
 * в одном экземпляре. Наследник перегружает только шаги-пустышки: `Setup` — чьи это
 * переводы, `Writable` — можно ли их сейчас менять.
 */
@Controller()
export class TranslationsBase {
  // запись, чьи это переводы: её кладёт `Setup` наследника
  owner: { translations: Translation[] };

  // параметры пустышек — `unknown` и `never[]`: тогда наследник объявляет у шага свои
  // параметры, и статическая сторона его класса остаётся совместимой с базой

  /** Пустышка: наследник кладёт в `owner` запись-владельца. */
  @Middleware()
  static async Setup(@This() self: unknown, ..._: never[]) {
    throw new Error(`${(self as object).constructor.name}: шаг Setup должен быть перегружен`);
  }

  /** Пустышка: проверка наследника перед записью; нет своих правил — пустой шаг. */
  @Middleware()
  static async Writable(@This() self: unknown, ..._: never[]) {
    throw new Error(`${(self as object).constructor.name}: шаг Writable должен быть перегружен`);
  }

  @Get("/")
  @Title("Переводы названия")
  @Before(TranslationsBase.Setup)
  static async Index(@This() { owner }: TranslationsBase) {
    return owner.translations;
  }

  @Post("/")
  @Title("Добавить перевод")
  @Responses(ConflictResponse.JSONSchema())
  @Before(TranslationsBase.Setup, TranslationsBase.Writable, TranslationBody.Body)
  static async Add(@This() { owner }: TranslationsBase, @This(TranslationBody) { body }: TranslationBody) {
    if (owner.translations.some((t) => t.locale === body.locale)) {
      throw new ConflictResponse("REFERENCES:TRANSLATION_EXISTS");
    }
    owner.translations.push(body); // здесь была бы вставка в базу
    return body;
  }
}
```

Что здесь главное:

- **Пустышки.** `Setup` и `Writable` в базе только бросают ошибку с именем класса. Маршруты базы ссылаются на них как на `TranslationsBase.Setup` и `TranslationsBase.Writable`.
- **Ссылка находит шаг наследника.** Когда раздел подключён через наследника, роутер при сборке маршрута подменяет `TranslationsBase.Setup` одноимённым шагом наследника, если тот его объявил. Своего шага нет — остаётся пустышка базы. Механизм — в справочнике [`@aom-js/router`](../packages/router.md#отложенные-ссылки-и-delayrefstack).
- **`@This()` без аргумента — объект наследника.** Это объект класса, через который подключён маршрут. `Setup` наследника записал в него `owner`, и обработчики базы `Index` и `Add` видят ту же запись.
- **Параметры пустышек — `unknown` и `never[]`.** Наследник объявляет у шага свои параметры — `@This(CountryValue)` и другие. С точными типами у пустышки TypeScript сочтёт статическую сторону наследника несовместимой с базой.
- **Порядок шагов добавления:** владелец → проверка наследника → тело. Отказ проверки приходит раньше разбора тела.

## Наследники

```ts title="10-shared-routes/countries.ts"
import { ConflictResponse } from "@aom-js/api";
import { Before, Bridge, Controller, Middleware, This } from "@aom-js/router";

import { Cities } from "./cities";
import { CountryID } from "./params";
import { TranslationsBase } from "./translations";
import { CountryValue } from "./values";

/** Переводы страны: маршруты — из `TranslationsBase`, здесь только его пустышки. */
@Controller()
export class CountryTranslations extends TranslationsBase {
  @Middleware()
  static async Setup(@This() self: CountryTranslations, @This(CountryValue) { value }: CountryValue) {
    self.owner = value;
  }

  // архивную страну больше не переводят
  @Middleware()
  static async Writable(@This(CountryValue) { value }: CountryValue) {
    if (value.archived) throw new ConflictResponse("REFERENCES:COUNTRY_ARCHIVED");
  }
}

@Controller()
@Before(CountryValue.Init)
@Bridge("/translations", CountryTranslations)
@Bridge("/cities", Cities)
export class Country {}

@Controller()
@Bridge(`/${CountryID}`, Country)
export class Countries {}
```

```ts title="10-shared-routes/cities.ts"
import { Before, Bridge, Controller, Middleware, This } from "@aom-js/router";

import { CityID } from "./params";
import { TranslationsBase } from "./translations";
import { CityValue } from "./values";

/** Переводы города: та же база, свои пустышки. */
@Controller()
export class CityTranslations extends TranslationsBase {
  @Middleware()
  static async Setup(@This() self: CityTranslations, @This(CityValue) { value }: CityValue) {
    self.owner = value;
  }

  // своих правил записи у города нет: пустышку закрывает пустой шаг
  @Middleware()
  static async Writable() {}
}

@Controller()
@Before(CityValue.Init)
@Bridge("/translations", CityTranslations)
export class City {}

@Controller()
@Bridge(`/${CityID}`, City)
export class Cities {}
```

У наследника нет ни одного маршрута — только шаги с теми же именами, что у пустышек, с тем же `@Middleware()`. Каждый берёт владельца из своего шага загрузки: страна — из `CountryValue`, город — из `CityValue`. Проверка у каждого своя: у страны — «не в архиве», у города своих правил нет, и пустышку закрывает пустой шаг. Пустой шаг — осознанное «правил нет», а не забытая перегрузка.

Мост `/translations` стоит у класса, у которого есть классовый `@Before` загрузки. Поэтому к шагам раздела страна или город уже найдены, а чужой или несуществующий id отвечает `404` своим шагом загрузки.

## Дерево маршрутов

```ts title="10-shared-routes/router.ts"
import { Bridge, Controller, OpenApi, Router } from "@aom-js/router";

import { Countries } from "./countries";

export const docs = new OpenApi({ title: "Countries API", version: "1.0.0" });

@Controller()
@Bridge("/countries", Countries)
class Index {}

export const router = new Router(Index, docs);
```

## Проверка

```bash
curl http://localhost:3000/countries/1/translations
curl -X POST http://localhost:3000/countries/1/translations -H 'Content-Type: application/json' -d '{"locale":"de","name":"Frankreich"}'
curl -X POST http://localhost:3000/countries/2/translations -H 'Content-Type: application/json' -d '{"locale":"de","name":"Byzanz"}'
```

Тест `examples/10-shared-routes/shared-routes.test.ts` проверяет раздел у обоих ресурсов: «у страны и у города один и тот же раздел переводов: список и добавление», «общий обработчик: второй перевод на тот же язык — 409 у обоих ресурсов». Свои шаги наследников: «проверка наследника: архивной стране перевод не добавить — 409 раньше проверки тела», «проверка своя у каждого наследника: город архивной страны переводится», «установочный шаг наследника: чужой город и несуществующая страна — 404». Тело и документ: «тело не по схеме — 400, перевод не добавляется», «документ: у обоих разделов одни и те же операции и ответы».

## Подводные камни

- **Забытая пустышка.** Наследник, который не перегрузил `Writable`, собирается и отвечает на `GET`, но каждый `POST` получает `500`: сработала пустышка базы, и её ошибка называет класс наследника (тест «забытая пустышка: маршруты без неё работают, маршрут с ней — 500»). Имя перегрузки должно совпадать с именем пустышки буква в букву: шаг с другим именем роутер не подставит.
- **`@This(TranslationsBase)` в шаге базы — чужой объект.** Он создаётся для класса `TranslationsBase`, а не для наследника, и того, что записал `Setup` наследника, в нём нет (тест «@This(Base) в шаге базы — отдельный объект: записи наследника он не видит»). В шагах базы берите `@This()` без аргумента.
- **Не переобъявляйте маршруты в наследнике.** Копия маршрута с декораторами базы работает, пока базу не поменяли, а потом молча расходится с ней. Шаг, который общий маршрут уже несёт внутри другого шага, в копии легко повторить, и он выполнится дважды — как в [подводных камнях главы 5](05-nested-routes.md#подводные-камни). Чего не хватает наследнику — пустышка в базе, а не копия маршрута.

Это последняя глава. Вернуться к [оглавлению учебника](index.md).
