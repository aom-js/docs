---
title: "@aom-js/api"
sidebar:
  label: "@aom-js/api"
  order: 4
---

Пакет «батареек» над `@aom-js/router`: HTTP-сервер на `node:http`, билдеры контроллеров из компонент-схем, базовые контроллеры (корень модуля, доступ, авторизация, ID-параметры, логгер), классы ответов и ошибок, локализатор. Документ — единый источник истины по `Server`, `RouteMatcher`, `I18nizer`, билдерам, `BaseRootController`, `BaseAccessController`, auth-middleware, `IDController`, `Logger` и ответам.
Читать до: [`@aom-js/router`](router.md) (курсоры, маршруты, `OpenApi`), [`@aom-js/schemer`](schemer.md) (`PropertySchema`, `Schemer.validate`).

## Назначение и место в стеке

Роутер (`@aom-js/router`) умеет разложить дерево контроллеров в список маршрутов и исполнить маршрут над объектом значений запроса, но не знает ни про сокеты, ни про HTTP-статусы, ни про валидацию тела. `@aom-js/api` закрывает этот разрыв: `Server` (`packages/api/src/server/http.ts`) поднимает `node:http`, сопоставляет входящий путь с маршрутом, готовит значения (`body`/`query`/`params`/`cookies`/`headers`), вызывает `route.apply(...)` и превращает возвращённое значение в HTTP-ответ. Всё остальное в пакете — переиспользуемые контроллеры и схемы, которые кладутся в цепочки маршрутов приложения.

Зависимости: `@aom-js/core` (мета-классы для `AomAccessCore`), `@aom-js/schemer` (`@ComponentSchema`, `Schemer.validate`), `@aom-js/router` (декораторы, `Router`, `OpenApi`), плюс `ws`, `dayjs`, `es-toolkit`, `reflect-metadata` (`packages/api/package.json` (`dependencies`)). Другие пакеты ядра от `api` не зависят. Полный граф пакетов и схема сборки монорепо — в [Архитектура ядра](../architecture.md) §«Состав…».

Каталог `src/constants` (коды сообщений и словари) не попадает в публичный экспорт: он не реэкспортируется из `src/index.ts` (§«Ограничения»). Каталог `src/controllers/events` (WebSocket-точки и SSE-ссылки) входит в публичный вход через `src/controllers/index.ts` — §«WebSocket-точки», §«SSE-ссылки».

## Публичный API

### Сервер и локализация

| Экспорт                                  | Сигнатура                                                                                                                                                                                                                                                                                                                                | Назначение                                                                                                                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Server`                                 | `new Server(settings: AomServerSettings, router: Router, i18nizer?: I18nizer)`; `readonly server: http.Server`; `static routesAmount: number`; `stop(): Promise<void>`; `static stopAll(): Promise<void>`                                                                                                                                                                                            | HTTP-сервер вокруг роутера; `listen()` вызывается в конструкторе; `stop()`/`stopAll()` — аккуратная остановка                                                                                                                                  |
| `I18nizer`                               | `new I18nizer(defaultLocale?, headerKey?, queryKey?, localesStruct?, init?)`; `defineLocale(headers, query)`, `localize(text, locale)`, `addLocalesStruct(struct)`, `addLocalesMap(locale, map)`, `setDefaultLocale(locale)`, `getDefaultLocale()`, `getLocales()`, `JSONSchema(in?)`; статики `DEFAULT_LOCALE`/`HEADER_KEY`/`QUERY_KEY` | Подстановка текстов вместо кодов сообщений в готовом ответе                                                                                                                                       |
| `I18nizerInitFunction`, `I18nizerInPath` | `(i18n: I18nizer) => void \| Promise<void>`; `'query' \| 'header'`                                                                                                                                                                                                                                                                       | Типы `I18nizer`                                                                                                                                                                                   |
| `AomServerSettings`                      | `{ port: number; url: string; name?: string; bodyLimit?: number; protocolHeaders?: string[] }`                                                                                                                                                                                                                                                                       | Настройки сервера; `bodyLimit` — глобальный лимит JSON-тела в байтах, `0` — без ограничения, по умолчанию `DEFAULT_BODY_LIMIT`; `protocolHeaders` — какие заголовки WebSocket-клиент может передать подпротоколом (не задано — все, `[]` — никакие)                                                                    |
| `parseJsonBody`                          | `parseJsonBody(req: IncomingMessage, options?: BodyParseOptions): Promise<any>`                                                                                                                                                                                                                                                          | Разбор JSON-тела запроса с лимитом размера; вызывается `Server` лениво (см. §«Ленивое тело запроса и лимит размера»), но не зависит от него — готовый кирпич для адаптеров чужих HTTP-фреймворков |
| `BodyParseOptions`                       | `{ limit?: number }`                                                                                                                                                                                                                                                                                                                     | Опции `parseJsonBody`; `limit: 0` — без ограничения                                                                                                                                               |
| `protocolHeaders`                        | `protocolHeaders(value, allowed?): Record<string, string>` | Развёртка `Sec-WebSocket-Protocol` в обычные заголовки (раздел «WebSocket-точки») |
| `DEFAULT_BODY_LIMIT`                     | `1_048_576` (1 МиБ)                                                                                                                                                                                                                                                                                                                      | Лимит тела по умолчанию, если не заданы `@BodyOptions` и `AomServerSettings.bodyLimit`                                                                                                            |
| `BODY_UNREAD`                            | `unique symbol`                                                                                                                                                                                                                                                                                                                          | Метка на ошибке `parseJsonBody`: поток начали читать и бросили на полпути — вызывающий код обязан закрыть соединение (`Connection: close`), а не переиспользовать его                             |

### Билдеры

| Экспорт                                                                                    | Сигнатура                                                                                                                               | Назначение                                                                                        |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `BodyBuilder`                                                                              | `BodyBuilder<T>(schema: T, description?: string)` → класс с `body: InstanceType<T>`, `static Body`, `static JSONSchema(description?)`   | Валидация JSON-тела по схеме + `RequestBody` в OpenAPI                                            |
| `QueryStringBuilder`                                                                       | `QueryStringBuilder<T>(schema: T)` → `query`, `static Query`, `static NotEmpty`, `static JSONSchema()`                                  | Валидация query-string + `QueryParameters`                                                        |
| `HeadersBuilder`                                                                           | `HeadersBuilder<T>(schema: T)` → `headers`, `static Headers`, `static ImplicitHeaders`                                                  | Валидация заголовков; `Headers` дополнительно описывает их в OpenAPI                              |
| `CookieBuilder`                                                                            | `CookieBuilder<T>(schema: T)` → `cookies`, `static Cookie`, `static NotEmpty`                                                           | Валидация cookies + `CookieParameters`                                                            |
| `ParamsBuilder`                                                                            | `ParamsBuilder<T>(schema: T)` → `params`, `value`, `static attr/jsonSchema/toString()/JSONSchema()`, `static Params`, `static NotEmpty` | Один path-параметр из компонент-схемы ровно с одним свойством                                     |
| `ResponseBuilder`                                                                          | `ResponseBuilder<T>(schema: T, status = 200)` → `static JSONSchema(description?, status?)`, `static Response`                           | Объявление `Responses` для схемы                                                                  |
| `PlainBuildersBase`, `HeaderBuildersBase`, `QueryStringBuildersBase`, `CookieBuildersBase` | `static readonly schema`; `static JSONSchema(path)`                                                                                     | Базы билдеров, **не экспортируются** из `src/index.ts` (`builders/index.ts` не включает `common`) |

### Базовые контроллеры

| Экспорт                                                                                                     | Сигнатура                                                                                                                                                                                                                                                                            | Назначение                                                       |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `BaseRootController`                                                                                        | поля `ident`, `docs: OpenApi`, `routes`; `static RoutesStructure`, `static RouteElement`, `static DocsJSON`; `markersToRoute(el, markers)`; `static InitRoutes`, `static Index`, `JSONDocs`, `Swagger`                                                                                      | Корень модуля: карта маршрутов, `/openapi.json`, `/swagger.html` |
| `RouteElement`, `RoutesStructure`                                                                           | `RouteElement {method, path, operationId}`; `RoutesStructure<RE> {ident, routes: RE[]}`                                                                                                                                                                                              | Схемы ответа `Index`                                             |
| `BaseAccessController`                                                                                      | статики `MarkerName`, `AllowedAccessTypes`, `AccessMarker`, `AccessCore`; методы `checkAccessPoint(ident, marker)`, `generateAccessMap(types, roles)`; `static Init`, `Required`, `CheckLayerPass`, `SetAccessMark`, `TypesRequired(...)`, `SetExtraAccess(...)`, `ExtraAccess(...)` | Контроль доступа через маркеры маршрутов                         |
| `AomAccessCore`, `AomAccessMapStructure`, `ActiveAccessTypes`, `IAomAccessPoint`, `AomAccessPlainStructure` | `AomAccessCore extends AomCore {extraAccess, extraAccessMiddlewares, accessTypes}`; `AomAccessMapStructure {fullAccess, structure}`                                                                                                                                                  | Мета-класс доступа и структуры карты                             |
| `AomAccessMarkerElement`, `AomAccessToModulesStructure`, `AomAccessModuleElements`, `AomAccessIdentElement` | `AomAccessMarkerElement {accessPoints, accessTypes}`; `AomAccessToModulesStructure {fullAccess, modulesAccess}`                                                                                                                                                                      | Компонент-схемы маркера и ролей                                  |
| `AuthBasic`, `BasicSecuritySchema`                                                                          | `static BASIC_AUTH: string`; `static Required`                                                                                                                                                                                                                                       | Basic-авторизация                                                |
| `AuthHeaderToken`, `HeaderTokenSecuritySchema`                                                              | `static TOKEN_NAME = 'Bearer'`, `static HEADERS_KEYS = ['authorization']`; `value`, `type`; `static Required`                                                                                                                                                                        | Bearer-токен из заголовка                                        |
| `AuthCookieToken`, `CookieTokenSecuritySchema`                                                              | `static COOKIE_NAME = 'sessionId'`; `value`; `static Required`                                                                                                                                                                                                                       | Токен из cookie                                                  |
| `IDController`, `IDValue`, `UUIDParam`, `MongoIDParam`, `NanoIDParam`, `NumberIDParam`                      | `IDValue(attr, Schema)` → класс с `static Attr/Pattern`, `value`, `static PathID/QueryID/HeaderID`, `static toString()/Param()/JSONSchema(in)`                                                                                                                                       | Типизированный параметр пути/query/заголовка                     |
| `ParamIDSchema`, `NumberIDSchema`, `MongoIDSchema`, `NanoIDSchema`, `UUIDSchema`                            | `{regexp; schema(); format(name); value(v)}`                                                                                                                                                                                                                                         | Шаблоны регулярных выражений ID                                  |
| `Logger`                                                                                                    | `static ENGINE: AomLoggerEngine = console`; `static Init`, `Attach`, `Watch`                                                                                                                                                                                                         | Логирование запросов                                             |
| `AomWebSockets`, `WebSocketsController`, `Ws`, `WebSocket` | `new AomWebSockets(onMessage?)`; `connections: Map<string, WebSocket[]>`; `send(id, data)`, `broadcast(data)`, `connect(id, socket)`, `disconnect(id, socket)`; `WebSocketsController`: поле `id`, `static Define`, `static Connect`, `static WssMap`; `Ws()` — параметр-декоратор сокета из контекста; `WebSocket` — реэкспорт из `ws` | WebSocket-точки (§«WebSocket-точки») |
| `AomServerEvents`, `formatServerEvent`, `AomServerEventsOptions`, `EventEnvelope` | `new AomServerEvents(schemas, { heartbeat?, retry?, validate? })`; `connections: Map<string, PassThrough[]>`; `connect(id, res)` → `PassThrough`, `disconnect(id, stream)`, `send(id, type, value, eventId?)`, `broadcast(type, value, eventId?)`, `sendEnvelope(id, envelope, eventId?)`, `broadcastEnvelope(envelope, eventId?)`, `JSONSchema(description, status = 200)`; `formatServerEvent(data, eventId?)` — текст кадра; `EventEnvelope<E>` — конверт `{ type, [type]: значение }` словаря | SSE-ссылки (§«SSE-ссылки») |

### Ответы

| Экспорт                                               | Сигнатура                                                                                                                                                      | Назначение                                                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `ErrorMessage`                                        | `new ErrorMessage(message, status?, data?)`; `static status = 500`, `static description`; `toJSON(): {message,status,data}`; `static JSONSchema(description?)` | База ошибок-ответов                                                                           |
| `ServerErrorResponse`                                 | `new (message, data?)`, `status = 500`                                                                                                                         | 500                                                                                           |
| `NotFoundResponse`                                    | `status = 404`                                                                                                                                                 | 404                                                                                           |
| `ConflictResponse`                                    | `status = 409`                                                                                                                                                 | 409                                                                                           |
| `PayloadTooLargeResponse`                             | `status = 413`                                                                                                                                                 | 413 (тело запроса больше лимита)                                                              |
| `WrongDataResponse`                                   | `status = 400`                                                                                                                                                 | 400                                                                                           |
| `LockedResponse`                                      | `status = 423`                                                                                                                                                 | 423                                                                                           |
| `FailedDependencyResponse`                            | `status = 424`                                                                                                                                                 | 424                                                                                           |
| `AccessDenyResponse`                                  | `status = 403`                                                                                                                                                 | 403                                                                                           |
| `PaymentRequiredResponse`                             | `status = 402`                                                                                                                                                 | 402                                                                                           |
| `AuthRequiredResponse`                                | `status = 401`                                                                                                                                                 | 401                                                                                           |
| `SeeOtherResponse`                                    | `status = 303`                                                                                                                                                 | 303                                                                                           |
| `CommonResponse`                                      | `extends ResponseJSONSchema`; `static status = 200`, `static description`                                                                                      | База успешных ответов                                                                         |
| `MessageResponse`                                     | `new (message?)`; `message?: string`                                                                                                                           | Ответ-сообщение                                                                               |
| `DataResponse`                                        | `new (message?, data?)`; `data?: any`                                                                                                                          | Сообщение с данными |
| `NumberResponse`, `BooleanResponse`, `StringResponse` | `new (value?)`; `value`                                                                                                                                        | Скалярные ответы                                                                              |

### Декораторы, функции, схемы, типы

| Экспорт                                                                                                               | Сигнатура                                                                                        | Назначение                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SafeData`                                                                                                            | `SafeData(ctor): (data) => values` (бросает `WrongDataResponse`)                                 | Валидация plain-данных через `Schemer`                                                                                                              |
| `SafeBody`, `SafeQuery`                                                                                               | `SafeBody(ctor) = Body(SafeData(ctor))`                                                          | Готовые параметр-декораторы                                                                                                                         |
| `IsNullable`                                                                                                          | `IsNullable(options?): PropertyDecorator`                                                        | `ValidateIf(value !== null)` — дословная копия одноимённого публичного экспорта `@aom-js/schemer` (см. [`@aom-js/schemer`](schemer.md)) |
| `QueryBoolean`                                                                                                        | `QueryBoolean(): PropertyDecorator`                                                              | `'true'`/`'1'` → `true`, `'false'`/`'0'` → `false`, прочее — как есть, и `IsBoolean` отклоняет                                                   |
| `TransformEmpty`, `TransformTrim`, `TransformToArray`, `TransformToDate`                                              | `TransformToDate({startOf?, endOf?, format?})`                                                   | class-transformer-преобразования                                                                                                                    |
| `plainJsonSchema`                                                                                                     | `plainJsonSchema(ctor, in): OpenApiParameterObject[]`                                            | Класс → список параметров OpenAPI                                                                                                                   |
| `responseJsonSchema`                                                                                                  | `responseJsonSchema(ctor, description?, status?): OpenApiResponse`                               | Класс → описание ответа                                                                                                                             |
| `pathVariants`                                                                                                        | `'path' \| 'query' \| 'header' \| 'cookie'`                                                      | Тип места параметра                                                                                                                                 |
| `BodyOptions`                                                                                                         | `BodyOptions(options: BodyParseOptions): MethodDecorator`                                        | Маркер-декоратор: перекрывает лимит тела для эндпоинта или для middleware маршрута; вешается на любой из них                                        |
| `BODY_OPTIONS_MARKER`                                                                                                 | `"aom:bodyOptions"`                                                                              | Ключ, под которым `@BodyOptions` кладёт `BodyParseOptions` в `route.markers`                                                                        |
| `checkLocales`                                                                                                        | `checkLocales(hint, source, target): void`                                                       | Диагностический вывод разницы: значения `source` (коды), которых нет среди ключей `target` (словарь)                                                |
| `ResponseJSONSchema`, `PlainJSONSchema`, `QueryJSONSchema`, `HeaderJSONSchema`, `ParamJSONSchema`, `CookieJSONSchema` | `static JSONSchema(...)`                                                                         | Базовые классы схем с готовым `JSONSchema`                                                                                                          |
| `HttpRequest`, `HttpResponse`, `HttpSocket`, `HttpCtx`, `SocketCtx`                                                   | `HttpCtx = {req: IncomingMessage; res: ServerResponse}`; `SocketCtx = {req; res: Stream.Duplex}` | Типы контекста                                                                                                                                      |
| `ClassConstructor`                                                                                                    | реэкспорт из `@aom-js/core`                                                                      | Тип конструктора                                                                                                                                    |

