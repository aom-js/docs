---
title: "Ответы и ошибки"
sidebar:
  order: 3
---

Как сервис отвечает данными и ошибками так, чтобы клиент и документ OpenAPI знали каждый исход маршрута. К концу главы у нас ресурс «книги»: карточка отвечает данными в своей схеме, выдача книги отказывает типовыми ошибками `404` и `409` и своей ошибкой `410`, все ответы описаны в OpenAPI, а текст ошибки приходит на языке запроса. Код — каталог `examples/03-responses/`, тест — `examples/03-responses/responses.test.ts`.

## Как устроены ответы

В `@aom-js/api` два семейства классов ответа ([справочник](../packages/api.md#ответы-и-ошибки)):

- **успешные** — наследники `CommonResponse`: `MessageResponse` (`{ message }`), `DataResponse` (`{ message, data }`) и свои классы с полями данных;
- **ошибки** — наследники `ErrorMessage`, который сам наследует `Error`. Его бросают (`throw`), сервер ловит и отвечает статусом из класса и телом `{ message, status, data }`; `data` в теле — только когда есть подробности. Готовые: `WrongDataResponse` (400), `AuthRequiredResponse` (401), `AccessDenyResponse` (403), `NotFoundResponse` (404), `ConflictResponse` (409), `ServerErrorResponse` (500) и другие.

Каждый класс — компонент схемы (`@ComponentSchema`) и умеет описать себя статическим `JSONSchema(описание?)`. Результат передают в `@Responses(...)` у маршрута — так ответ попадает в документ OpenAPI.

В `message` уходит не текст, а **код сообщения** — строка вроде `LIBRARY:BOOK_NOT_FOUND`. Текст на нужном языке подставляет `I18nizer` уже в готовый ответ. Коды ядра выглядят так же: `AOM_API:ERROR_NOT_FOUND`.

## Коды сообщений

```ts title="03-responses/messages.ts"
// коды сообщений: клиенту уходит код, текст подставляет I18nizer; префикс не даёт коду совпасть с обычным текстом
export const BOOK_NOT_FOUND = "LIBRARY:BOOK_NOT_FOUND";
export const BOOK_ON_LOAN = "LIBRARY:BOOK_ON_LOAN";
export const BOOK_ARCHIVED = "LIBRARY:BOOK_ARCHIVED";
export const LOAN_CREATED = "LIBRARY:LOAN_CREATED";
```

Коды — обычные строковые константы, по одной на ситуацию. Префикс модуля (`LIBRARY:`) нужен не для красоты: перевод ищет код в тексте ответа простой заменой подстроки, и короткое `NOT_FOUND` совпало бы с частью чужого кода или с обычными данными.

## Схемы ответов

```ts title="03-responses/responses.ts"
import { CommonResponse, ErrorMessage } from "@aom-js/api";
import { ComponentSchema, PropertySchema } from "@aom-js/schemer";

import * as messages from "./messages";

/** Схема ответа «книга»: попадает в документ OpenAPI как компонент. */
@ComponentSchema({ description: "Книга" })
export class BookResponse extends CommonResponse {
  @PropertySchema.Number({ description: "Номер" })
  id!: number;

  @PropertySchema.String({ description: "Название" })
  title!: string;

  @PropertySchema.Boolean({ description: "Сейчас выдана" })
  onLoan!: boolean;

  @PropertySchema.Boolean({ description: "Списана" })
  archived!: boolean;
}

/** Своя ошибка: статус и описание по умолчанию — у класса, тело — как у всех ошибок. */
@ComponentSchema({ description: "Книга списана" })
export class BookArchivedResponse extends ErrorMessage {
  static status = 410;

  static description = messages.BOOK_ARCHIVED;
}
```

`BookResponse` — схема успешного ответа: поля описаны `@PropertySchema`, класс помечен `@ComponentSchema` и попадает в `components.schemas` документа. Наследование от `CommonResponse` даёт ему `JSONSchema()` со статусом `200`.

`BookArchivedResponse` — своя ошибка. Достаточно унаследовать `ErrorMessage` и задать два статических поля: `status` — с каким HTTP-статусом отвечать, `description` — описание в OpenAPI по умолчанию. Тело ответа и его схема — общие для всех ошибок. `@ComponentSchema` обязателен и у наследника: без него роутер не соберётся (см. «Подводные камни»).

Если новая ошибка — частный случай готовой (тот же статус, свой код), отдельный класс не нужен: бросают готовый класс со своим кодом, как ниже с `ConflictResponse`.

## Данные

```ts title="03-responses/store.ts"
export type Book = { id: number; title: string; onLoan: boolean; archived: boolean };

// здесь была бы таблица в базе
export const books = new Map<number, Book>();

export function reset() {
  books.clear();
  books.set(1, { id: 1, title: "Мастер и Маргарита", onLoan: false, archived: false });
  books.set(2, { id: 2, title: "Война и мир", onLoan: true, archived: false });
  books.set(3, { id: 3, title: "Справочник 1987 года", onLoan: false, archived: true });
}

reset();
```

Три книги на все случаи: свободная, уже выданная и списанная. `reset()` возвращает их в исходное состояние — тест зовёт его перед каждой проверкой.

## Книга из адреса

```ts title="03-responses/params.ts"
import { NumberIDParam } from "@aom-js/api";
import { Controller } from "@aom-js/router";

// сегмент пути: `${BookID}` в шаблоне моста становится параметром `{bookId}` в документе OpenAPI
@Controller()
export class BookID extends NumberIDParam("bookId") {}
```

`BookID` — класс параметра пути. Его подставляют в путь моста (`` `/${BookID}` ``), и в документе OpenAPI путь получается `/api/books/{bookId}` с описанием параметра. Значения не из цифр отсекаются ещё при сопоставлении пути.

```ts title="03-responses/values.ts"
import { NotFoundResponse } from "@aom-js/api";
import { Before, Controller, Middleware, Responses, This } from "@aom-js/router";

import * as messages from "./messages";
import { BookID } from "./params";
import { type Book, books } from "./store";

/** Книга из адреса: шаг находит её или бросает 404, обработчики берут её через `@This(BookValue)`. */
@Controller()
export class BookValue {
  value: Book;

  @Middleware()
  @Before(BookID.PathID)
  @Responses(NotFoundResponse.JSONSchema(messages.BOOK_NOT_FOUND))
  static async Init(@This() self: BookValue, @This(BookID) { value }: BookID) {
    const book = books.get(Number(value));
    if (!book) throw new NotFoundResponse(messages.BOOK_NOT_FOUND);
    self.value = book;
  }
}
```

`BookValue.Init` — шаг: статический метод с `@Middleware()`, который выполняется до обработчика. Он берёт id из адреса, находит книгу или бросает `404`, а найденную кладёт в `self.value`. `@This(BookValue)` — объект класса `BookValue`, один на запрос: шаг его заполняет, обработчики читают. `@Responses` на шаге описывает его `404`. Подробно шаги разобраны в главе [«Ресурс из схемы данных»](04-crud.md).

## Контроллер: бросаем ошибки и описываем их

```ts title="03-responses/books.ts"
import { ConflictResponse, MessageResponse } from "@aom-js/api";
import { Before, Bridge, Controller, Get, Post, Responses, This, Title } from "@aom-js/router";

import * as messages from "./messages";
import { BookID } from "./params";
import { BookArchivedResponse, BookResponse } from "./responses";
import { BookValue } from "./values";

// классовый @Before: книга найдена до любого обработчика карточки, его 404 попадает в описание каждого
@Controller()
@Before(BookValue.Init)
export class Book {
  @Get("/")
  @Title("Карточка книги")
  @Responses(BookResponse.JSONSchema("Книга"))
  static async Index(@This(BookValue) { value }: BookValue) {
    return value;
  }

  @Post("/loan")
  @Title("Выдать книгу")
  @Responses(
    MessageResponse.JSONSchema(messages.LOAN_CREATED),
    ConflictResponse.JSONSchema(messages.BOOK_ON_LOAN),
    BookArchivedResponse.JSONSchema(),
  )
  static async Loan(@This(BookValue) { value: book }: BookValue) {
    if (book.archived) throw new BookArchivedResponse(messages.BOOK_ARCHIVED);
    // в `data` — подробности для клиента: какую книгу не удалось выдать
    if (book.onLoan) throw new ConflictResponse(messages.BOOK_ON_LOAN, { id: book.id });
    book.onLoan = true;
    return new MessageResponse(messages.LOAN_CREATED);
  }
}

@Controller()
@Bridge(`/${BookID}`, Book)
export class Books {}
```

Ошибку **бросают**, а не возвращают: `throw new NotFoundResponse(код)` прерывает запрос в любом месте, даже в шаге до обработчика. Сервер видит, что брошен `ErrorMessage`, и отвечает его статусом:

```json
{ "message": "LIBRARY:BOOK_ON_LOAN", "status": 409, "data": { "id": 2 } }
```

Аргументы готовых ошибок — `(код, data?)`: `data` — подробности для клиента (какая запись мешает, какие поля не прошли проверку). У `ErrorMessage` и своих наследников без конструктора — `(код, статус?, data?)`.

`@Responses` перечисляет исходы, по одному на статус. Описание и статус — аргументы `JSONSchema`; без них берутся `static description` и `static status` класса, поэтому у `BookArchivedResponse.JSONSchema()` описание уже есть. Это касается и успешных ответов: свой наследник `MessageResponse` со `static status = 201` и своим описанием даёт их в `JSONSchema()` без аргументов («успешный ответ без аргументов JSONSchema берёт статус и описание своего класса»). В документе это выглядит так:

```json
"responses": {
  "200": { "description": "LIBRARY:LOAN_CREATED", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/MessageResponse" } } } },
  "404": { "description": "LIBRARY:BOOK_NOT_FOUND", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/NotFoundResponse" } } } },
  "409": { "description": "LIBRARY:BOOK_ON_LOAN", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ConflictResponse" } } } },
  "410": { "description": "LIBRARY:BOOK_ARCHIVED", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/BookArchivedResponse" } } } }
}
```

`404` здесь нет, но в документе он есть: ответы собираются со всей цепочки маршрута, а шаг `BookValue.Init` стоит в ней перед каждым обработчиком карточки — классовый `@Before` на `Book` (подробнее — [сборка OpenAPI](../packages/router.md#сборка-openapi-openapiregisterpath)).

## Тексты на языке запроса

```ts title="03-responses/i18n.ts"
import { I18nizer } from "@aom-js/api";

import * as messages from "./messages";

// язык — из `?locale=` или заголовка `x-locale`; если не задан или словаря нет — русский
export const i18nizer = new I18nizer("ru", "x-locale", "locale", {
  ru: {
    [messages.BOOK_NOT_FOUND]: "Книга не найдена",
    [messages.BOOK_ON_LOAN]: "Книга уже выдана",
    [messages.BOOK_ARCHIVED]: "Книга списана",
    [messages.LOAN_CREATED]: "Книга выдана",
  },
  en: {
    [messages.BOOK_NOT_FOUND]: "Book not found",
    [messages.BOOK_ON_LOAN]: "Book is already on loan",
    [messages.BOOK_ARCHIVED]: "Book is archived",
    [messages.LOAN_CREATED]: "Book loaned",
  },
});
```

`I18nizer` хранит словари «код → текст» по языкам. Аргументы конструктора: язык по умолчанию, имя заголовка и имя параметра строки запроса, из которых берётся язык, и сами словари. Язык выбирается так: сначала `?locale=`, потом заголовок `x-locale`, а если такого словаря нет — язык по умолчанию («?locale= важнее заголовка x-locale») ([подробнее](../packages/api.md#i18nizer)).

```ts title="03-responses/server.ts"
import "reflect-metadata";
import { Server } from "@aom-js/api";

import { i18nizer } from "./i18n";
import { router } from "./router";

const { API_HOST = "http://localhost:3000", API_PORT = "3000" } = process.env;

// третий аргумент — локализатор: без него клиент получает коды сообщений, а не тексты
export default new Server({ url: API_HOST, port: +API_PORT, name: "LIBRARY" }, router, i18nizer);
```

Локализатор — третий аргумент `Server`. Сервер добавляет в него словари ядра (`ru` и `en` для всех кодов `AOM_API:…`) и перед отправкой прогоняет через него каждый ответ — данные, ошибки, `404` адреса без маршрута и сам документ OpenAPI:

```bash
curl http://localhost:3000/api/books/9                    # {"message":"Книга не найдена","status":404}
curl http://localhost:3000/api/books/9?locale=en          # {"message":"Book not found","status":404}
curl -X POST -H 'x-locale: en' http://localhost:3000/api/books/2/loan
                                                          # {"message":"Book is already on loan","status":409,"data":{"id":2}}
```

Без локализатора сервер отвечает теми же кодами — клиент может переводить их сам.

## Корень и дерево маршрутов

```ts title="03-responses/root.ts"
import { BaseRootController, RouteElement, RoutesStructure } from "@aom-js/api";
import { Controller, OpenApi } from "@aom-js/router";
import { ComponentSchema } from "@aom-js/schemer";

export const docs = new OpenApi({ title: "Library API", version: "1.0.0" });

// классы ответа корня: свои у каждого модуля, чтобы потом добавить в них поля (например, доступ)
@ComponentSchema()
class LibraryRoute extends RouteElement {}

@ComponentSchema()
class LibraryRoutes extends RoutesStructure<LibraryRoute> {}

/** Корень модуля: список маршрутов на `GET /`, документ на `GET /openapi.json`. */
@Controller()
export class ModuleRoot extends BaseRootController {
  static readonly RoutesStructure = LibraryRoutes;

  static readonly RouteElement = LibraryRoute;

  readonly ident = "library";

  readonly docs = docs;

  // у маршрутов этого модуля нет своих маркеров — переносить в список нечего
  markersToRoute() {}
}
```

```ts title="03-responses/router.ts"
import { Bridge, Controller, Router } from "@aom-js/router";

import { Books } from "./books";
import { docs, ModuleRoot } from "./root";

@Controller()
@Bridge("/books", Books)
class Api {}

@Controller()
@Bridge("/", ModuleRoot)
@Bridge("/api", Api)
class Index {}

export const router = new Router(Index, docs);
```

Корень — тот же, что в [первой главе](01-first-service.md): отдаёт документ на `GET /openapi.json`. В каждом мосте один сегмент пути: `/api` → `/books` → `` /${BookID} `` → `/loan`.

## Проверка

Тест `examples/03-responses/responses.test.ts` поднимает роутер дважды. Без локализатора — проверяет статусы и тела: «карточка отвечает данными книги», «нет книги — 404 с кодом сообщения в message», «книга уже выдана — 409 с подробностями в data», «своя ошибка-наследник отвечает своим статусом 410», «успешная выдача отвечает MessageResponse, повторная — 409», «без I18nizer клиент получает коды, а не тексты», «документ OpenAPI описывает ответы маршрута по статусам», «успешный ответ без аргументов JSONSchema берёт статус и описание своего класса», «data в схеме ошибки необязательное: в теле без подробностей его нет». Через `server.ts` с локализатором — переводы: «без указания языка — русский текст», «язык берётся из ?locale= или из заголовка x-locale», «?locale= важнее заголовка x-locale», «документ OpenAPI тоже переводится, вместе с текстами ядра», «адрес без маршрута тоже отвечает текстом на языке запроса». Остальные проверки — к подводным камням ниже.

## Подводные камни

- **Класс ошибки без `@ComponentSchema`** роняет сборку роутера: `SchemasCollector.extract: "TeapotResponse" is not a ComponentSchema class or scalar constructor`. Декоратор родителя не наследуется — его ставят на каждый класс, который передают в `@Responses` («класс ошибки без @ComponentSchema роняет сборку роутера»).
- **`throw new Error("Книга не найдена")`** вместо `ErrorMessage` не дойдёт до клиента: сервер не отдаёт текст чужих исключений и отвечает `500` с кодом `AOM_API:SERVER_ERROR` («обычный Error уходит клиенту как 500 без своего текста»; [конвейер запроса](../packages/api.md#конвейер-http-запроса-server)).
- **Два ответа с одним статусом** в `@Responses` одного маршрута не уживаются: в документе останется последний («два ответа с одним статусом — в документе остаётся последний»). Своя ошибка-наследник со статусом `404` рядом с `NotFoundResponse` затрёт его описание — разные смыслы с одним статусом различают кодом в `message`, а не классом.
- **Значение заголовка языка сравнивается целиком**: `x-locale: en-US` не найдёт словарь `en` и вернёт язык по умолчанию («значение заголовка сравнивается целиком: en-US — это язык по умолчанию»). Поэтому `Accept-Language` браузера (`en-US,en;q=0.9`) в качестве такого заголовка не годится.
- **Код заменяется везде**, где встретился в тексте ответа, — и в данных пользователя тоже («код заменяется в любом месте ответа, и в данных тоже»). Отсюда префикс модуля в кодах.

Дальше — [ресурс из схемы данных](04-crud.md): список, карточка, создание, правка и удаление записи без ручного кода на каждый маршрут.
