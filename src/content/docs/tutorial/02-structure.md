---
title: "Структура приложения"
sidebar:
  order: 2
---

Когда маршрутов становится много, главное — договориться, где что лежит и кто кого импортирует. Эта глава показывает раскладку, в которой модуль растёт без циклических импортов: модуль справочников с двумя связанными ресурсами — «страны» и «города», город знает свою страну, страна — свои города. Всё на этой странице — файлы каталога `examples/02-structure/`, тест `examples/02-structure/structure.test.ts` поднимает модуль на свободном порту, ходит в него по HTTP и проверяет саму раскладку.

## Раскладка

```
02-structure/
  common/
    module-root.ts          общий код всех модулей: базовый корень
  references/               модуль «справочники»
    store.ts                данные (здесь — массивы в памяти)
    api/
      init.ts               документ OpenAPI и корень модуля
      router.ts             дерево маршрутов модуля
      routes/
        index.ts            контроллер /api: мосты на ресурсы
        countries/          ресурс «страны»
          index.ts          что ресурс отдаёт наружу
          routes.ts         контроллеры с маршрутами: Countries, Country
          init/
            params.ts       параметр пути CountryID
            value.ts        шаг «страна из адреса»
        cities/             ресурс «города», устроен так же
```

Правила раскладки:

- **Импорты идут в одну сторону — сверху вниз по дереву.** `router.ts` импортирует `routes/index.ts`, тот — ресурсы, ресурс — свой `init/`. Обратно никто не тянется: `init/` не знает про `routes.ts`, общий код в `common/` не знает про модули, а контроллеры из `api/` не импортирует никто, кроме их родителя.
- **В корне каталога ресурса — только контроллеры с маршрутами и мостами.** Кроме них там лежат `index.ts` и подкаталоги (`init/`, вложенные ресурсы). Всё служебное — параметры пути, шаги загрузки, схемы, проверки тела, вспомогательные функции — живёт в `init/`.
- **Путь метода и путь моста — один сегмент:** `/`, `/cities`, `/${CountryID}`. Смысловая группа («новые», «мои») — отдельный контроллер за мостом родителя, действие над записью — метод контроллера записи. Составной путь вроде `/countries/new/list` в одном декораторе прячет от дерева промежуточный узел. Параметр пути — класс параметра в пути моста (`` /${CountryID} ``), а не `:id` вручную.
- **`index.ts` ресурса — его публичная поверхность:** что другие модули могут брать у ресурса. Внутри модуля соседи берут друг у друга из `init/` по пути файла.

## Общий код

```ts title="02-structure/common/module-root.ts"
import { BaseRootController, RouteElement, RoutesStructure } from "@aom-js/api";
import { Controller } from "@aom-js/router";
import { ComponentSchema } from "@aom-js/schemer";

@ComponentSchema()
class ModuleRoute extends RouteElement {}

@ComponentSchema()
class ModuleRoutes extends RoutesStructure<ModuleRoute> {}

/** Общий корень модулей: модулю остаётся задать `ident` и `docs`. */
@Controller()
export class ModuleRootController extends BaseRootController {
  static readonly RoutesStructure = ModuleRoutes;

  readonly RouteElement = ModuleRoute;

  // у маршрутов пока нет своих маркеров — переносить в список нечего
  markersToRoute() {}
}
```

В первой главе корень модуля целиком жил в `root.ts`. Когда сервисов несколько (API пользователей, админки, справочников), одинаковая часть корня уезжает в `common/`: классы ответа списка маршрутов и перенос маркеров — общие, модуль задаёт только имя и документ. Если позже у маршрутов появятся метки доступа, поле в `ModuleRoute` и строка в `markersToRoute` добавятся в одном месте для всех модулей.

В `common/` живёт всё, что нужно больше чем одному модулю: базовые контроллеры, ответы, функции, типы. Правило направления здесь самое строгое — общий код не импортирует ничего из модулей.

## Модуль

```ts title="02-structure/references/api/init.ts"
import { Controller, OpenApi } from "@aom-js/router";

import { ModuleRootController } from "../../common/module-root";

export const docs = new OpenApi({ title: "References API", version: "1.0.0" });

@Controller()
export class ModuleRoot extends ModuleRootController {
  readonly ident = "references";

  readonly docs = docs;
}
```