### Выгрузка цепочек (`@aom-js/api/testing`)

Второй путь пакета — `@aom-js/api/testing` (`src/testing/index.ts`, `exports` в `package.src.json`): вид шага, выведенный из классов этого пакета, и выгрузка цепочек маршрутов для тестов приложения. Живёт здесь, а не в `@aom-js/router/testing`, потому что вид `checkpoint` и `input` выводится из `BaseAccessController`, баз билдеров и `IDController`, а роутер от `api` не зависит. В рантайм сервера не входит: импортируют его только тесты и скрипт дампа.

| Экспорт | Сигнатура | Назначение |
| --- | --- | --- |
| `kindOf` | `kindOf(cursor, options?: ManifestOptions): AomCursorKind` | вид шага: `@CursorKind`, эндпоинт — `handler`, `options.kindOf` приложения, наследник `BaseAccessController` — `checkpoint`, унаследованный шаг базы билдера или `IDController` — `input`, пустой классовый шаг — `meta`, иначе `step` |
| `describeRoute`, `describeRouter` | `describeRoute(route, options?): DescribedRoute`; `describeRouter(router, options?): {version: 1; routes}` | `toJSON()` маршрута или роутера, у каждого шага `parent` (`parentsOf`) и `kind` |
| `manifestOf` | `manifestOf(router, options?): string` | текст файла дампа |
| `ManifestOptions`, `DescribedStep`, `DescribedRoute` | типы | `kindOf?` — вид классов приложения, `undefined` — решают правила пакета |

Порядок правил вида, граница «ядро — приложение» и общие правила цепочки — [Тестирование приложения](../testing.md).

## Внутренние модули

