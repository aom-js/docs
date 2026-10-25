---
title: "Первый сервис"
sidebar:
  order: 1
---

Как поднять HTTP-сервис на `@aom-js/*`: настройки, корень модуля со списком маршрутов и документом OpenAPI, первый контроллер, запуск. Всё на этой странице — файлы каталога `examples/01-first-service/`, тест `examples/01-first-service/first-service.test.ts` поднимает их на свободном порту и ходит в них по HTTP.

## Установка

```bash
npm install @aom-js/api@0.1.3 @aom-js/router@0.1.3 @aom-js/schemer@0.1.3 reflect-metadata
```

Все пакеты `@aom-js/*` ставятся одной версией: каждый из них зависит от соседей ровно этой версии, и разные версии дали бы в проекте две копии ядра. Примеры учебника идут на 0.1.3. Для проверки данных (глава 6) понадобятся ещё `class-validator` и `class-transformer` — те же версии, что у `@aom-js/schemer`, иначе у проверок окажется два реестра.

В `tsconfig.json` нужны legacy-декораторы с метаданными типов:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

## Из чего состоит сервис

Сервис — это четыре части, по файлу на каждую:

| Файл | Что в нём |
| --- | --- |
| `hello.ts` | контроллер: класс со статическими методами, декораторы описывают маршруты |
| `root.ts` | корень модуля и документ OpenAPI |
| `router.ts` | дерево маршрутов: корневой класс собирает остальные мостами `@Bridge` |
| `server.ts` | запуск: настройки из окружения и `new Server(...)` |

Роутер и сервер разделены нарочно: роутер — карта маршрутов, её можно проверять и тестировать без сети; сервер подключает её к `node:http`. Тесты учебника берут `router` и поднимают его сами.

## Контроллер

```ts title="01-first-service/hello.ts"
import { Controller, Get, Query, Title } from "@aom-js/router";

@Controller()
export class Hello {
  @Get("/hello")
  @Title("Приветствие")
  static async Index(@Query() query: Record<string, string>) {
    return { hello: query.name ?? "world" };
  }
}
```

Контроллер — класс с `@Controller()`, маршрут — статический метод с декоратором метода (`@Get`, `@Post`, `@Patch`, `@Delete`). Аргументы метода приходят из декораторов параметров: `@Query()` — разобранная строка запроса, `@Params()`, `@Body()`, `@Headers()` — остальные части запроса. Что метод вернул, то и ответ: объект уходит JSON-ом.

`@Title` — заголовок маршрута: он попадает в документ OpenAPI как `summary` и в список маршрутов корня.

## Корень модуля

```ts title="01-first-service/root.ts"
import { BaseRootController, RouteElement, RoutesStructure } from "@aom-js/api";
import { Controller, OpenApi } from "@aom-js/router";
import { ComponentSchema } from "@aom-js/schemer";

export const docs = new OpenApi({ title: "Greetings API", version: "1.0.0" });

// классы ответа корня: свои у каждого модуля, чтобы потом добавить в них поля (например, доступ)
@ComponentSchema()
class GreetingsRoute extends RouteElement {}

@ComponentSchema()
class GreetingsRoutes extends RoutesStructure<GreetingsRoute> {}

/** Корень модуля: список маршрутов на `GET /`, документ на `GET /openapi.json`. */
@Controller()
export class ModuleRoot extends BaseRootController {
  static readonly RoutesStructure = GreetingsRoutes;

  readonly RouteElement = GreetingsRoute;

  readonly ident = "greetings";

  readonly docs = docs;

  // маркеров у маршрутов модуля пока нет; объявить метод нужно всё равно — базовый бросает ошибку
  markersToRoute() {}
}
```

`BaseRootController` из `@aom-js/api` даёт модулю три готовых маршрута: `GET /` — список маршрутов модуля, `GET /openapi.json` — документ OpenAPI, `GET /swagger.html` — страница Swagger UI над ним. Наследник обязан задать:

- `RoutesStructure` и `RouteElement` — классы ответа списка маршрутов. Пустые наследники базовых классов — нормальный старт;
- `markersToRoute` — переносит маркеры маршрута в его строку списка. Маркер — метка, которую декоратор оставляет на маршруте, например требование прав (глава 8); поле для неё добавляют в `RouteElement`. Базовый метод бросает ошибку, поэтому даже пустой метод объявить нужно;
- `ident` — имя модуля в ответе `GET /`;
- `docs` — тот же `OpenApi`, что получит роутер.

Документ и страница Swagger закрыты `AuthBasic.Required`: пока статическое поле `AuthBasic.BASIC_AUTH` пусто, они открыты всем; в рабочем окружении его заполняют строкой `логин:пароль`.

## Дерево маршрутов

```ts title="01-first-service/router.ts"
import { Bridge, Controller, Router } from "@aom-js/router";

import { Hello } from "./hello";
import { docs, ModuleRoot } from "./root";

@Controller()
@Bridge("/", ModuleRoot)
@Bridge("/api", Hello)
class Index {}

export const router = new Router(Index, docs);
```

`@Bridge(prefix, Controller)` подключает маршруты другого контроллера под префиксом: `Hello.Index` с путём `/hello` под мостом `/api` становится `GET /api/hello`. Корневой класс `Index` сам маршрутов не объявляет — он только собирает дерево. `new Router(Index, docs)` строит все маршруты и заполняет документ.

## Запуск

```ts title="01-first-service/server.ts"
import "reflect-metadata";
import { Server } from "@aom-js/api";

import { router } from "./router";

const { API_HOST = "http://localhost:3000", API_PORT = "3000" } = process.env;

export default new Server({ url: API_HOST, port: +API_PORT, name: "GREETINGS" }, router);
```

`Server` начинает слушать порт сразу в конструкторе, отдельного `listen()` нет. `url` — адрес развёртывания. Если в нём есть путь (`http://host/v1`), сервер приписывает этот путь к пути каждого входящего запроса до поиска маршрута — так работают за прокси, который срезает префикс, и тогда маршруты объявляют с ним. Если прокси ничего не срезает, задавайте `url` без пути. `reflect-metadata` подключается один раз, первой строкой точки входа: декораторы ядра читают типы параметров через него.

Настройки — из окружения, по паре переменных на сервис:

```bash
API_HOST=http://localhost:3000
API_PORT=3000
```

Когда сервисов несколько (API пользователей, админки, файлов), у каждого свой файл `server.ts`, своя пара переменных и свой корень модуля со своим `ident`.


## Проверка

```bash
curl http://localhost:3000/api/hello?name=aom   # {"hello":"aom"}
curl http://localhost:3000/                     # {"ident":"greetings","routes":[...]}
curl http://localhost:3000/openapi.json         # документ OpenAPI
```

Тот же путь проходит тест `examples/01-first-service/first-service.test.ts` («GET /api/hello отвечает JSON, имя берёт из строки запроса», «корень модуля перечисляет маршруты», «документ OpenAPI описывает маршрут с его заголовком»); подводные камни ниже — он же («путь из url сервер приписывает к пути запроса: маршруты без него не находятся», «корень без RoutesStructure падает при сборке роутера»).

## Подводные камни

- **Без `reflect-metadata` и `emitDecoratorMetadata`** декораторы параметров не знают типов: схемы тела и ответов не строятся. Если тесты идут через `vitest`, нужен транспилятор, который эмитит `design:type`, — SWC (`unplugin-swc`); esbuild и oxc его не эмитят.
- **Путь в `url`** без прокси, который его срезает, делает недоступными все маршруты: и `/api/hello`, и `/v1/api/hello` отвечают 404.
- **Корень без `RoutesStructure`** падает при сборке роутера (`Cannot read properties of undefined (reading 'JSONSchema')`): базовые классы ответа нужно унаследовать, даже пустыми.
- **Порт `0`** — случайный свободный порт; так тесты поднимают несколько серверов параллельно, а настоящий порт берут из `server.server.address()`.

Дальше — [структура приложения](02-structure.md): как раскладывать контроллеры, схемы и общий код, когда маршрутов становится много.