```ts title="02-structure/references/api/router.ts"
import { Bridge, Controller, Router } from "@aom-js/router";

import { docs, ModuleRoot } from "./init";
import { ReferencesRoutes } from "./routes";

@Controller()
@Bridge("/", ModuleRoot)
@Bridge("/api", ReferencesRoutes)
class Index {}

export const router = new Router(Index, docs);
```

`api/init.ts` модуля — то, что нужно всему модулю и ничего не импортирует из маршрутов: настройки, документ OpenAPI, корень. Поэтому его может импортировать любой контроллер модуля, не рискуя циклом. `api/router.ts` — вершина дерева. Сервер, как `server.ts` из первой главы, лежит рядом с ним и импортирует только `router` и настройки.

```ts title="02-structure/references/api/routes/index.ts"
import { Bridge, Controller } from "@aom-js/router";

import { Cities } from "./cities";
import { Countries } from "./countries";

@Controller()
@Bridge("/countries", Countries)
@Bridge("/cities", Cities)
export class ReferencesRoutes {}
```

`routes/index.ts` собирает ресурсы модуля под `/api`. Сюда же позже встают шаги, общие для всех маршрутов модуля (например, проверка токена): классовый `@Before` контроллера проходит во все его мосты.

## Ресурс «страны»

```ts title="02-structure/references/api/routes/countries/index.ts"
// что другие модули могут брать у ресурса «страны»
export { Countries, Country } from "./routes";
export { CountryID } from "./init/params";
export { CountryValue } from "./init/value";
```

`import { Countries } from "./countries"` в `routes/index.ts` приходит сюда. Всё, что не перечислено в `index.ts`, — внутреннее дело ресурса.

```ts title="02-structure/references/api/routes/countries/init/params.ts"
import { NumberIDParam } from "@aom-js/api";
import { Controller } from "@aom-js/router";

@Controller()
export class CountryID extends NumberIDParam("countryId") {}
```