| Файл                                                                                 | Ответственность                                                                                                                                                                                                                                                      | Ключевые символы                                                                                           |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/api/src/index.ts`                                                          | `import "reflect-metadata"` и реэкспорт `server`/`builders`/`types`/`controllers`/`decorators`/`functions`/`responses`/`schemas`; `constants` не реэкспортируются                                                                                                    | —                                                                                                          |
| `packages/api/src/server/http.ts`                                                    | HTTP-сервер и сопоставление путей; безопасный разбор URL; парсинг тела/cookies/query/заголовков; диспетчеризация результата (строка/поток/JSON/ошибка); единый `catch` с кодами по статусу; обработчик `upgrade`                                                     | `Server`, `RouteMatcher` (не экспортируется), `STATUS_ERROR_MESSAGES`                                      |
| `packages/api/src/server/i18nizer.ts`                                                | Словари локалей, выбор локали, regexp-подстановка текстов                                                                                                                                                                                                            | `I18nizer`                                                                                                 |
| `packages/api/src/server/protocol-headers.ts`                                        | Развёртка подпротокола WebSocket в заголовки | `protocolHeaders` |
| `packages/api/src/server/types.ts`                                                   | Настройки сервера, включая `bodyLimit` и `protocolHeaders`                                                                                                                                                                                                                               | `AomServerSettings`                                                                                        |
| `packages/api/src/server/body.ts`                                                    | Разбор JSON-тела с лимитом размера; не зависит от `Server`, экспортируется наружу пакета                                                                                                                                                                             | `parseJsonBody`, `DEFAULT_BODY_LIMIT`, `BODY_UNREAD`, `BodyParseOptions`                                   |
| `packages/api/src/decorators/body-options.ts`                                        | Маркер-декоратор лимита тела на маршруте                                                                                                                                                                                                                             | `BodyOptions`, `BODY_OPTIONS_MARKER`                                                                       |
| `packages/api/src/builders/common.ts`                                                | Базы билдеров с `static schema` и `JSONSchema(path)`; бросает, если `schema` не задана                                                                                                                                                                               | `PlainBuildersBase`, `HeaderBuildersBase`, `QueryStringBuildersBase`, `CookieBuildersBase`                 |
| `packages/api/src/builders/{body,query-string,headers,cookie,params,response}.ts`    | Фабрики контроллеров из компонент-схем                                                                                                                                                                                                                               | `BodyBuilder`, `QueryStringBuilder`, `HeadersBuilder`, `CookieBuilder`, `ParamsBuilder`, `ResponseBuilder` |
| `packages/api/src/controllers/root.ts`                                               | Корневой контроллер модуля и схемы его ответа                                                                                                                                                                                                                        | `BaseRootController`, `RouteElement`, `RoutesStructure`                                                    |
| `packages/api/src/controllers/swagger.ts`                                            | HTML-строка Swagger UI (default-экспорт)                                                                                                                                                                                                                             | `swagger`                                                                                                  |
| `packages/api/src/controllers/access/access-controller.ts`                           | Маркеры доступа, `Required`, `TypesRequired`, слои доступа, карта доступа                                                                                                                                                                                            | `BaseAccessController`                                                                                     |
| `packages/api/src/controllers/access/{types,schemas,init}.ts`                        | Мета-класс `AomAccessCore`, компонент-схемы маркера и ролей, пустой `enum AccessTypes`                                                                                                                                                                               | `AomAccessCore`, `AomAccessMarkerElement`, `AomAccessToModulesStructure`, `AccessTypes`                    |
| `packages/api/src/controllers/auth/{basic,headerToken,cookieToken}.ts`               | Извлечение учётных данных и security-схемы OpenAPI                                                                                                                                                                                                                   | `AuthBasic`, `AuthHeaderToken`, `AuthCookieToken`                                                          |
| `packages/api/src/controllers/id-value/{controller,schemas}.ts`                      | Типизированный ID-параметр и шаблоны регулярных выражений                                                                                                                                                                                                            | `IDController`, `IDValue`, `UUIDParam`, `UUIDSchema`                                                       |
| `packages/api/src/controllers/logger/{logger,types}.ts`                              | Логирование запроса по событиям `finish`/`error`                                                                                                                                                                                                                     | `Logger`, `AomLoggerEngine` (тип не экспортируется наружу)                                                 |
| `packages/api/src/controllers/events/{websockets,sse}.ts` | WebSocket-точки поверх `ws`: реестр соединений, рукопожатие, приём сообщений; SSE-ссылки: реестр потоков, кадр события, описание ответа. Реэкспортируется из `controllers/index.ts` (кроме экспорта по умолчанию `websockets.ts`) | `AomWebSockets`, `WebSocketsController`, `Ws`, `WebSocket`, `AomServerEvents`, `formatServerEvent` |
| `packages/api/src/responses/{error-message,error-responses,data-responses,types}.ts` | Классы ответов и ошибок со `status`, `toJSON`, `JSONSchema`                                                                                                                                                                                                          | `ErrorMessage`, `*Response`, `CommonResponse`                                                              |
| `packages/api/src/decorators/{safe-data,is-nullable,query-boolean,transforms}.ts`    | Валидация через `Schemer` и обёртки class-validator/class-transformer                                                                                                                                                                                                | `SafeData`, `IsNullable`, `QueryBoolean`, `Transform*`                                                     |
| `packages/api/src/functions/{json-schema,check-locales}.ts`                          | Класс → структуры OpenAPI; диагностика словарей                                                                                                                                                                                                                      | `plainJsonSchema`, `responseJsonSchema`, `checkLocales`                                                    |
| `packages/api/src/schemas/json-schema.ts`                                            | Базовые классы со `static JSONSchema()`                                                                                                                                                                                                                              | `ResponseJSONSchema`, `PlainJSONSchema` и наследники                                                       |
| `packages/api/src/constants/messages/*`                                              | Коды вида `AOM_API:<NAME>`                                                                                                                                                                                                                                           | `PREFIX`, `PREFIX_VALUE`                                                                                   |
| `packages/api/src/constants/locales/{ru,en}/errors.ts`                               | Словари для кодов ошибок (все коды `messages/errors.ts` переведены на обе локали)                                                                                                                                                                              | `locales`                                                                                                  |
| `packages/api/src/types/{http,common}.ts`                                            | Алиасы `node:http`/`node:stream`, реэкспорт `ClassConstructor`                                                                                                                                                                                                       | `HttpCtx`, `SocketCtx`                                                                                     |
| `packages/api/{tsconfig.build*.json,package.json,package.src.json}`                  | Три прохода `tsc`; `package.json` генерируется корневым `scripts/prebuild.js` из общей версии корневого `package.json`, `package.src.json` и `scripts/jsons/package.dist.json` (`scripts/files.js` (`srcPackageJsons`), `scripts/prebuild.js`)                                     | —                                                                                                          |

## Ключевые механизмы

### Конвейер HTTP-запроса (Server)

Конструктор регистрирует в `RouteMatcher` все `router.routes` (наращивая статический счётчик `Server.routesAmount`) и все `router.sockets`, вливает встроенные словари пакета в переданный локализатор и сразу вызывает `listen(settings.port)` (`server/http.ts` (`Server`)).

**Разбор адреса запроса — безопасно относительно хоста.** `req.url` — это путь запроса, а не адрес: абсолютная форма (`GET http://evil.com/admin`), authority-form (`//evil.com/admin`) и её вариант с обратным слэшем (`/\evil.com/admin` — WHATWG для `http`/`https` считает `\` тем же `/`) не должны позволять хосту из запроса участвовать в сопоставлении маршрута — иначе прокси/WAF, фильтрующий по пути, обходится этим же запросом. `parseRequestUrl` фиксирует хост константой (`new URL("http://localhost")`) и заполняет только `pathname`/`search` через сеттеры — они разбирают строку в «path state»/«query state» отдельно от хоста, а не через общий алгоритм разрешения относительных ссылок (`new URL(path, base)`), поэтому ведущие `//` или `\` не могут быть приняты за network-path reference и подменить хост. Префикс из `settings.url` (если есть) приклеивается спереди. Фрагмент (после `#`) на сервер по HTTP-спеке не попадает — он отбрасывается вручную, до присвоения `pathname`/`search`, потому что эти сеттеры не знают про `#` как отдельный разделитель и percent-кодируют его как обычный символ пути/query.

`packages/api/src/server/http.ts` (`parseRequestUrl`):

```ts
const parseRequestUrl = (rawUrl: string | undefined): URL => {
  const requestPath = rawUrl && rawUrl.startsWith("/") ? rawUrl : `/${rawUrl || ""}`;
  const prefixPath = new URL(settings.url).pathname.replace(/\/$/, "");
  const joinedPath = prefixPath + requestPath;
  const hashIndex = joinedPath.indexOf("#");
  const combinedPath = hashIndex === -1 ? joinedPath : joinedPath.slice(0, hashIndex);
  const queryIndex = combinedPath.indexOf("?");
  const url = new URL("http://localhost");
  url.pathname = queryIndex === -1 ? combinedPath : combinedPath.slice(0, queryIndex);
  url.search = queryIndex === -1 ? "" : combinedPath.slice(queryIndex);
  return url;
};
```

На каждый запрос обработчик выставляет CORS-заголовки (`Access-Control-Allow-Origin: *`, `-Methods` фиксированным списком, `-Headers` — отражением `access-control-request-headers`, если браузер его прислал, иначе `Content-Type,Authorization`) и только затем разбирает адрес и ищет маршрут. Ответ `204` на `OPTIONS` — это запасной preflight-дефолт: он отдаётся только тогда, когда для `OPTIONS` на этот путь нет собственного маршрута; если приложение объявило `@Options()`-эндпоинт, исполняется он (`server/http.ts` (`Server`)). Далее собираются `query` (повтор ключа → массив, `http.ts` (`Server.structurizeSearchParams`)) и `headers` (только определённые значения, `http.ts` (`Server.definedHeadersValues`)), определяется локаль (`http.ts` (`Server`)). Отсутствие совпадения — `404` c телом `NotFoundResponse(PATH_NOT_FOUND)`, переведённым локализатором, как и прочие ответы (`http.ts` (`Server`)). Иначе вызывается `route.apply` с полным набором значений, включая всегда пустые `session` и `files` (`http.ts` (`Server`)).

`packages/api/src/server/http.ts` (`Server`):

```ts
if (typeof result === "string") {
  if (!res.getHeader("Content-Type")) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
  }
  res.writeHead(200);
  res.end(localize(result));
} else if (result instanceof Readable) {
  if (!res.getHeader("Content-Type")) {
    res.setHeader("Content-Type", "application/octet-stream");
  }
  Stream.pipeline(result, res, (streamErr) => {
    if (!streamErr) return;
    if (streamErr.code === "ERR_STREAM_PREMATURE_CLOSE" && res.destroyed) return; // клиент ушёл сам
    console.error("Stream error:", streamErr);
    if (res.destroyed) return;
    if (res.headersSent) {
      res.destroy();
    } else {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify(new ServerErrorResponse(messages.SERVER_ERROR)));
    }
  });
} else {
  let status = 200;
  if (result instanceof ErrorMessage) {
    status = result.status;
  } else if (result instanceof Error) {
    status = 500;
  }
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(localize(JSON.stringify(result)));
}
```

**Строковый результат — `text/plain`, а не `text/html`.** Строка, возвращённая обработчиком, часто несёт значения из запроса или из хранилища; отдать её как `text/html` без экранирования значило бы дать браузеру исполнить эти данные как разметку — отражённый XSS. Поэтому по умолчанию тип — `text/plain; charset=utf-8`, и сервер сам его не эскейпит (эскейпить нечего — это не HTML). Если обработчику нужен настоящий HTML, он выставляет `Content-Type` сам через `res.setHeader(...)` до `return`: `res.writeHead(200)` ниже вызывается без объекта заголовков и уже выставленный `setHeader` не перетирает (перетёр бы только `writeHead` с тем же ключом в собственном объекте заголовков). Оба готовых примера приёма — в этом же пакете: `BaseRootController.Swagger` (`controllers/root.ts` (`BaseRootController.Swagger`)) и `BaseVisualizerController.Page` (`controllers/visualizer.ts` (`BaseVisualizerController.Page`)) выставляют `Content-Type: text/html; charset=utf-8` вручную перед `return this.html`/`return swagger.toString()`.

Потоковый результат распознаётся именно как `Readable` (а не любой `Stream`) и пайпится через `Stream.pipeline`, а не `pipe`: `pipeline` сам разрушает источник при ошибке или при обрыве соединения клиентом, иначе оборванное скачивание оставляет источник (файл, сокет) висеть открытым; `Content-Type: application/octet-stream` подставляется только тогда, когда обработчик сам не выставил свой через `setHeader` (`setHeader`, в отличие от `writeHead`, не отправляет заголовки сразу). Уход клиента — `ERR_STREAM_PREMATURE_CLOSE` при уже разрушенном ответе (оборванное скачивание, закрытая SSE-ссылка) — не ошибка сервера и в `console.error` не пишется; прочие ошибки потока логируются как `Stream error:`.

**Единый `catch` с кодом ошибки по статусу.** Клиенту никогда не уходит текст или стек стороннего исключения — только готовый `ErrorMessage`, код из `STATUS_ERROR_MESSAGES` по числовому `status` исключения (400-599), либо общий `SERVER_ERROR`. Отдельно нормализуется финальный статус: `1xx` (промежуточный, не окончательный ответ — иначе клиент завис бы до таймаута) и всё вне диапазона `200..999` (`writeHead` с таким значением уронил бы процесс) заменяются на `ServerErrorResponse`. Если обработчик уже сам начал отвечать (`headersSent`) до броска — повторный `writeHead` невозможен (`ERR_HTTP_HEADERS_SENT`), поэтому соединение просто обрывается (`res.destroy()`). Ожидаемый ответ ниже 500 (`NotFoundResponse`, ошибка проверки и т. п.) сервер не пишет: его записывает `Logger` вместе с запросом. 5xx и неожиданное исключение уходят в `console.error` вместе с самим исключением, а не в `Logger.ENGINE` — движок журнала получает записи `Logger` (`http.ts` (`logFailure`)). Логирование само обёрнуто в `try/catch`: если у брошенного объекта ломающийся `util.inspect.custom` (значит, само `console.error` бросает), сервер тоже не падает, а обрывает соединение.

`packages/api/src/server/http.ts` (`STATUS_ERROR_MESSAGES`, `Server`):

```ts
const STATUS_ERROR_MESSAGES: Record<number, string> = {
  400: messages.ERROR_WRONG_DATA,
  401: messages.ERROR_AUTH_REQUIRED,
  402: messages.PAYMENT_REQUIRED,
  403: messages.ERROR_ACCESS_DENY,
  404: messages.ERROR_NOT_FOUND,
  409: messages.ERROR_CONFLICT,
  413: messages.ERROR_PAYLOAD_TOO_LARGE,
  423: messages.ERROR_DATA_LOCKED,
  424: messages.ERROR_WRONG_DEPENDENCY,
  500: messages.SERVER_ERROR,
};
// ...
let errorResponse: ErrorMessage;
if (err instanceof ErrorMessage) {
  errorResponse = err;
} else if (Number.isInteger(err?.status) && err.status >= 400 && err.status <= 599) {
  errorResponse = new ErrorMessage(
    STATUS_ERROR_MESSAGES[err.status] ?? messages.ERROR_MESSAGE,
    err.status,
  );
} else {
  errorResponse = new ServerErrorResponse(messages.SERVER_ERROR);
}
if (
  !Number.isInteger(errorResponse.status) ||
  errorResponse.status < 200 ||
  errorResponse.status > 999
) {
  errorResponse = new ServerErrorResponse(messages.SERVER_ERROR);
}
```

Сериализация и локализация ошибки выполняются до `writeHead`: если `data` не сериализуется (`BigInt`, циклы), заголовки ещё не отправлены и можно откатиться на безопасный `500` во внешнем `try/catch` (`http.ts` (`Server`)). Снаружи всей логики запроса есть ещё одна защитная сетка (`http.ts` (`Server`)): она ловит исключения из самого разбора адреса или другой подготовки до основного `try` — без нее асинхронный бросок здесь стал бы необработанным отклонением промиса и уронил бы процесс.

### Остановка: `stop()` и `Server.stopAll()`

`stop()` вызывает `server.close()` — сервер больше не принимает соединения, простаивающие keep-alive соединения закрываются (так делают и Node 19+, и Bun). Долгие соединения сами не завершатся, поэтому `stop()` закрывает их сразу: ответы с `Content-Type: text/event-stream` завершаются (`res.end()`), сокеты после `upgrade` (WebSocket) разрываются — клиенты переподключаются к другой копии или к перезапущенному процессу. Запросы в работе дописывают ответ; их соединение закрывается после ответа (`Connection: close` или конец сокета, если заголовки уже ушли), запрос, пришедший во время остановки по уже открытому соединению, тоже получает `Connection: close`. `Promise` разрешается, когда `http.Server` закрыт; он не отклоняется, повторный вызов возвращает тот же `Promise`. Своего предела времени нет — общий таймаут остановки задаёт приложение.

Сервер учитывает свои ответы в работе и сокеты после `upgrade` сам: общий для процесса `WebSocketServer` (`packages/api/src/controllers/events/websockets.ts`) не знает, какому серверу принадлежит сокет.

`Server.stopAll()` останавливает все серверы процесса, которые ещё работают: сервер попадает в список при создании и выходит из него по событию `close` своего `http.Server`. Сигналы процесса `Server` не ловит: порядок остановки (HTTP → шина → база) и вызов `process.exit` — дело приложения.

```ts
// псевдокод: остановка в приложении
process.once("SIGTERM", async () => {
  await Server.stopAll(); // HTTP: новые не берём, начатые доводим
  await transfer.stop(); // @aom-js/transfer: то же для исполнителей шины
  await nats.drain();
  await db.close();
  process.exit(0);
});
```

### Ленивое тело запроса и лимит размера

Сервер не читает тело до запуска маршрута: в контекст маршрута кладётся не готовое тело, а обёртка `lazy(...)` из `@aom-js/router`: разбор запускается не раньше первого обращения через `@Body` в цепочке маршрута, выполняется максимум один раз за запрос, а отказ (400 на битом JSON, 413 на превышении лимита) запоминается и переигрывается при повторном обращении к тому же `lazy`. Маршрут, которому тело не нужно, не читает поток вообще — например, отказ в доступе выше по цепочке курсоров отвечает сразу, не дожидаясь тела, которое клиент мог заявить в `Content-Length`, но не прислать.

`packages/api/src/server/http.ts` (`Server`):

```ts
const result = await match.route.apply({
  req,
  res,
  ctx: { req, res },
  body: lazy(async () => {
    const markerOptions: BodyParseOptions | undefined = match.route.markers[BODY_OPTIONS_MARKER];
    const limit = markerOptions?.limit ?? settings.bodyLimit ?? DEFAULT_BODY_LIMIT;
    try {
      return await parseJsonBody(req, { limit });
    } catch (err: any) {
      if (err?.[BODY_UNREAD] && !res.headersSent) {
        res.setHeader("Connection", "close");
      }
      throw err;
    }
  }),
  headers,
  query,
  params: match.params,
  cookies: this.parseCookies(req),
  session: {},
  files: {},
});
```

Сам разбор вынесен в `packages/api/src/server/body.ts` и от `Server` не зависит: `parseJsonBody(req, { limit })` — самостоятельная функция, экспортированная из пакета как готовый кирпич для адаптеров чужих HTTP-фреймворков. Лимит вычисляется не при старте сервера, а в момент обращения к телу, когда маршрут уже известен и его маркеры собраны: маркер маршрута `@BodyOptions({ limit })` → `AomServerSettings.bodyLimit` → дефолт пакета `DEFAULT_BODY_LIMIT = 1_048_576` (1 МиБ, `body.ts` (`DEFAULT_BODY_LIMIT`)); `limit: 0` на любом из трёх уровней означает «без ограничения» (`body.ts` (`parseJsonBody`)).

`@BodyOptions` (`decorators/body-options.ts`) — маркер-декоратор: вешается и на эндпоинт, и на middleware маршрута. Маркеры применяются в порядке курсоров, эндпоинт — последний, поэтому его значение перекрывает значение middleware — в обе стороны, и увеличивая, и уменьшая унаследованный лимит:

```ts
@Middleware()
@BodyOptions({ limit: 4096 })
static async Mw() {}

@Get("/override-down")
@Before(App.Mw)
@BodyOptions({ limit: 1024 })
static async endpoint() {}
// route.markers[BODY_OPTIONS_MARKER] === { limit: 1024 } — эндпоинт победил
```

**Отказ по размеру — `413 PayloadTooLargeResponse`, код `ERROR_PAYLOAD_TOO_LARGE`.** Если заявленный `Content-Length` уже больше лимита, `parseJsonBody` отклоняет запрос до первого чтения потока (`body.ts` (`parseJsonBody`)): рантайм сам сольёт недочитанное тело, соединение остаётся рабочим, `Connection: close` не нужен. Если длина заранее не заявлена (`Transfer-Encoding: chunked`) и превышение обнаруживается уже по ходу чтения, ответ несёт `Connection: close` (`body.ts` (`parseJsonBody`, `BODY_UNREAD`), `http.ts` (`Server`)): часть тела к этому моменту уже вычитана из TCP-потока, и её недочитанный остаток на живом keep-alive соединении был бы разобран как начало следующего запроса. Практическая оговорка: этот путь достижим только там, где длина заранее неизвестна — при заявленном `Content-Length` меньше лимита node сам обрежет тело до лимита раньше, чем сработает счётчик в `onData`. `413` есть в общей карте `STATUS_ERROR_MESSAGES`, по которой единый `catch` определяет код ответа и для стороннего исключения с числовым `status` (`http.ts` (`STATUS_ERROR_MESSAGES`)).

Ошибки разбора тела (`400 WrongDataResponse` на битом JSON и `413 PayloadTooLargeResponse` на превышении лимита) возникают внутри цепочки маршрута, а не до неё — их видят `@Run`-перехватчики и middleware приложения и могут подменить или залогировать.

`content-type`, отличный от `application/json`, даёт `{}`, и поток при этом не трогается вовсе (`body.ts` (`parseJsonBody`)) — на этом держится загрузка файлов через formidable в приложениях.

Оговорка про порядок: выигрыш «неавторизованный не заставляет читать тело» держится, только пока проверки доступа идут раньше по списку курсоров и сами не обращаются к `@Body`. Если повесить билдер тела (`@Before` с параметром `@Body`) раньше авторизации, тело снова читается первым.

```ts
// поднять лимит на конкретном эндпоинте выше глобального
@Post("/import")
@BodyOptions({ limit: 10 * 1024 * 1024 })
static async import(@Body() body: ImportPayload) { /* ... */ }

