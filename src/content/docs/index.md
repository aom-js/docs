---
title: "aom-js"
---

`aom-js` — набор пакетов `@aom-js/*` для серверных приложений на TypeScript. Приложение пишется классами со статическими методами, а декораторы над ними описывают всё остальное: маршруты API, проверки перед обработчиком, схемы данных, документ OpenAPI и вызовы других сервисов через шину сообщений.

Главная задача — одно описание на все применения. Класс-контроллер сразу даёт маршрут, цепочку его шагов и раздел OpenAPI. Класс-схема — тип данных, JSON Schema и валидатор. Изолятор — контракт вызова другого сервиса и место для его исполнителя.

## Ключевые идеи

- **Метаданные живут в реестре.** Каждый декоратор работает с мета-инстансом `$` своего класса или метода из реестра `@aom-js/core`. Работа, которой нужен собранный класс, откладывается; запускает её декоратор класса (`@Controller()`, `@ComponentSchema()`, `@Isolator()`), который вычисляется последним.
- **Декораторы наследуются.** Потомок получает декораторы предка вместе с собственной копией состояния. На этом построены базовые контроллеры и билдеры `@aom-js/api`: поведение объявлено на базовом классе, а настройки (схема, имена заголовков) берутся из статик потомка.
- **Маршрут — линейная цепочка шагов.** Шаги `@Before`, сам эндпоинт и `@Next` выполняются по очереди; первый результат, отличный от `undefined`, становится ответом, ошибка прерывает цепочку.
- **Объекты классов на время запроса.** `@This(Класс)` создаёт объект класса один раз на запрос и раздаёт его всем шагам; хуки `@OnInstance` проверяют объект до того, как его увидит чужой код.
- **Один класс — DTO, JSON Schema и валидатор.** `@ComponentSchema` и `PropertySchema.*` поверх `class-validator`; те же классы описывают тело запроса, ответы в OpenAPI и контракт на шине.
- **Карта маршрутов отделена от HTTP-сервера.** `Router` собирает маршруты и исполняет их над объектом значений запроса; `Server` из `@aom-js/api` подключает его к `node:http`, а для другого HTTP-фреймворка достаточно адаптера, который заполняет тот же объект значений.
- **Вызов метода через шину.** Метод изолятора публикует сообщение; выполняет его наследник-исполнитель в другом процессе. Шина задаётся парой функций публикации и подписки, поэтому подходит любая: NATS, Kafka, своя.

## Пример

```ts
import { Controller, Bridge, Get, Query, This, OnInstance, Router, OpenApi } from "@aom-js/router";
import { Server } from "@aom-js/api";

@Controller()
class Greeting {
  name = "world";

  @OnInstance()
  static async Init(@This() self: Greeting, @Query() query: Record<string, string>) {
    if (query.name) self.name = query.name;
  }
}

@Controller()
class Hello {
  @Get("/hello")
  static async Index(@This(Greeting) greeting: Greeting) {
    return { hello: greeting.name };
  }
}

@Controller()
@Bridge("/api", Hello)
class Root {}

const router = new Router(Root, new OpenApi({ title: "demo", version: "1.0.0" }));
new Server({ port: 3000, url: "http://localhost:3000" }, router); // GET /api/hello?name=aom → {"hello":"aom"}
```

Ядро построено на legacy-декораторах: приложению нужны `experimentalDecorators` и `emitDecoratorMetadata` в `tsconfig.json`.

## Пакеты

- [`@aom-js/core`](packages/core.md) — реестр мета-инстансов и фабрики декораторов с отложенным исполнением.
- [`@aom-js/schemer`](packages/schemer.md) — класс как DTO, JSON Schema и валидатор; сборщик компонентов схем.
- [`@aom-js/router`](packages/router.md) — карта HTTP/WS-маршрутов из классов-контроллеров и её исполнение, документ OpenAPI.
- [`@aom-js/api`](packages/api.md) — HTTP-сервер на `node:http`, билдеры, базовые контроллеры, ответы, локализация.
- [`@aom-js/transfer`](packages/transfer.md) — изоляторы и исполнители: RPC поверх абстрактной шины.
- [`@aom-js/codegen`](packages/codegen.md) — генерация исходников aom-классов из дескриптора изолятора.
- [`@aom-js/holder`](packages/holder.md) — отложенное применение сторонних декораторов на конечном потомке.
- [`@aom-js/visualizer`](packages/visualizer.md) — граф API по дереву контроллеров в виде HTML-страницы.

## С чего начать

1. [Архитектура ядра](architecture.md) — карта ядра: пакеты, модель метаданных, путь от контроллера до ответа.
2. [`@aom-js/core`](packages/core.md), затем [`@aom-js/router`](packages/router.md) — механика, на которой стоит всё остальное.
3. [`@aom-js/schemer`](packages/schemer.md) и [`@aom-js/api`](packages/api.md) — схемы данных и готовые части сервера.
4. [Рецепты](cookbook/index.md) — рецепты прикладного кода с проверенными примерами.
5. [Тестирование приложения](testing.md) — как проверять цепочки маршрутов приложения.

Пути к файлам в тексте (`packages/<пакет>/src/…`, `scripts/…`) — от корня репозитория ядра [aom-js/main](https://github.com/aom-js/main).