`NumberIDParam` из [`@aom-js/api`](../packages/api.md#idcontroller--uuidparam) — параметр пути с проверкой формата: в шаблоне строки он превращается в сегмент `:countryId([0-9]{1,12})`, а шаг `CountryID.PathID` кладёт значение из адреса в `value`. Адрес с нечисловым id роутер не узнаёт вообще — это `404` до всех шагов.

Дальше в коде появляются шаги. Минимум, чтобы его читать: **шаг** — статический метод с `@Middleware()`, он выполняется до обработчика и ничего не возвращает; `@Before(шаг)` ставит шаг перед маршрутом (на методе — перед этим обработчиком, на классе — перед всеми его маршрутами); `@This(X)` в аргументах — объект класса `X`, один на запрос: шаг кладёт в него найденную запись, обработчик её читает. Подробно шаги разобраны в главе [«Ресурс из схемы данных»](04-crud.md).

```ts title="02-structure/references/api/routes/countries/init/value.ts"
import { NotFoundResponse } from "@aom-js/api";
import { Before, Controller, Middleware, This } from "@aom-js/router";

import { countries } from "../../../../store";
import { CountryID } from "./params";

/** Поиск страны по id: им пользуются и шаг ниже, и соседние ресурсы. */
export function findCountry(id: number) {
  const country = countries.find((item) => item.id === id);
  if (!country) throw new NotFoundResponse("REFERENCES:COUNTRY_NOT_FOUND");
  return country;
}

@Controller()
export class CountryValue {
  value: ReturnType<typeof findCountry>;

  /** Шаг «страна из адреса»: id из пути — запись или 404. */
  @Middleware()
  @Before(CountryID.PathID)
  static async Init(@This() self: CountryValue, @This(CountryID) { value }: CountryID) {
    self.value = findCountry(+value);
  }
}
```

`CountryValue.Init` — шаг загрузки записи: берёт id из адреса, находит страну или бросает `NotFoundResponse` (`404`). В ответ уходит не текст, а код сообщения с префиксом модуля, `REFERENCES:COUNTRY_NOT_FOUND`; коды и их перевод — тема следующей главы. Шаг — служебный класс без маршрутов, поэтому лежит в `init/`. Функция `findCountry` вынесена рядом, чтобы соседний ресурс мог искать страну, не трогая контроллеры стран.

```ts title="02-structure/references/api/routes/countries/routes.ts"
import { Before, Bridge, Controller, Get, This, Title } from "@aom-js/router";

import { citiesOf } from "../cities/init/value";
import { countries } from "../../../store";
import { CountryID } from "./init/params";
import { CountryValue } from "./init/value";

// элемент объявлен выше коллекции: @Bridge ниже берёт класс сразу, при объявлении
@Controller()
export class Country {
  @Get("/")
  @Title("Страна")
  @Before(CountryValue.Init)
  static async Index(@This(CountryValue) { value }: CountryValue) {
    return value;
  }

  @Get("/cities")
  @Title("Города страны")
  @Before(CountryValue.Init)
  static async Cities(@This(CountryValue) { value }: CountryValue) {
    return citiesOf(value.id);
  }
}

@Controller()
@Bridge(`/${CountryID}`, Country)
export class Countries {
  @Get("/")
  @Title("Список стран")
  static async Index() {
    return countries;
  }
}
```

В `routes.ts` — только контроллеры, которые дают маршруты: коллекция `Countries` (`GET /api/countries`) и запись `Country` за мостом `` /${CountryID} `` (`GET /api/countries/1` и `GET /api/countries/1/cities`). Контроллер записи объявлен выше коллекции нарочно: аргументы декораторов вычисляются в момент объявления класса, и `@Bridge` получает класс сразу.

## Ресурс «города»

`cities/index.ts` и `cities/init/params.ts` устроены так же, как у стран. Отличается шаг загрузки: город отдаётся вместе со своей страной.

```ts title="02-structure/references/api/routes/cities/init/value.ts"
import { NotFoundResponse } from "@aom-js/api";
import { Before, Controller, Middleware, This } from "@aom-js/router";

import { cities } from "../../../../store";
// у соседа — из его init/ по пути файла: init/ не тянет routes.ts, и цикла импортов нет
import { findCountry } from "../../countries/init/value";
import { CityID } from "./params";

export function citiesOf(countryId: number) {
  return cities.filter((city) => city.countryId === countryId);
}

@Controller()
export class CityValue {
  value: (typeof cities)[number] & { country: ReturnType<typeof findCountry> };

  /** Шаг «город из адреса»: город вместе со своей страной или 404. */
  @Middleware()
  @Before(CityID.PathID)
  static async Init(@This() self: CityValue, @This(CityID) { value }: CityID) {
    const city = cities.find((item) => item.id === +value);
    if (!city) throw new NotFoundResponse("REFERENCES:CITY_NOT_FOUND");
    self.value = { ...city, country: findCountry(city.countryId) };
  }
}
```

```ts title="02-structure/references/api/routes/cities/routes.ts"
import { Before, Bridge, Controller, Get, This, Title } from "@aom-js/router";

import { cities } from "../../../store";
import { CityID } from "./init/params";
import { CityValue } from "./init/value";

@Controller()
export class City {
  @Get("/")
  @Title("Город")
  @Before(CityValue.Init)
  static async Index(@This(CityValue) { value }: CityValue) {
    return value;
  }
}

@Controller()
@Bridge(`/${CityID}`, City)
export class Cities {
  @Get("/")
  @Title("Список городов")
  static async Index() {
    return cities;
  }
}
```

Связь двух ресурсов идёт через `init/`: `countries/routes.ts` берёт `citiesOf` из `cities/init/value.ts`, а тот — `findCountry` из `countries/init/value.ts`. Файлы `init/` не импортируют `routes.ts`, поэтому такие перекрёстные ссылки не замыкаются в цикл.

## Данные

```ts title="02-structure/references/store.ts"
// данные в памяти процесса: в настоящем приложении здесь сущности ORM, а поиск — запрос к базе
export const countries = [
  { id: 1, name: "Армения" },
  { id: 2, name: "Грузия" },
];

export const cities = [
  { id: 1, name: "Ереван", countryId: 1 },
  { id: 2, name: "Гюмри", countryId: 1 },
  { id: 3, name: "Тбилиси", countryId: 2 },
];
```

Данные модуля лежат рядом с модулем, а не в `api/`: их читают и маршруты, и всё остальное (фоновые задачи, обработчики очередей). В настоящем приложении на этом месте — сущности ORM, а `find`/`filter` — запросы к базе.

## Циклы и отложенные ссылки

Цикл импортов не всегда падает. Модуль, до которого цикл дошёл вторым, видит импорт ещё не вычисленным: в зависимости от загрузчика это `ReferenceError` при загрузке или — хуже — молчаливый `undefined` в аргументе декоратора (так, например, под vitest). Вот как это выглядит, если положить параметр пути не в `init/`, а в файл с контроллерами:

```ts title="02-structure/cycle/countries.ts"
import { NumberIDParam } from "@aom-js/api";
import { Bridge, Controller, Get } from "@aom-js/router";

import { Cities } from "./cities";

@Controller()
export class CountryID extends NumberIDParam("countryId") {}

@Controller()
@Bridge("/cities", Cities)
export class Countries {
  @Get("/")
  static async Index() {
    return [];
  }
}
```

```ts title="02-structure/cycle/cities.ts"
import { Bridge, Controller, Get } from "@aom-js/router";

// так не надо: countries.ts импортирует этот файл ради моста, а этот файл — countries.ts ради параметра
import { CountryID } from "./countries";

@Controller()
export class CountryCities {
  @Get("/")
  static async Index() {
    return [];
  }
}

@Controller()
@Bridge(`/${CountryID}`, CountryCities)
export class Cities {}
```

Роутер с этими файлами собирается без ошибок, но маршрут получает адрес `/cities/undefined`. Лечится раскладкой, а не обходом: параметр уезжает в `countries/init/params.ts`, который ничего не импортирует из маршрутов, и цикла больше нет. Ловить циклы заранее помогает правило линтера `import/no-cycle`, а следы цикла в готовом роутере — проверка «в адресах нет `undefined`» (ниже, в тесте раскладки).

Внутри одного файла то же самое проявляется громче: `@Bridge("/item", Item)` над классом `Item`, объявленным ниже, падает при загрузке с `ReferenceError` (TypeScript подсвечивает это и сам). Поэтому контроллер записи стоит выше коллекции.

Для ссылок, которые нельзя развернуть при объявлении, в ядре есть отложенные ссылки — [`FwdRef`](../packages/router.md#фабрики-ссылок-и-типы): функция, которую ядро вызывает позже. Насколько позже — зависит от декоратора ([`@aom-js/router`](../packages/router.md#отложенные-ссылки-и-delayrefstack)):

- `@This(FwdRef(() => X))` разворачивается **на каждом запросе**. К этому времени все модули загружены, и ссылка на класс ниже по файлу или из модуля в цикле работает:

  ```ts
  @Get("/")
  static async Index(@This(FwdRef(() => Later)) later: { ready: boolean }) {
    return { ready: later.ready };
  }
  ```

- `@Before`, `@After`, `@Next` и `@UseMarker` разворачивают `FwdRef` **при сборке роутера** (`new Router(...)`). К этому времени все модули тоже загружены, поэтому `@Before(FwdRef(() => Guard.Check))` над `Guard`, объявленным ниже, работает. Прямую ссылку эти декораторы проверяют сразу, при объявлении класса, а ссылку через `FwdRef` — при сборке: шаг не того вида (например, в `@Before` метод без `@Middleware()`) роняет `new Router(...)` ошибкой `USE_*_DEFINE_ERROR`.
- `@Bridge` принимает только сам класс.

Вывод: отложенная ссылка — точечный инструмент для `@This` и связей шагов, а дерево маршрутов (`@Bridge`) держится на направлении импортов. Если два контроллера тянутся друг к другу, общую часть почти всегда пора вынести в `init/` одного из них или в третий класс. Цикл другого рода — два класса, которые на запросе через `@This` требуют друг друга, — ядро ловит само и называет `CIRCULAR_INSTANCE_ERROR` с цепочкой классов; как её читать, разобрано в рецепте [`@This` и жизненный цикл объекта](../cookbook/this-and-instances.md#циклы-как-читать-ошибку).

## Тест раскладки

Правила раскладки легко нарушить незаметно, поэтому их проверяет тест — второй блок `examples/02-structure/structure.test.ts`. Тест опирается только на публичную выгрузку ядра — список `router.routes` и поиск маршрута `router.routeOf(метод)` ([«Метаданные цепочки»](../packages/router.md#метаданные-цепочки-tojson-routeof-cursorkind)), — поэтому не зависит от внутреннего устройства роутера. Проверок две:

- каждый файл под `api/routes/` вне `init/`, кроме `index.ts`, экспортирует только контроллеры с маршрутами — классы, у которых `router.routeOf` находит хотя бы один метод. Служебный класс или функция в `routes.ts` роняет тест с именем файла и экспорта;
- ни один адрес в `router.routes` не содержит `undefined` — след цикла импортов.

Правило «один сегмент в пути» тест не проверяет: публичная выгрузка отдаёт адрес маршрута целиком, без деления на части мостов, — его держит ревью. Файлы тест обходит через `node:fs` и загружает обычным `import()`, без возможностей сборщика, поэтому переносится в приложение почти без правок: поменяйте роутер и каталог `ROUTES`. Раннер должен уметь импортировать `.ts` — vitest и bun умеют.

## Проверка

Если поднять модуль сервером, как в первой главе:

```bash
curl http://localhost:3000/                            # {"ident":"references","routes":[...]}
curl http://localhost:3000/api/countries/1/cities      # города Армении
curl http://localhost:3000/api/cities/3                # Тбилиси вместе со страной
curl http://localhost:3000/api/countries/9             # 404, REFERENCES:COUNTRY_NOT_FOUND
```

Тест `examples/02-structure/structure.test.ts` проверяет:

- модуль: «корень модуля перечисляет маршруты обоих ресурсов», «город отдаётся вместе со своей страной», «страна перечисляет свои города», «нет записи — 404 от шага загрузки, id не числом — 404 от роутера»;
- раскладку: «вне init/ — только index.ts и контроллеры с маршрутами», «тест отличает контроллер с маршрутами от служебного класса», «адреса маршрутов без undefined»;
- циклы: «цикл импортов молча даёт undefined в адресе», «@Bridge на класс, объявленный ниже, падает при объявлении», «FwdRef в @Before разворачивается при сборке роутера: класс ниже уже есть», «FwdRef в @This разрешается на запросе: класс ниже уже есть», «тип параметра классом ниже падает при объявлении даже с FwdRef».

## Подводные камни

- **Цикл импортов может не упасть, а испортить адрес.** `` /${CountryID} `` из модуля в цикле превращается в `/undefined`: роутер собирается, маршрут просто не находится. Ищите `undefined` в списке маршрутов корня.
- **Тип параметра — тоже ссылка.** С `emitDecoratorMetadata` тип параметра метода записывается в метаданные при объявлении: `@This(FwdRef(() => Later)) later: Later` падает, даже если сама ссылка отложена. Типизируйте такой параметр не классом из цикла: например, структурным типом, как в примере выше.
- **Импорт соседа через его `index.ts` внутри модуля.** `index.ts` реэкспортирует `routes.ts` с контроллерами соседа, а они могут импортировать ваш ресурс — это прямой путь к циклу. Внутри модуля импортируйте нужный файл из `init/` соседа напрямую; `index.ts` — для других модулей и для родителя.
- **Служебный класс в `routes.ts`.** Работает, пока на него не сошлётся соседний ресурс: тогда импорт служебного класса тянет контроллеры, и до цикла один шаг. Тест раскладки ловит такой файл сразу.

Дальше примеры плоские, чтобы глава читалась целиком: все файлы примера лежат в одном каталоге. В приложении раскладывайте так, как здесь.

Дальше — [ответы и ошибки](03-responses.md): типовые ответы, ошибки и их схемы в OpenAPI.