// снять ограничение глобально (например, за обратным прокси со своим лимитом)
const settings: AomServerSettings = { port: 3000, url: "http://localhost", bodyLimit: 0 };
```

Ответ 413:

```json
{ "message": "AOM_API:ERROR_PAYLOAD_TOO_LARGE", "status": 413 }
```

### RouteMatcher: путь → RegExp

`RouteMatcher` (не экспортируется) хранит маршруты по методу в нижнем регистре, а скомпилированный шаблон — по строке пути. Шаблон компилирует `compilePath` из `@aom-js/router` (`packages/router/src/common/path.ts`): одним проходом заменяет сегменты `:name(pattern)` на группу `(pattern)`, а `:name` без шаблона — на `([^/]+)`, попутно собирая имена параметров в порядке их групп; всё остальное экранируется как литерал (маршрут `/file.json` не совпадает с `/fileXjson`; синтаксис regexp понимается буквально только в шаблоне параметра), результат оборачивается в `^...$`. Шаблон валидатора параметра вшит в общий regexp пути, поэтому значение не по шаблону отсекается уже на сопоставлении пути (`404`), отдельной проверки параметров нет. Та же грамматика проверяет адреса в прогонщике зондов `@aom-js/router/testing`. Компиляция выполняется один раз при регистрации маршрута (`RouteMatcher.addRoute`), а не на каждом запросе. `RouteMatcher.match` перебирает маршруты метода в порядке регистрации и возвращает первый, чей regexp совпал, раскладывая группы по собранным именам параметров.

### I18nizer

Словари — `Record<locale, Record<code, text>>`. При каждом `addLocalesMap` перестраивается regexp локали: ключи экранируются, сортируются по убыванию длины и склеиваются через `|` с флагом `g` (`i18nizer.ts` (`I18nizer.addLocalesMap`, `I18nizer.buildRegexpMap`)). `localize` выполняет `text.replace(RE, code => dict[code] ?? code)` — то есть подстановка идёт по **уже сериализованной** строке ответа, а не по объекту (`i18nizer.ts` (`I18nizer.localize`)). `defineLocale` берёт первое непустое из `[query[queryKey], headers[headerKey.toLowerCase()]]`, при отсутствии такой локали в словаре откатывается на `defaultLocale`, затем на первую локаль структуры (`i18nizer.ts` (`I18nizer.defineLocale`)).

`packages/api/src/server/i18nizer.ts` (`I18nizer`):

```ts
  constructor(
    private defaultLocale: I18nLocale = I18nizer.DEFAULT_LOCALE,
    private headerKey: string = I18nizer.HEADER_KEY,
    private queryKey: string = I18nizer.QUERY_KEY,
    private localesStruct: I18nLocalesStructure = {},
    init?: I18nizerInitFunction
  ) {
```

Значения по умолчанию читаются из статик в момент вызова конструктора — значит статики обязаны быть выставлены **до** `new I18nizer()`. `Server` при создании добавляет собственные словари пакета (`http.ts` (`Server`)); в них переведены все коды из `constants/messages/errors.ts` (`constants/locales/ru/errors.ts`).

### Билдеры: схема → контроллер

`XBuilder(schema)` возвращает анонимный класс-наследник базового `XBuilderConstructor` со `static schema = schema` (`builders/body.ts` (`BodyBuilder`), `query-string.ts` (`QueryStringBuilder`), `headers.ts` (`HeadersBuilder`), `cookie.ts` (`CookieBuilder`), `response.ts` (`ResponseBuilder`)). База помечена `@Controller()` и содержит статические middleware, аргументы которых декорированы `@Body/@Query/@Headers/@Cookies/@Params(SafeOrigin)`, где `SafeOrigin = ThisRef(({schema}) => SafeData(schema))` — схема достаётся у реального потомка в момент создания курсора. Описание для OpenAPI навешивается через `@DelayRefStack(SafeOriginParameters)` тем же приёмом. `PlainBuildersBase.JSONSchema` (общая база `HeaderBuildersBase`/`QueryStringBuildersBase`/`CookieBuildersBase`) явно бросает, если `static schema` не задана: ссылка на базовый класс вместо потомка (например, `@Controller()` забыт у наследника) не отдаёт молча пустую схему (`builders/common.ts` (`PlainBuildersBase.JSONSchema`)).

`packages/api/src/builders/body.ts` (`SafeOrigin`, `BodyBuilderConstructor.Body`):

```ts
const SafeOrigin = ThisRef((<T extends typeof BodyBuilderConstructor>({ schema }: T) =>
  SafeData(schema)) as RefFunction);
...
  @Middleware()
  @DelayRefStack(SafeOriginRequestBody)
  @Responses(WrongDataResponse.JSONSchema())
  static async Body(@Body(SafeOrigin) body: any, @This() self: BodyBuilderConstructor<any>) {
    self.body = body;
  }
```

`SafeData` прогоняет данные через `schemer.validate(constructor, data)` и при ошибках бросает `WrongDataResponse(ERROR_WRONG_DATA, errors)` — 400 (`decorators/safe-data.ts` (`SafeData`)). `BodyBuilder.JSONSchema(description)` берёт `description ?? this.description ?? ""` (`body.ts` (`BodyBuilder.JSONSchema`)) — переданный текст побеждает, `static description` — запасной вариант, а отсутствие обоих даёт пустую строку. Особенности отдельных билдеров: `HeadersBuilder.Headers` — пустая middleware, которая только регистрирует параметры в OpenAPI и через `@Before` подключает `ImplicitHeaders`, где и происходит валидация (`headers.ts` (`HeadersBuilderConstructor.Headers`, `HeadersBuilderConstructor.ImplicitHeaders`)); `QueryStringBuilder`, `CookieBuilder` и `ParamsBuilder` дополнительно дают `NotEmpty`, бросающую `WrongDataResponse(REQUIRED_DATA_MISSING)` на пустом наборе; `ParamsBuilder` требует компонент-схему ровно с одним свойством и даёт `static toString()`, пригодный как сегмент пути (`params.ts` (`ParamsBuilderConstructor.toString`, `ParamsBuilderConstructor.Params`)); `ResponseBuilder.Response` не делает ничего, кроме регистрации `Responses` (`response.ts` (`ResponseBuilderConstructor.Response`)).

### BaseRootController

`Index` — эндпоинт `@Get()` и одновременно `@Nextpoint()`: берёт `self.routes`, на каждый маршрут создаёт экземпляр `this.RouteElement`, заполняет `method`, `path`, `operationId = route.endpoint.$.toString()`, отдаёт маркеры маршрута в `self.markersToRoute(...)` и складывает всё в `new this.RoutesStructure(ident)` (`root.ts` (`BaseRootController.Index`)). Базовая реализация `markersToRoute` бросает ошибку — наследник обязан её переопределить (`root.ts` (`BaseRootController.markersToRoute`)).

`self.routes` — копия `router.routes`, которую хук `@OnInstance()` `InitRoutes` делает при создании инстанса (`root.ts` (`BaseRootController.InitRoutes`)). Инстанс живёт в состоянии одного запроса, поэтому копия у каждого запроса своя: шаг перед `Index` может её сузить — например, по правам вызывающего, — не трогая роутер, общий для всех запросов.

`packages/api/src/controllers/root.ts` (`BaseRootController.Index`):

```ts
const { ident, routes } = self;
const result = new this.RoutesStructure(ident);
routes.forEach((route) => {
  const { method, path } = route;
  const routeElement = new this.RouteElement();
  routeElement.method = method;
  routeElement.path = path;
  routeElement.operationId = route.endpoint.$.toString();
  self.markersToRoute(routeElement, route.markers);
  result.routes.push(routeElement);
});
```

`JSONDocs` (`GET /openapi.json`) кэширует `docs.toJSON()` в `static DocsJSON` того класса, на котором вызван, а `Swagger` (`GET /swagger.html`) возвращает статическую HTML-строку; оба закрыты `@Before(AuthBasic.Required)` (`root.ts` (`BaseRootController.JSONDocs`, `BaseRootController.Swagger`)). Страница Swagger UI грузит скрипты и стили `swagger-ui-dist@5.34.0` (поддерживает OpenAPI 3.2) с unpkg и обращается к `/openapi.json` по абсолютному пути от корня хоста (`controllers/swagger.ts` (`swagger`)).

### BaseAccessController

Класс параметризуется четырьмя абстрактными статиками, которые обязан задать наследник: `MarkerName`, `AllowedAccessTypes`, `AccessMarker` (наследник `AomAccessMarkerElement`) и `AccessCore` (наследник `AomAccessCore`) — `access-controller.ts` (`BaseAccessController`). Собственный `enum AccessTypes` в пакете пуст и наружу не экспортируется (`controllers/access/init.ts` (`AccessTypes`)): типы полномочий поставляет приложение.

**Маркировка при сборке.** `Required` несёт `@DelayRefStack(SafeAccessMarker)`, где `SafeAccessMarker = ThisRef(constructor => [UseMarker(constructor.SetAccessMark)])` — маркер берётся у реального наследника (`access-controller.ts` (`SafeAccessMarker`, `BaseAccessController.Required`)). `SetAccessMark` выполняется один раз на создание маршрута: получает или создаёт `route.markers[MarkerName]`, читает мета-инстанс `AccessCore` в точке прикрепления курсора, **сужает** список допустимых типов пересечением с уже накопленным (пустое пересечение — старые значения сохраняются) и добавляет точку доступа `{ident, title, extra, method, path}`, если такого `ident` в маркере ещё нет (`access-controller.ts` (`BaseAccessController.SetAccessMark`)).

`packages/api/src/controllers/access/access-controller.ts` (`BaseAccessController.SetAccessMark`):

```ts
const newAccessTypes = currentAccessControl.accessTypes.length
  ? _.intersection(<string[]>currentAccessControl.accessTypes, <string[]>extraAccessTypes)
  : extraAccessTypes;

currentAccessControl.accessTypes = newAccessTypes.length
  ? newAccessTypes
  : currentAccessControl.accessTypes;
```

**Проверка в рантайме.** `Required` вычисляет `ident` (для эндпоинта — сам эндпоинт, иначе `cursor.origin`) и вызывает `checkAccessPoint`; при отрицательном результате бросает `AccessDenyResponse(ERROR_ACCESS_DENY)` (`access-controller.ts` (`BaseAccessController.Required`)).

**Карта доступа.** `generateAccessMap(allowedAccessTypes, userRoles)` отмечает переданные типы в `activeAccessTypes`, создаёт `AomAccessMapStructure` и сливает в `structure` элементы тех ролей, чей `moduleIdent` совпадает с `this.moduleIdent`, ключуя их по `ident` (пока `this.moduleIdent` не задан, гранты не берутся — иначе грант без ключа `moduleIdent` совпал бы с `undefined`); `fullAccess` — дизъюнкция по ролям (`access-controller.ts` (`BaseAccessController.generateAccessMap`)). Задавать `moduleIdent` нужно шагом цепочки до `generateAccessMap`, а не в конструкторе: поле `ident` наследника к вызову конструктора ещё не задано.

**Включение.** Единственное место, где `enabled` становится `true`, — middleware `Init` (`access-controller.ts` (`BaseAccessController.Init`)). Пока `Init` не отработал, `enabled === undefined` и `checkAccessPoint` возвращает `true` на первой же строке.

**Декларации на маршрутах.** `TypesRequired(...types)` — комбинированный декоратор: проверяет непустоту списка и вхождение в `AllowedAccessTypes`, дописывает типы в мета-инстанс `AccessCore` и навешивает `@Before(this.Required)` (`access-controller.ts` (`BaseAccessController.TypesRequired`)). `SetExtraAccess(...types)` помечает middleware как слой доступа (`extraAccess = true`) и добавляет ей `@Before(CheckLayerPass)`; `ExtraAccess(...middlewares)` проверяет, что каждая переданная middleware — слой, и подключает их через `@Before` (`access-controller.ts` (`BaseAccessController.SetExtraAccess`, `BaseAccessController.ExtraAccess`)).

**`CheckLayerPass`.** В рантайме ищет в `route.cursors` ближайший курсор своего слоя после текущего и выставляет `self.layerPassed` по наличию `extra`-идентификатора в `accessMap.structure[originIdent].extra` (грант точки без `extra` — непройденный слой, а не `TypeError`). Точка доступа и слой ищутся через `accessPoints.find(...)`/`extra.find(...)` с явным `if (!found) return` на каждом шаге (`self.layerPassed` остаётся `false`): если маркер маршрута не содержит искомый `ident` (например, из-за несовпадения идентификаторов в `TypesRequired`/`ExtraAccess`), это предсказуемый отказ, а не `TypeError`.

`packages/api/src/controllers/access/access-controller.ts` (`BaseAccessController.CheckLayerPass`):

```ts
const accessPoint = routeAccessControl.accessPoints.find((value) => value.ident === originIdent);
if (!accessPoint) return;
const { extra = [] } = accessPoint;

const extraPoint = extra.find((value) => value.ident === extraIdent);
if (!extraPoint) return;
const { accessTypes } = extraPoint;
```

### Auth-middleware

`AuthBasic.Required` разбирает заголовок `Authorization`, и только если задан `static BASIC_AUTH`, выставляет `WWW-Authenticate: Basic` и сверяет вторую часть заголовка с base64 от `BASIC_AUTH`; иначе middleware не делает ничего (`auth/basic.ts` (`AuthBasic.Required`)). `AuthHeaderToken.Required` перебирает `HEADERS_KEYS` (по умолчанию `['authorization']`), первое найденное значение разбивает по пробелу в `self.type`/`self.value` и бросает `AUTH_NO_TOKEN` либо `AUTH_WRONG_TOKEN_TYPE` (`auth/headerToken.ts` (`AuthHeaderToken.Required`)). `AuthCookieToken.Required` читает `cookies[COOKIE_NAME]` и бросает `AUTH_NO_COOKIE`; имя cookie попадает в security-схему OpenAPI через `ThisRef` + `DelayRefStack` (`auth/cookieToken.ts` (`SafeSecuritySchema`, `AuthCookieToken.Required`)). Все три бросают `AuthRequiredResponse` (401).

### Ответы и ошибки

`ErrorMessage extends Error` и одновременно `@ComponentSchema`: `status` берётся из аргумента или из `static status` конструктора, `toJSON()` отдаёт `{message, status, data}`, `static JSONSchema(description)` строит описание ответа через `responseJsonSchema(this, description, this.status)` (`responses/error-message.ts` (`ErrorMessage`)). Наследники добавляют только статусы и описания через промежуточный `ErrorWithStatusResponse` с сигнатурой `(message, data?)` (`responses/error-responses.ts` (`ErrorWithStatusResponse`)).

| Класс                      | status | Описание (`static description`)                            |
| -------------------------- | ------ | ---------------------------------------------------------- |
| `SeeOtherResponse`         | 303    | `SEE_OTHER_RESPONSE`                                       |
| `WrongDataResponse`        | 400    | `ERROR_WRONG_DATA`                                         |
| `AuthRequiredResponse`     | 401    | `ERROR_AUTH_REQUIRED`                                      |
| `PaymentRequiredResponse`  | 402    | `PAYMENT_REQUIRED`                                         |
| `AccessDenyResponse`       | 403    | `ERROR_ACCESS_DENY`                                        |
| `NotFoundResponse`         | 404    | `ERROR_NOT_FOUND`                                          |
| `ConflictResponse`         | 409    | `ERROR_CONFLICT`                                           |
| `PayloadTooLargeResponse`  | 413    | `ERROR_PAYLOAD_TOO_LARGE`                                  |
| `LockedResponse`           | 423    | `ERROR_DATA_LOCKED`                                        |
| `FailedDependencyResponse` | 424    | `ERROR_WRONG_DEPENDENCY`                                   |
| `ServerErrorResponse`      | 500    | `SERVER_ERROR`                                             |
| `ErrorMessage`             | 500    | `ERROR_MESSAGE`                                            |

`API_ERROR_423_DATA_LOCKED` равен `AOM_API:API_ERROR_423_DATA_LOCKED`. Успешные ответы наследуют `ResponseJSONSchema` → `CommonResponse` (`static status = 200`): `MessageResponse {message?}`, `DataResponse {message?, data?}`, `NumberResponse`/`BooleanResponse`/`StringResponse {value}` (`responses/data-responses.ts`). `ResponseJSONSchema.JSONSchema(description?, status?)` без своих аргументов берёт `static description` и `static status` класса (`schemas/json-schema.ts` (`ResponseJSONSchema.JSONSchema`)): `MessageResponse.JSONSchema()` получает своё описание. Поле `data` у `ErrorMessage` необязательное и в `required` схемы не входит. `responseJsonSchema` подставляет `status || 200` и трактует массив в `description` как признак `isArray` (`functions/json-schema.ts` (`responseJsonSchema`)).

### IDController / UUIDParam

`IDValue(attr, Schema)` создаёт наследника `IDController` со `static Attr` и `static Pattern = new Schema()`; `toString()` возвращает `Pattern.format(Attr)`, то есть сегмент `:attr(regexp)`, пригодный для интерполяции в `@Bridge`/`@Get` (`id-value/controller.ts` (`IDValue`, `IDController.toString`); `id-value/schemas.ts` (`ParamIDSchema`)). `UUIDParam`/`MongoIDParam`/`NanoIDParam`/`NumberIDParam` — обёртки над соответствующими шаблонами (`controller.ts` (`UUIDParam`, `MongoIDParam`, `NanoIDParam`, `NumberIDParam`)).

`PathID`/`QueryID`/`HeaderID` регистрируют описание параметра в OpenAPI и через `@After` вызывают `PathValue`/`QueryValue`/`HeaderValue`, которые копируют источник в `self.source`, а затем `Assign` кладёт `self.value = self.source[attr]`. Никакой дополнительной проверки значения на этом пути нет — валидность обеспечивается regexp самого маршрута (тем же, что компилирует `compilePath` для `RouteMatcher` — §«RouteMatcher: путь → RegExp»).

### Logger

`Logger.Init` вешает один и тот же обработчик на события `finish` и `error` объекта `res`: фиксирует `finishDate`, `status = res.statusCode`, `lifetime`/`duration` и пишет запись с уровнем по классу статуса: `ENGINE.info` для 1xx-3xx (включая `201`, `204`, `303`), `ENGINE.warn` для 4xx (ошибка клиента), `ENGINE.error` только для 5xx (отказ самого сервиса); попутно кладёт себя в контекст (`Object.assign(ctx, { log: self })`) — `logger/logger.ts` (`Logger.Init`). `Attach` запоминает класс-владелец курсора как `LoggerAttachments`, чей `toJSON()` вернёт мета-инстанс на момент сериализации лога (`logger.ts` (`Logger.Attach`)); `Watch` пишет отладочный фрагмент по текущему курсору (`logger.ts` (`Logger.Watch`)). `ENGINE` по умолчанию — `console` (`logger.ts` (`Logger.ENGINE`)).

### WebSocket-точки

Каталог `controllers/events` входит в публичный вход пакета (`packages/api/src/controllers/index.ts`): `AomWebSockets`, `WebSocketsController`, `Ws` и реэкспорт `WebSocket` из `ws` (`packages/api/src/controllers/events/websockets.ts` (`WebSocket`)).

**Как объявить точку.** Контроллер держит реестр соединений в статическом поле `static Sockets = new AomWebSockets(onMessage)` и объявляет точку `@WebSocketPoint(path)` с `@Before(<id-middleware>)`. id-middleware — обычный `@Middleware()` приложения с `@Before(WebSocketsController.Define)` и `@After(WebSocketsController.Connect)`: он берёт `@This(WebSocketsController)` и выставляет `ws.id` — ключ, под которым соединение попадёт в реестр. Id выставляет приложение, не пакет: готовых id-middleware в пакете нет.

**Порядок шагов.** Обработчик `upgrade` в `Server` сопоставляет путь с `router.sockets` и исполняет цепочку маршрута (`packages/api/src/server/http.ts` (`Server`)):

1. гейт доступа — классовый `@Before` контроллера точки или его родителя по бриджу;
2. `WebSocketsController.Define` — проверяет, что у контроллера точки `Sockets` — экземпляр `AomWebSockets`, иначе бросает `CONTROLLERS_WEBSOCKETS_WRONG_TARGET`; один раз на маршрут кладёт обёртку рукопожатия в `WebSocketsController.WssMap`;
3. id-middleware приложения — выставляет `ws.id`;
4. `WebSocketsController.Connect` — при пустом `id` разрывает соединение (`socket.destroy()`); иначе завершает рукопожатие через `ws`, регистрирует сокет (`Sockets.connect(id, socket)`), подписывает приём сообщений на `onMessage(id, socket, data)` и снятие с регистрации на закрытие (`Sockets.disconnect(id, socket)`);
5. тело точки — рукопожатие уже завершено, сокет в реестре; значение, которое тело возвращает, никуда не отправляется.

Исключение на любом шаге ловит обработчик `upgrade` и разрывает соединение (`socket.destroy()`): HTTP-ответа клиент не получает, сервер продолжает работать. Исключение в теле точки разрывает уже открытое соединение.

**Приём сообщений.** `onMessage` вызывается с `this = null`, поэтому обработчик обращается к реестру по имени класса, а не через `this`; текстовый кадр приходит строкой. Исключение или отклонённый промис обработчика пишется в `console.error`, соединение остаётся открытым (`websockets.ts` (`WebSocketWrapper.handle`)).

**Отправка.** Соединения живут в памяти процесса: `Sockets.send(id, data)` и `Sockets.broadcast(data)` достают только сокеты этого экземпляра сервера. Поэтому сигнал из других модулей шлют через шину: изолятор `@Isolator(transfer)` с методом `@CustomTopic()`, а контроллер точки помечен `@Executor()` и наследует изолятор — его реализация метода вызывает `this.Sockets.send(...)` или `broadcast(...)`. Метод без `@IsQueue`: такое сообщение получает каждый экземпляр-исполнитель и шлёт своим соединениям; с `@IsQueue` его взял бы один экземпляр, и клиенты остальных сигнала не увидели бы. Не `@CustomTopic(true)`: синглтон склеивает одновременные вызовы с одинаковыми аргументами в один, и два одинаковых сигнала подряд дошли бы одним. Механика шины — [`@aom-js/transfer`](transfer.md).

**Особенности.**

- Браузерный `WebSocket` не умеет ставить заголовки рукопожатия — они передаются подпротоколом, тем же объектом, что у `fetch`, только встроенными функциями: `new WebSocket(url, [encodeURIComponent(JSON.stringify(headers))])`. Обработчик `upgrade` разворачивает подпротокол в обычные заголовки контекста до цепочки точки, дальше гейты (`AuthHeaderToken`, заголовки приложения) читают их как обычные (`packages/api/src/server/protocol-headers.ts` (`protocolHeaders`), `packages/api/src/server/http.ts` (`Server`)). Правила: каждый элемент `Sec-WebSocket-Protocol`, который раскодируется в JSON-объект, даёт свои строковые значения, битые элементы пропускаются; имена — в нижнем регистре (как у настоящих заголовков `node:http`), из одинаковых в разном регистре побеждает последний; настоящий заголовок запроса побеждает развёрнутый; `AomServerSettings.protocolHeaders` перечисляет извлекаемые имена без учёта регистра, не задан — извлекается всё, `[]` — ничего. «Всё» не даёт клиенту больше, чем у него есть: не браузерный клиент ставит любые заголовки сам, а обязательные заголовки браузера (`origin`, `host`) побеждают как настоящие; `cookies` контекста берутся из настоящего `cookie`. Ограничение: `encodeURIComponent` не кодирует `(` и `)`, а в токене подпротокола они запрещены — значение со скобками браузер не отправит (`SyntaxError`); токены и id скобок не содержат. Сервер отвечает первым предложенным элементом (`ws` без `handleProtocols`), браузеру этого достаточно.
- Точки сокетов не попадают в OpenAPI.
- `disconnect` последнего сокета оставляет под id пустой массив: ключ из `connections` не удаляется, `send`/`broadcast` по нему ничего не шлют.
- Экспорт по умолчанию `websockets.ts` (общий `new AomWebSockets()`) через `export *` не реэкспортируется и из пакета недоступен.

### SSE-ссылки

Server-Sent Events — поток событий сервера по обычному HTTP GET. В отличие от WebSocket-точки, SSE-ссылка — обычный `@Get` в общем дереве маршрутов: проходит гейты, `@Before`, `@This` как любой GET, попадает в OpenAPI и в дамп цепочек. Своего декоратора и middleware-контроллера нет.

**Как объявить ссылку.** Контроллер держит реестр потоков `static events = new AomServerEvents({ unread: UnreadEvent })` — словарь «тип события → класс `@ComponentSchema` его значения» (ключ `type` занят конвертом — ошибка в конструкторе) — и возвращает из обработчика `this.events.connect(id, res)`; `id` — ключ соединения приложения (например, id пользователя), `res` — из `@Ctx()`:

```ts
// псевдокод
@Controller()
class Events {
  static events = new AomServerEvents({ unread: UnreadEvent }); // { heartbeat?, retry?, validate? }

  @Get("/events")
  @Responses(Events.events.JSONSchema("Счётчик непрочитанного"))
  static Connect(@This(CurrentUser) { user }: CurrentUser, @Ctx() { res }: HttpCtx) {
    return this.events.connect(user.id, res);
  }
}
```

**`connect(id, res)`** (`packages/api/src/controllers/events/sse.ts` (`AomServerEvents.connect`)): ставит заголовки `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no` (`Server` свой тип не подставляет, раз тип уже задан); создаёт `PassThrough` и кладёт первый кадр — `retry: <мс>`, если задан `retry`, иначе комментарий `: connected` (заголовки уходят сразу, клиент видит открытие); регистрирует поток под `id`, ставит heartbeat — комментарий `: ping` каждые `heartbeat` мс (по умолчанию 25000, `0` — выключен; таймер `unref`, против обрыва простаивающего соединения прокси: у nginx `proxy_read_timeout` 60 с); по `close` потока снимает таймер и поток с реестра. `Server` пайпит поток в ответ (§«Конвейер HTTP-запроса (Server)»); уход клиента разрушает поток, и он снимается сам.

**Конверт.** Событие — конверт `{ type, [type]: значение }`: `{ "type": "unread", "unread": { "total": 2 } }`. Клиент для любого события делает одно и то же — берёт `type` и значение `value[value.type]`. Конверт собирает реестр, не отправитель; тип для сервера и клиента — `EventEnvelope<E>` (`packages/api/src/controllers/events/sse.ts` (`EventEnvelope`)): объединение `{ type: K } & { [K]: InstanceType<E[K]> }` по ключам словаря.

**Кадр** (`formatServerEvent`): `id: <eventId>`, если задан, `data: <JSON конверта>` и пустая строка; строки `event:` нет — тип едет внутри `data`, клиент слушает обычные сообщения (`onmessage`). `JSON.stringify` экранирует переводы строк, поэтому `data` всегда одной строкой; перевод строки в `eventId` — ошибка (сломал бы кадр).

**Отправка.** `send(id, type, value, eventId?)` собирает конверт и пишет кадр всем потокам `id` (неизвестный `id` — ничего), `broadcast(type, value, eventId?)` — всем потокам всех `id`; `disconnect` последнего потока удаляет ключ. Типы `type` и `value` берутся из словаря реестра. Готовый конверт (например, пришедший по шине) — `sendEnvelope(id, envelope, eventId?)`/`broadcastEnvelope(envelope, eventId?)`. Каждая отправка проверяет конверт (`AomServerEvents.frameOf`) и бросает у отправителя, кадр не уходит: `type` нет в словаре, значение под ключом `type` — `undefined`/`null`, в конверте есть ключи, кроме `type` и `envelope.type`. С опцией `validate` (по умолчанию `process.env.NODE_ENV !== "production"`) значение ещё проверяется по своему классу — `Schemer.validate` (`plainToInstance` + class-validator); ошибка проверки — тоже исключение у отправителя. С проверкой в кадр уходит значение, приведённое к классу: поля без правил отсекаются (`whitelist`), поэтому отправителю можно передать полную строку из базы, не собирая значение руками; объект отправителя не меняется. Где это нужно и в production, опция задаётся явно: `new AomServerEvents(schemas, { validate: true })` (`sse.ts` (`AomServerEvents.frameOf`)). Потоки живут в памяти процесса, поэтому из других процессов — как у сокетов: изолятор `@Isolator(transfer)` с методом `@CustomTopic()` без `@IsQueue` (сигнал получает каждый экземпляр) и без `@CustomTopic(true)` (склейка одинаковых сигналов), контроллер ссылки — `@Executor()` этого изолятора (§«WebSocket-точки», «Отправка»).

**Описание в OpenAPI.** `AomServerEvents.JSONSchema(description, status = 200)` возвращает ответ `{ status, description, events: schemas }` для `@Responses` — тот же словарь, что типизирует `send`, поэтому документ и отправка не расходятся. Роутер пишет его как `text/event-stream` с `itemSchema` OpenAPI 3.2 — один вариант, у которого `data` — конверт (`type` — `enum` ключей словаря, по свойству на ключ), — и `schema` — массивом таких событий ([`@aom-js/router`](router.md), «Сборка OpenAPI»).

**Особенности.**

- Клиент — fetch-клиент SSE с заголовками (например, `@microsoft/fetch-event-source`): токен и прочие данные приходят заголовками, как у любого GET. Браузерный `EventSource` заголовков не ставит и не поддерживается.
- Права проверяются один раз, при подключении: отозванный доступ живёт до переподключения.
- Буфера повторной доставки по `Last-Event-ID` нет: `eventId` передаётся как есть, пропущенное приложение дочитывает само (заголовок — через `@Headers`).
- Медленный клиент: `PassThrough` копит кадры без предела.
- `requestTimeout` Node долгий GET не рвёт — он касается приёма запроса, а GET без тела принят сразу; `server.close()` ждёт открытые потоки — при остановке и в тестах `closeAllConnections()`.
- Браузер по HTTP/1.1 держит около 6 соединений на домен на все вкладки: одна SSE-ссылка на клиентское приложение, к клиенту — HTTP/2 на прокси. Словарь центральной ссылки — объединение словарей модулей (`{ ...usersEvents, ...ordersEvents }`), типы уникальны — с префиксом модуля (`orders.unread`).
- Экземпляра по умолчанию нет: без словаря событий теряется типизация.

## Инварианты и подводные камни

- Глобальные статики конфигурируются **до** сборки роутера и до создания зависимых объектов: `I18nizer.DEFAULT_LOCALE`/`HEADER_KEY`/`QUERY_KEY` — до `new I18nizer()`, `AuthBasic.BASIC_AUTH`, `AuthHeaderToken.TOKEN_NAME`/`HEADERS_KEYS`, `AuthCookieToken.COOKIE_NAME`, `Logger.ENGINE` — до первого запроса.
- Класс-потомок билдера обязан быть помечен `@Controller()`, иначе его middleware не привяжутся к нему как к отдельному узлу и `ThisRef` вернёт схему базового класса — `PlainBuildersBase.JSONSchema` в этом случае бросит `schema is not defined for <name>` (пример: `@Controller() class OrderBody extends BodyBuilder(OrderDTO) {}`).
- Абстрактные статики базовых контроллеров объявлены как `static readonly x: T;` без значения; наследник обязан задать их все: для `BaseAccessController` — `MarkerName`, `AllowedAccessTypes`, `AccessMarker`, `AccessCore`; для `BaseRootController` — `ident`, `docs`, `RoutesStructure`, `RouteElement` и переопределённый `markersToRoute` (`packages/api/src/controllers/access/access-controller.ts` (`BaseAccessController`), `packages/api/src/controllers/root.ts` (`BaseRootController`)).
- Валидация всегда проходит через `Schemer.validate`; class-validator-декораторы задаются в компонент-схеме опцией `decorators` — см. [`@aom-js/schemer`](schemer.md).
- Коды сообщений пакета имеют вид `AOM_API:<NAME>` (`constants/messages/prefix.ts` (`PREFIX`, `PREFIX_VALUE`)); клиенту уходит код, текст подставляет локализатор. У всех кодов `messages/errors.ts` есть перевод на `ru` и `en` — `checkLocales` сравнивает _значения_ модуля кодов (сами коды `AOM_API:...`) с _ключами_ словаря (которые и есть эти коды).
- Тело запроса разбирается лениво (см. §«Ленивое тело запроса и лимит размера») и только при заголовке `content-type`, где часть до первого `;` (без учёта регистра) равна `application/json` — `application/json; charset=utf-8` и `Application/JSON` распознаются, битый JSON даёт `400 ERROR_WRONG_DATA` (`server/body.ts` (`parseJsonBody`), `server/http.ts` (`Server`)). Тело копится в `Buffer`-чанках и склеивается один раз через `Buffer.concat`, а не конкатенацией decode-нутых строк по кускам — иначе многобайтовый UTF-8 символ, разрезанный ровно на границе TCP-чанков, портился бы (`server/body.ts` (`parseJsonBody`)). Лимит размера — `@BodyOptions` маршрута → `AomServerSettings.bodyLimit` → `DEFAULT_BODY_LIMIT` (1 МиБ); `0` на любом из трёх уровней снимает ограничение.
- `cookies` парсятся через `split(";")` и `split("=")` — значение, содержащее `=`, обрезается по первому вхождению (`http.ts` (`Server.parseCookies`)).
- `Server.routesAmount` — статический счётчик, общий для всех экземпляров `Server` в процессе (`http.ts` (`Server.routesAmount`)).
- Подстановка локализованных текстов идёт по сериализованной строке ответа целиком, поэтому код вида `AOM_API:...`, попавший в пользовательские данные, тоже будет заменён (`i18nizer.ts` (`I18nizer.localize`)).
- Разбор адреса запроса фиксирует хост константой и не даёт `//`, `\` или абсолютной форме подменить маршрут; префикс из `settings.url` приклеивается, а фрагмент после `#` отбрасывается до разбора пути/query (§«Конвейер HTTP-запроса (Server)»).
- `es-toolkit` используется как `es-toolkit/compat` (`_.each`, `_.merge`, `_.keyBy`, `_.intersection`, `difference`) — `access-controller.ts` (`_`), `functions/check-locales.ts` (`difference`). `class-validator`/`class-transformer` импортируются в `decorators/*`, но в `dependencies` пакета не объявлены (`packages/api/package.json` (`dependencies`)) и разрешаются из корня монорепо.

## Ограничения

- `Server.listen` вызывается прямо в конструкторе — отложить старт после создания объекта нельзя. Свободный порт берут так: `port: 0` и `server.address()` (`http.ts` (`Server`)).
- `Server` вливает в локализатор только собственные словари пакета; словарей приложения он не знает. Если приложение создаёт `new I18nizer()` без своих словарей, клиент получает коды сообщений приложения как есть. Обход — передать словари приложения через `addLocalesStruct` до старта сервера.
- Каталог `src/constants` (коды `AOM_API:*` и словари `ru`/`en`) из пакета не экспортируется — приложение держит собственные наборы кодов и словарей.
- `multipart/form-data` не разбирается, `files` и `session` в контексте всегда пусты: загрузка файлов — на приложении (например, formidable поверх `ctx.req`).
- `AuthBasic.Required` при незаданном `BASIC_AUTH` пропускает всех, то есть `/openapi.json` и `/swagger.html` открыты (`auth/basic.ts` (`AuthBasic.Required`)). Обход — задавать `BASIC_AUTH` в окружении публикуемого сервиса.
- Страница `/swagger.html` тянет ассеты с unpkg и офлайн не работает (`controllers/swagger.ts` (`swagger`)).
- `Access-Control-Allow-Origin: *` задан жёстко и снаружи не настраивается (`http.ts` (`Server`)).

## Сборка и потребление

Сборка — `bun run build:api` в корне ядра (или `bun run build` внутри `packages/api`): три прохода `tsc` (`tsconfig.build.json` → `dist/cjs` в CommonJS, `tsconfig.build.mjs.json` → `dist/mjs`, `tsconfig.build.types.json` → `dist/types`) и затем `node ../../scripts/post-build.js`, который дописывает расширения относительным импортам и кладёт `dist/cjs/package.json` с `{"type":"commonjs"}`; неразрешимый импорт останавливает сборку (`packages/api/package.json` (`scripts`); `scripts/post-build.js`). Файл `package.json` пакета генерируется скриптом `scripts/prebuild.js` — править следует `package.src.json`/`scripts/jsons`.

Потребитель через `exports` читает `dist/types` и `dist/mjs`, а не исходники. Инвариант: **правки `src` не видны потребителю без `bun run build`**. Полная схема сборки и dist-потребления — [Архитектура ядра](../architecture.md) §«Сборка, тесты…» и §«Как приложение потребляет ядро».

## Тесты пакета

Из корня ядра: `bunx vitest run packages/api`. `Server` слушает порт прямо в конструкторе, поэтому в тестах его поднимают с `port: 0` и читают порт из `server.address()`.

---

**О ссылках в этом документе:** ссылки даются по именам символов, а не по номерам строк — номера сдвигаются при любой правке. Сверять их нужно поиском имени в указанном файле.
