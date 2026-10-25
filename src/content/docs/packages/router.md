---
title: "@aom-js/router"
sidebar:
  label: "@aom-js/router"
  order: 3
---

Пакет строит карту HTTP/WS-маршрутов из классов-контроллеров со статическими методами и исполняет запрос как линейную цепочку курсоров. Здесь же живут DI через `state`, отложенные ссылки, маркеры и генерация документа OpenAPI 3.1.
Читать до: [`@aom-js/core`](core.md) (реестр мета-инстансов, фазы, наследование). Читать после: [`@aom-js/api`](api.md) (сервер, билдеры, доступ).

## Назначение и место в стеке

Пакет отвечает за две задачи: **сборку** (из дерева контроллеров получить `Router.routes` — плоские маршруты с путём, методом и списком курсоров) и **исполнение** (`AomRoute.apply(values)` — последовательный прогон курсоров с DI и сборкой аргументов). Метаданные не хранятся в самом пакете: каждый класс и каждый его декорированный метод получают мета-инстанс `AomApi` — наследника `AomCore` из `@aom-js/core`, с прикладными полями `element` (роль метода и списки связей) и `openApi` (декларации для документа). Декораторы пакета только заполняют эти поля (`packages/router/src/common/api.ts` (`AomApiElement`, `AomHttpOpenApi`)); когда именно выполняется тело декоратора, определяет фаза из `@aom-js/core` (`packages/core/src/defines/callstack.ts` (`AomCallstackQueue.add`, `AomCallstackQueue.transferTo`)).

Зависимости: `@aom-js/core` (реестр, фазы, наследование, `resolveFor`), `@aom-js/schemer` (`Schemer` + `SchemasCollector` для рендера компонент-схем в `components.schemas`), `rxjs` (последовательное исполнение), `openapi3-ts` (типы документа). Потребители: `@aom-js/api` — `Server` матчит путь и вызывает `route.apply(...)`, билдеры и `BaseAccessController` строятся на декораторах и маркерах роутера; приложение импортирует роутер напрямую в каждом контроллере. Полный граф пакетов и порядок сборки монорепо — [Архитектура ядра](../architecture.md) §«Состав…».

## Публичный API

Экспорт — `src/index.ts`: `decorators`, `specials`, `types`, `classes`, `common/openapi`, `common/classes`, `common/types`, `common/lazy`, `compilePath` из `common/path`. Второй путь пакета — `@aom-js/router/testing` (`src/testing/index.ts`): зонды ([«Зонды…»](#зонды-aom-jsroutertesting)) и общие правила цепочки (`src/testing/chain.ts`, [Тестирование приложения](../testing.md#общие-правила)). Файлы `common/references.ts` и `constants/errors.ts` в реэкспорт не входят — контейнеры ссылок и коды ошибок доступны только как типы в сигнатурах и как строки в сообщениях `Error`.

### Классы и модель маршрута

| Экспорт                                                   | Сигнатура                                                                                                                                                | Назначение                                                                                                                                                                                                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Router`                                                  | `new Router(root: ClassType, docs: OpenApi)`; `routes: AomRoute[]`; `sockets: AomRoute[]`; `routeOf(endpoint: Function): AomRoute`; `toJSON(): AomRouterJSON` | Обход дерева контроллеров по бриджам, сборка маршрутов, регистрация их в OpenAPI                                                                                                                                                                               |
| `OpenApi`                                                 | `new OpenApi(info: InfoObject)`; `registerPath(route)`; `toJSON()`; `static tagsSeparator = " > "`; `static readonly refPointerPrefix`            | Накопитель и генератор документа OpenAPI (версия — `OpenApi.version`, 3.2.0)                                                                                                                                                                                                                  |
| `AomApi`                                                  | `class AomApi extends AomCore { openApi; element; delayStack; delayRealized; title?; description?; toString(); static instanceWithHooks(target, args) }` | Мета-класс роутера; `AomApi.instance(target, property?)` — доступ к реестру                                                                                                                                                                                    |
| `AomCursor`                                               | `new AomCursor($: AomApi, origin: AomApi, prefix: string, endpoint?: AomEndpoint)`; `$`, `origin`, `prefix`, `endpoint`, `index`; `via?`, `viaGroup?`; `parameters(): AomCursorParameter[]`; `toJSON(created?): AomCursorJSON` | Единица исполнения цепочки; при создании перепривязывается и реализует `delayStack`                                                                                                                                                                            |
| `AomRoute`                                                | `router; endpoint; path; method; markers: MarkerType; cursors: AomCursor[]; apply(context: HttpContextValues): Promise<any>`; `toJSON(): AomRouteJSON` | Готовый маршрут                                                                                                                                                                                                                                                |
| `TagsRules`                                               | `enum { IGNORE, MERGE, REPLACE }`                                                                                                                        | Правило слияния тегов                                                                                                                                                                                                                                          |
| `compilePath`                                             | `compilePath(path: string): { pattern: RegExp; paramNames: string[] }`                                                                                   | Грамматика адреса: шаблон пути → якорный regexp и имена параметров в порядке групп; литерал экранируется, валидатор `:name(…)` встраивается. Одна на сервер `@aom-js/api` и прогонщик зондов (`packages/router/src/common/path.ts`) |
| `RxContext`                                               | `values; state: ClassInstanceMap; route; run(cursors); value(key)`                                                                                       | Контекст одного исполнения маршрута: `state` — только проверенные хуками инстансы; `pending`/`inflight`/`waits` — служебные карты идущих созданий; `value(key)` разворачивает ленивое поле `values`. **Не экспортируется** (`common/classes.ts` (`RxContext`)) |
| `FwdContainer` / `ThisRefContainer` / `RouteRefContainer` | `exec(constructor?)`                                                                                                                                     | Контейнеры отложенных ссылок. **Не экспортируются** (`common/references.ts` (`FwdContainer`, `ThisRefContainer`, `RouteRefContainer`)), создаются фабриками                                                                                                    |

### Декораторы структуры

| Экспорт                                 | Сигнатура                                                                        | Назначение                                                |
| --------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `Controller`                            | `Controller(): ClassDecorator`                                                   | Наследование декораторов предков + разбор LAST-очереди    |
| `Get/Post/Put/Patch/Delete/Options/All` | `(path?: string): MethodDecorator`; `(path: string, handler): ClassDecorator`    | Эндпоинт; классовая форма подключает чужой `@Nextpoint()` |
| `Endpoint`                              | `Endpoint(method: HTTPMethods, path = "/")`                                      | Базовый эндпоинт-декоратор                                |
| `Nextpoint`                             | `Nextpoint(): MethodDecorator`                                                   | Метод-продолжение для `@Next` и классовой формы эндпоинта |
| `WebSocketPoint`                        | `WebSocketPoint(path?: string)`                                                  | Эндпоинт метода `sockets` → `Router.sockets`; без пути — `"/"` |
| `Middleware`                            | `Middleware(): MethodDecorator`                                                  | Помечает метод как middleware                             |
| `Before` / `After`                      | `(...mw: Array<MiddlewareHandler \| FwdContainer>): CombinedDecorator`           | pre/post-middleware класса или метода                     |
| `Bridge`                                | `Bridge(prefix: string, next: ClassType): CombinedDecorator`                     | Монтирование дочернего контроллера под префиксом          |
| `Next`                                  | `Next(handler: HandlerFunction \| FwdContainer): MethodDecorator`                | Назначает методу nextpoint                                |
| `OnInstance`                            | `OnInstance(): MethodDecorator`                                                  | Хук после создания инстанса класса                        |
| `Marker` / `UseMarker`                  | `Marker(): MethodDecorator`; `UseMarker(handler: MarkerHandler \| FwdContainer)` | Build-time обработчик маршрута                            |
| `CursorKind`                            | `CursorKind(kind: AomCursorKind): MethodDecorator`                               | Вид шага на его определении (там, где приложение не выводит вид); значение вне словаря и повтор — `CURSOR_KIND_DEFINE_ERROR` |

### Декораторы аргументов

Все — параметр-декораторы фазы LAST, объявлены в `src/decorators/arguments/index.ts`.

| Экспорт                                             | Сигнатура                                                                 | Назначение                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Args`                                              | `Args(handler?: (args: {context, cursor, route}) => any, descriptor?: AomParameterDescriptor)`                 | Базовый декоратор аргумента                                                                                                                |
| `Query` / `Body` / `Params` / `Cookies` / `Headers` | `(handler?: Function \| ThisRefContainer \| RouteRefContainer \| string)` | Значение из соответствующего поля контекста; поле может быть ленивым (`lazy(...)`) — тогда фабрика вызывается не раньше первого обращения  |
| `Session` / `Files`                                 | `(name?: string)`                                                         | `values.session` / `values.files` целиком или по ключу; тоже может быть ленивым                                                            |
| `Ctx` / `Req` / `Res`                               | `()`                                                                      | `values.ctx` / `values.req` / `values.res`                                                                                                 |
| `Cursor` / `Route`                                  | `()`                                                                      | Текущий курсор / маршрут                                                                                                                   |
| `State`                                             | `State(constructor?)`                                                     | Инстанс из `state` (только прошедший свои хуки) или весь `state`                                                                           |
| `This`                                              | `This(ctor?: ClassConstructor \| FwdContainer \| RouteRefContainer \| ThisRefContainer)` | Инстанс класса, создаётся при отсутствии; публикуется только после хуков — чужой код ждёт или получает `CIRCULAR_INSTANCE_ERROR` при цикле |
| `Run`                                               | `Run()`                                                                   | Функция `(...handlers) => Promise<any>` — прогон дополнительных курсоров                                                                   |
| `Err`                                               | `Err(ErrorConstructor = Error)`                                           | Фабрика ошибки со `status`/`data`                                                                                                          |

### Декораторы документации и OpenAPI

| Экспорт                                                | Сигнатура                                                                                        | Назначение                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `Title` / `Description`                                | `(value: string): CombinedDecorator`                                                             | `summary`/`description` операции; `Title` также задаёт имя тега |
| `Responses`                                            | `Responses(...schemas: OpenApiResponse[])`                                                       | Ответы операции: тело (`schema`) или поток событий (`events`)   |
| `RequestBody`                                          | `RequestBody(schema: OpenApiRequestBody)`                                                        | Тело запроса                                                    |
| `PathParameters`                                       | `PathParameters(...schemas: OpenApiPathParameters[])`                                            | Параметры пути; ключ — литеральный фрагмент пути                |
| `QueryParameters` / `CookieParameters` / `Parameters`  | `(...schemas)`                                                                                   | Параметры `query` / `cookie` / произвольные                     |
| `Security`                                             | `Security(schema: OpenApiSecuritySchema): CombinedDecorator`                                     | Схема безопасности операции                                     |
| `UseTag`                                               | `UseTag(constructor: ClassType)`                                                                 | Тег операции по классу                                          |
| `IgnoreNextTags` / `MergeNextTags` / `ReplaceNextTags` | `()`                                                                                             | Правило слияния тегов                                           |
| `DelayRefStack`                                        | `DelayRefStack(handler: FwdContainer \| ThisRefContainer \| RouteRefContainer): MethodDecorator` | Отложенные декораторы, реализуемые при создании курсора         |

### Фабрики ссылок и типы

| Экспорт                                                                                                                                                                                                  | Сигнатура                                                                                                                                                                                                                   | Назначение                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FwdRef`                                                                                                                                                                                                 | `FwdRef(fn: () => HandlerFunction \| ClassType): FwdContainer`                                                                                                                                                              | Ссылка без контекста (циклические импорты)                                                                                                                                                                                |
| `ThisRef`                                                                                                                                                                                                | `ThisRef(fn?: (ctor: ClassType) => any): ThisRefContainer`                                                                                                                                                                  | Ссылка с классом текущего курсора                                                                                                                                                                                         |
| `RouteRef`                                                                                                                                                                                               | `RouteRef(fn?): RouteRefContainer`                                                                                                                                                                                          | Ссылка с классом эндпоинта маршрута                                                                                                                                                                                       |
| `HttpContextValues`                                                                                                                                                                                      | `{ctx, req, res, body: any, files: any, query: Lazy<...>, params: Lazy<...>, cookies: Lazy<...>, headers: Lazy<...>, session: Lazy<...>}`                                                                                   | Контракт входа `AomRoute.apply`; `query`/`params`/`cookies`/`headers`/`session` принимают готовое значение либо `lazy(...)`, `body`/`files` — `any`, но по тому же контракту (`src/types/index.ts` (`HttpContextValues`)) |
| `lazy`                                                                                                                                                                                                   | `lazy<T>(factory: () => T \| Promise<T>): LazyValue<T>`                                                                                                                                                                     | Оборачивает фабрику дорогого значения контекста запроса — вызывается не раньше первого обращения и максимум один раз за запрос                                                                                            |
| `LazyValue`                                                                                                                                                                                              | `class LazyValue<T> { readonly factory: () => T \| Promise<T> }`                                                                                                                                                            | Обёртка, которую разворачивает `RxContext.value(key)`; конструктор не вызывается напрямую, только через `lazy(...)`                                                                                                       |
| `Lazy<T>`                                                                                                                                                                                                | `type Lazy<T> = T \| LazyValue<T>`                                                                                                                                                                                          | Тип поля `HttpContextValues`: готовое значение или `lazy(...)` (`src/common/lazy.ts`)                                                                                                                                     |
| `RunFunction`                                                                                                                                                                                            | `(...middlewares: HandlerFunction[]) => Promise<any>`                                                                                                                                                                       | Тип результата `@Run()`                                                                                                                                                                                                   |
| `HTTPMethods`                                                                                                                                                                                            | `"get" \| "post" \| "put" \| "patch" \| "delete" \| "options" \| "all" \| "sockets"`                                                                                                                                        | Методы маршрута                                                                                                                                                                                                           |
| `HandlerFunction` / `MiddlewareHandler` / `FwdFunction` / `RefFunction` / `ContainerFunction`                                                                                                            | `src/common/types.ts` (`HandlerFunction`, `MiddlewareHandler`, `FwdFunction`, `RefFunction`, `ContainerFunction`)                                                                                                           | Базовые функциональные типы                                                                                                                                                                                               |
| `AomBridge` / `AomEndpoint` / `MarkerType` / `MarkerHandler` / `ArgumentsHandlerParameters` / `ArgumentsDecoratorHandler`                                                                                | `src/common/classes.ts` (`AomBridge`, `AomEndpoint`, `MarkerType`, `MarkerHandler`, `ArgumentsHandlerParameters`, `ArgumentsDecoratorHandler`)                                                                              | Структурные типы                                                                                                                                                                                                          |
| `OpenApiPossibleSchema` / `OpenApiSchemaObject` / `OpenApiSecuritySchema` / `OpenApiParameterObject` / `OpenApiResponse` (`OpenApiDataResponse` \| `OpenApiEventsResponse`, общее — `OpenApiResponseBase`) / `OpenApiRequestBody` / `OpenApiPathParameterObject` / `OpenApiPathParameters` | `src/common/openapi.ts` (`OpenApiPossibleSchema`, `OpenApiSchemaObject`, `OpenApiSecuritySchema`, `OpenApiParameterObject`, `OpenApiResponse`, `OpenApiDataResponse`, `OpenApiEventsResponse`, `OpenApiRequestBody`, `OpenApiPathParameterObject`, `OpenApiPathParameters`) | Типы деклараций OpenAPI                                                                                                                                                                                                   |
| `OpenAPIObject`                                                                                                                                                                                          | реэкспорт `openapi3-ts/oas32` (вместе с `InfoObject`)                                                                                                                                                                                              | Тип документа                                                                                                                                                                                                             |
| `resolveTarget` | `resolveTarget(ref: unknown, cursor: AomCursor): any` | Единственное место разрешения `FwdRef`/`ThisRef`/`RouteRef`: его зовут обработчики параметров на каждом запросе, `realizeDelay` и проекция курсора |
| `AomCursorKind` / `AomParameterKind` / `AomValuesSource` / `AomViaKind` | string-enum словари проекции цепочки | Значения — строки (стабильны между версиями); неклассифицируемое — явное `Step`/`Other` |
| `AomParameterDescriptor` / `AomCursorParameter` / `AomRouterJSON` / `AomRouteJSON` / `AomCursorJSON` / `AomParameterJSON` | типы | Дескриптор параметра и форма проекции (`toJSON()`) |

## Внутренние модули

| Файл                                  | Ответственность                                                                        | Ключевые символы                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`                        | Реэкспорт публичной поверхности; импорт `reflect-metadata`                             | —                                                                                                                   |
| `src/classes/router.ts`               | Обход дерева контроллеров по бриджам, сборка `routes`/`sockets`, регистрация в OpenAPI | `Router`, приватный `build`                                                                                         |
| `src/classes/openapi.ts`              | Накопление `paths`/`tags`/`securitySchemes`/`schemas` по курсорам, `toJSON()`          | `OpenApi`, `registerPath`, `storeSecurityScheme`, `schemaExtract`                                                   |
| `src/common/classes.ts`               | Модель пакета: мета-класс, курсор, маршрут, контекст исполнения                        | `AomApi`, `AomCursor`, `AomRoute`, `RxContext`, `TagsRules`, `AomApiElement`, `AomHttpOpenApi`, `AomHttpParameters` |
| `src/common/route.ts`                 | Маршрут и обход раскладки курсоров                                                     | `AomRoute`, `plain` (функция модуля, не экспортируется из пакета)                                                   |
| `src/common/path.ts`                  | Грамматика адреса                                                                      | `compilePath` (публичный), `PATH_PARAM` (внутренний)                                                                |
| `src/testing/*.ts`                    | Путь `@aom-js/router/testing`: зонды; общие правила цепочки (`chain.ts`)               | `Tester`, `Probe`, `Observe`, `Report`, `isTester`, `TesterReport`, `runProbes`, `runSteps`; `parentsOf`, `routeName`, `sharedEndpoints`, `accessIdents`, `identCollisions`, `serializationErrors`, `constructorThisRefs`, `repeatsOf`; типы `Repeat`, `RepeatBranch`, `RepeatOptions` |
| `src/common/references.ts`            | Контейнеры отложенных ссылок                                                           | `RefContainer` (приватный), `FwdContainer`, `ThisRefContainer`, `RouteRefContainer`                                 |
| `src/common/lazy.ts`                  | Ленивая обёртка для полей `HttpContextValues`                                          | `LazyValue`, `lazy`, `Lazy<T>`                                                                                      |
| `src/common/openapi.ts`               | Типы деклараций OpenAPI (схема — класс, контейнер ссылки или объект)                   | `OpenApiPossibleSchema`, `OpenApiResponse`, `OpenApiPathParameters`                                                 |
| `src/common/types.ts`                 | Базовые функциональные типы и перечень методов                                         | `HTTPMethods`, `HandlerFunction`, `RefFunction`                                                                     |
| `src/types/index.ts`                  | Контракт входа `AomRoute.apply`                                                        | `HttpContextValues`, `RunFunction`                                                                                  |
| `src/decorators/controllers/index.ts` | `@Controller()`: наследование декораторов предков и `$._.apply()`                      | `Controller`                                                                                                        |
| `src/decorators/endpoints/index.ts`   | Эндпоинты, nextpoint, websocket                                                        | `Endpoint`, `Nextpoint`, `WebSocketPoint`, `defineEndpoint` (приватная)                                             |
| `src/decorators/middlewares/index.ts` | Связи между методами и контроллерами                                                   | `Before`, `After`, `Middleware`, `Bridge`, `Marker`, `UseMarker`, `Next`, `OnInstance`                              |
| `src/decorators/arguments/index.ts`   | Вычисление аргументов метода из контекста запроса                                      | `Args`, `This`, `Run`, `Err`, `Query`, `Body`, …                                                                    |
| `src/decorators/docs/index.ts`        | `summary`/`description` операции                                                       | `Title`, `Description`                                                                                              |
| `src/decorators/openapi/index.ts`     | Декларации операции + `DelayRefStack`                                                  | `Responses`, `RequestBody`, `PathParameters`, `Security`, `DelayRefStack`                                           |
| `src/decorators/openapi/tags.ts`      | Теги и правила их слияния                                                              | `UseTag`, `MergeNextTags`, `IgnoreNextTags`, `ReplaceNextTags`                                                      |
| `src/specials/references.ts`          | Фабрики контейнеров ссылок                                                             | `FwdRef`, `ThisRef`, `RouteRef`                                                                                     |
| `src/constants/errors.ts`             | Строковые коды ошибок определения (`message === код`)                                  | `MIDDLEWARE_DEFINE_ERROR`, `ENDPOINT_DEFINE_ERROR`, …                                                               |

## Ключевые механизмы

### Фазы декораторов и `@Controller`

Все декораторы — тонкие обёртки над фабриками мета-класса (`AomApi.classDecorator/methodDecorator/combinedDecorator/parameterDecorator`), которые кладут ленивый вызов в очередь нужной фазы. Фаза по умолчанию — `FIRST` (`packages/core/src/defines/callstack.ts` (`AomCallstackQueue.add`, `AomCallstackQueue.transferTo`)): обработчик выполняется сразу при декорировании и сохраняется для наследников. Фаза `LAST` откладывает вызов до `$._.apply()`, который делает `@Controller()`. Сам `@Controller()` — `INSTANT`: он не сохраняется в callstack (иначе рекурсия при переносе), вызывает `$._.inherit()` для ближайшего прототипа и поднимается по цепочке выше только пока очередной предок сам не помечен `@Controller()` (иначе его собственный `inherit` уже перенёс всё, что лежит выше), затем — `$._.apply()` (`packages/router/src/decorators/controllers/index.ts` (`Controller`)).

Отсюда два жёстких правила: `@Controller()` ставится верхним декоратором класса (выполняется последним), и наследник контроллера тоже обязан быть `@Controller()`: перенос декораторов предка делает только сам `@Controller()` (`packages/router/src/decorators/controllers/index.ts` (`Controller`)).

| Декоратор                                                                        | Цель         | Фаза            | Что делает                                                                                    | Где хранится                                               |
| -------------------------------------------------------------------------------- | ------------ | --------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `@Controller()`                                                                  | класс        | INSTANT         | `inherit` ближайшего прототипа (вверх — только через предков без `@Controller()`) + `apply()` | `element.isController`                                     |
| `@Bridge(prefix, Next)`                                                          | класс, метод | FIRST           | Регистрирует бридж; на методе — ставит метод первым pre-middleware дочернего контроллера      | `$._.root.element.bridges`; `next.element.pre_middlewares` |
| `@Endpoint(method, path)`, `@Get/@Post/@Put/@Patch/@Delete/@Options/@All(path?)` | метод        | FIRST           | Помечает метод эндпоинтом и регистрирует его у класса                                         | `element.isEndpoint`; `$._.root.element.endpoints`         |
| `@Get(path, handler)` и аналоги                                                  | класс        | FIRST           | Подключает чужой `@Nextpoint()` как эндпоинт класса                                           | `$.element.endpoints`                                      |
| `@Nextpoint()`                                                                   | метод        | FIRST           | Помечает метод продолжением                                                                   | `element.isNextpoint`                                      |
| `@WebSocketPoint(path)`                                                          | метод        | FIRST           | Эндпоинт с методом `sockets`                                                                  | `element.isWebsocket`; `$._.root.element.websockets`       |
| `@Middleware()`                                                                  | метод        | FIRST           | Помечает метод middleware                                                                     | `element.isMiddleware`                                     |
| `@Before(...)`                                                                   | класс, метод | LAST, `PREPEND` | Фильтрует аргументы по `isMiddleware`, доразрешает через `resolveFor`                         | `element.pre_middlewares`                                  |
| `@After(...)`                                                                    | класс, метод | LAST            | То же, но в пост-список                                                                       | `element.post_middlewares`                                 |
| `@Next(handler)`                                                                 | метод        | LAST            | Требует `isNextpoint` у аргумента                                                             | `element.nextpoint`                                        |
| `@OnInstance()`                                                                  | метод        | FIRST           | Регистрирует хук создания инстанса класса                                                     | `element.isInstance`; `$._.root.element.instanceHooks`     |
| `@Marker()`                                                                      | метод        | FIRST           | Помечает build-time обработчик                                                                | `element.isMarker`                                         |
| `@UseMarker(handler)`                                                            | метод        | LAST            | Требует `isMarker` у аргумента                                                                | `element.markers`                                          |
| `@Title(v)` / `@Description(v)`                                                  | класс, метод | FIRST           | Текст операции; `title` тега берётся отсюда же                                                | `$.title` / `$.description`                                |
| `@UseTag(Class)`                                                                 | класс, метод | FIRST           | Назначает тег                                                                                 | `$.openApi.tag.$`                                          |
| `@IgnoreNextTags/@MergeNextTags/@ReplaceNextTags`                                | класс, метод | FIRST           | Правило слияния                                                                               | `$.openApi.tag.rule`                                       |
| `@Security(schema)`                                                              | класс, метод | FIRST           | Схема безопасности                                                                            | `$.openApi.security`                                       |
| `@RequestBody(schema)`                                                           | метод        | FIRST           | Тело запроса                                                                                  | `$.openApi.requestBody`                                    |
| `@Responses(...)`                                                                | метод        | FIRST           | Ответы                                                                                        | `$.openApi.responses`                                      |
| `@PathParameters(...)`                                                           | метод        | FIRST           | Параметры пути                                                                                | `$.openApi.path`                                           |
| `@QueryParameters/@CookieParameters/@Parameters(...)`                            | метод        | FIRST           | Прочие параметры (с проставленным `in`)                                                       | `$.openApi.parameters`                                     |
| `@DelayRefStack(container)`                                                      | метод        | FIRST           | Кладёт контейнер в стек отложенных декораторов                                                | `$.delayStack`                                             |
| `@Args(handler)` и производные                                                   | параметр     | LAST            | Записывает обработчик по индексу параметра                                                    | `$.element.parameters.handlers[i]`                         |

### Сборка маршрутов (`Router.build`)

`new Router(root, docs)` берёт мета-инстанс корневого класса, рекурсивно спускается по бриджам и в конце регистрирует каждый собранный маршрут в документе (`packages/router/src/classes/router.ts` (`Router`)). Приватный `build` на каждом уровне: копирует унаследованные курсоры, дописывает курсоры классовых `@Before`, **этим составом** уходит в бриджи, затем отдельно строит курсоры классовых `@After` и создаёт по маршруту на каждый эндпоинт и на каждый websocket.

`packages/router/src/classes/router.ts` (`Router.build`)

```ts
  private build(root: AomApi, cursors: AomCursor[] = [], prefix: string = "/") {
    // на каждой итерации создается свой массив курсором, чтобы последующие действия не создавал перекрытий
    const preCursors = [...cursors];

    // объединим предварительные миддлвари, которые пойдут в другие бриджи
    preCursors.push(...root.element.pre_middlewares.map(($) => new AomCursor($, root, prefix)));

    root.element.bridges.forEach((bridge) => {
      this.build(bridge.next, preCursors, resolve(join(prefix, bridge.prefix)));
    });

    // создадим пост-миддлвари, которые не проталкиваются в другие бриджи, но используются для методов и сокетов
    const postCursors = root.element.post_middlewares.map(($) => new AomCursor($, root, prefix));

    root.element.endpoints.forEach((endpoint) => {
      const route = new AomRoute(this, prefix, endpoint, [...preCursors, ...postCursors]);
      this.routes.push(route);
    });

    root.element.websockets.forEach((endpoint) => {
      const route = new AomRoute(this, prefix, endpoint, [...preCursors, ...postCursors]);
      this.sockets.push(route);
    });
  }
```

Следствия: классовые `@Before` наследуются вниз по бриджам, классовые `@After` — нет; путь нормализуется через `resolve(join(prefix, endpoint.prefix))` (POSIX, `packages/router/src/common/route.ts` (`AomRoute`)); `sockets` в OpenAPI не регистрируются (`Router` (конструктор) перебирает только `routes`).

Курсоры классового уровня **общие** для всех маршрутов контроллера и его бриджей, поэтому `AomRoute` создаёт для каждого маршрута собственные курсоры поверх общих, не трогая исходные (`packages/router/src/common/route.ts` (`AomRoute`), комментарий на месте): если мутировать общие (`endpoint`, `index`), `RouteRef` внутри такого курсора после сборки нескольких маршрутов указывал бы на последний собранный, а не на «свой». Курсор class-level middleware, попавший в `Router.build` без эндпоинта (например, через `@DelayRefStack(RouteRef(...))`), при попытке реализовать `RouteRef` в `realizeDelay` получает управляемую ошибку `ROUTE_REF_DELAY_ERROR` — см. §«Отложенные ссылки…».

### Раскладка курсоров и порядок исполнения (`plain`)

Конструктор маршрута пересоздаёт полученные курсоры классового уровня под свой `endpoint` (не мутируя исходные), добавляет курсор самого эндпоинта последним и раскладывает всё рекурсивно; затем нумерует курсоры и на каждом вызывает объявленные маркеры (`packages/router/src/common/route.ts` (`AomRoute`)).

Раскладку делает функция модуля `plain` (`packages/router/src/common/route.ts` (`plain`)). Из пакета она не экспортируется; кроме конструктора, её зовёт только прогонщик зондов, чтобы развернуть один шаг (§«Зонды…»).

```ts
export function plain(cursors: AomCursor[], into: AomCursor[] = []): AomCursor[] {
  cursors.forEach((cursor) => {
    plain(cursor.$.element.pre_middlewares.map(/* new AomCursor(..), via: Before */), into);
    into.push(cursor);
    plain(cursor.$.element.post_middlewares.map(/* new AomCursor(..), via: After */), into);
    if (cursor.$.element.nextpoint) plain([/* new AomCursor(nextpoint, ..), via: Next */], into);
  });
  return into;
}
// псевдокод: map-функции сокращены
```

Итоговый порядок курсоров одного маршрута — фиксированный:

```
классовые @Before → классовые @After → методные @Before → эндпоинт → методные @After → цепочка @Next
```

Классовый `@After` стоит **до** эндпоинта: он попадает в `postCursors`, а те приписываются к входному списку `AomRoute` рядом с `preCursors`, тогда как эндпоинт добавляется последним (`Router.build`, `AomRoute` (конструктор) в `packages/router/src/common/route.ts`). Пример: при `@Before`/`@After` на базовом и дочернем контроллерах цепочка выходит `parent-before → child-before → child-after → parent-after → endpoint`. При наследовании родительские `@Before` встают перед собственными (`InheritPlacement.PREPEND`, `packages/router/src/decorators/middlewares/index.ts` (`Before`)), а `@After` — после собственных (`APPEND` по умолчанию).

### Исполнение запроса (`RxContext.run`)

`AomRoute.apply(values)` создаёт новый `RxContext` (значения запроса, пустая `state` и пустая карта `pending` идущих/отказавших созданий — см. следующий раздел) и прогоняет список курсоров (`packages/router/src/common/route.ts` (`AomRoute.apply`)).

`packages/router/src/common/context.ts` (`RxContext.run`)

```ts
          concatMap(async (cursor: AomCursor) => {
            try {
              const { $ } = cursor;
              // на уровне каждого курсора проверим, что для него есть существуюший инстанс в state
              // и создадим его, если его нет (работает в том числе с учетом декорированных constructor)
              const { target } = $._;
              if (!this.state.get(target)) {
                // создадим инстанс с учетом вероятных хуков
                await AomApi.instanceWithHooks(target, { context: this, cursor, route });
              }
              const args = await Promise.all(
                $.element.parameters.apply({ context: this, cursor, route }),
              );

              const result = await Reflect.apply(
                $.element.descriptor?.value || new Function(),
                target,
                args,
              );

              // Если результат - ошибка, выбрасываем её
              if (result instanceof Error) {
                throw result;
              }

              return result;
            } catch (error) {
              throw error;
            }
          }),
```

Курсоры идут строго последовательно (`concatMap`). `takeWhile((result) => result === undefined, true)` обрывает цепочку на первом не-`undefined` результате, и подписчик резолвит его как ответ; если все курсоры вернули `undefined`, промис резолвится в `undefined`; брошенная или **возвращённая** ошибка отправляется в `reject` (`RxContext.run` в `packages/router/src/common/context.ts`). `this` внутри метода — сам класс (`Reflect.apply(..., target, args)`), потому что все обработчики статические. Обработчики аргументов вызываются с тем же `this` (`packages/router/src/common/api.ts` (`AomHttpParameters.apply`)).

### Инстансы, `state` и `@OnInstance` (`AomApi.instanceWithHooks`)

`state` — `ClassInstanceMap` (карта «конструктор → экземпляр»), новая на каждый `apply()`, поэтому один готовый инстанс класса на класс на запрос — но в неё попадает только объект, прошедший **все свои** хуки `@OnInstance`. Публикация двухстадийная: пока хуки идут, объект лежит в `RxContext.inflight` (`Map<ClassConstructor, any>`) и виден только ветке исполнения, которая его создаёт; после успешного окончания хуков он переносится в `state`, и только тогда его видят чужие `@This`, `@State(X)` и `@State()` без аргумента (поля `RxContext` и `AomApi.instanceWithHooks` — `packages/router/src/common/context.ts` (`RxContext.state`, `RxContext.pending`, `RxContext.inflight`, `RxContext.waits`), `packages/router/src/common/api.ts` (`AomApi.instanceWithHooks`)). Правило чтения инстанса целиком живёт в одном месте — `instanceWithHooks`; `RxContext.run` зовёт его для класса-владельца каждого курсора безусловно, даже если `@This()` нигде не запрошен (`RxContext.run`), и `@This` не читает `state` отдельно (`packages/router/src/decorators/arguments/index.ts` (`This`)).

Зачем так: аргументы метода разрешаются конкурентно через `Promise.all`, поэтому простой check-then-create по `state` создал бы для двух `@This(X)` одного класса в одном методе два инстанса и дважды прогнал бы `@OnInstance`; а инстанс, опубликованный в `state` сразу после конструктора, ещё до хуков, достался бы чужому коду (параллельный путь, `@This` из хука другого класса) непроверенным, если хук потом откажет, — это обход авторизации. Устройство:

`packages/router/src/common/api.ts` (`AomApi.instanceWithHooks`)

```ts
  static instanceWithHooks(target: ClassConstructor, args: ArgumentsHandlerParameters) {
    const { context, cursor } = args;

    // проверенный инстанс: в state попадает только то, что прошло все свои хуки
    const ready = context.state.get(target);
    if (ready) return ready;

    if (cursor.creating.includes(target)) {
      // создание target держит эта же ветка исполнения. Собственный код класса (его хук
      // через @This(), его же middleware через next()) получает непроверенный инстанс сразу:
      // ждать ему нечего, он сам и есть то создание, которого пришлось бы ждать
      if (cursor.$._.target === target) {
        const instance = context.inflight.get(target);
        // инстанса ещё нет — мы внутри собственного конструктора класса: настоящий цикл
        if (!instance) throw circularInstanceError([...cursor.creating, target]);
        return instance;
      }
      // чужой код внутри создания target: дождаться нельзя (создание target ждёт окончания
      // этой самой ветки), а непроверенный инстанс наружу не отдаём — это и есть цикл
      throw circularInstanceError([...cursor.creating, target]);
    }

    // создание этого класса уже идёт или отказало в этом запросе — вернём его, а не создадим
    // второй инстанс (аргументы метода решаются конкурентно, Promise.all); run и @This дождутся
    // проверенного или получат ту же ошибку
    const pending = context.pending.get(target);
    if (pending) return context.waitCreation(target, pending, cursor.creating.at(-1));

    const $target = AomApi.instance(target);
    // цепочка владения: эта ветка создаёт target, а с ним и всё, что он потянет за собой
    const creating = [...cursor.creating, target];
    const creation = (async () => {
      // первый await — до разбора аргументов конструктора: он даёт context.pending (ниже)
      // зафиксироваться раньше, чем @This из конструктора вернётся сюда же. Без него взаимные
      // ссылки конструкторов уходят в синхронную рекурсию и рвут стек вместо понятной ошибки
      await Promise.resolve();

      // аргументы конструктора разбираем от курсора этой же ветки: клон через прототип несёт
      // цепочку владения, но не перезапускает delayStack и сохраняет $, index и эндпоинт
      const ownCursor: AomCursor = Object.assign(Object.create(cursor), { creating });
      const instanceArgs = await Promise.all(
        $target.element.parameters.apply({ ...args, cursor: ownCursor }),
      );
      const instance = Reflect.construct(target, instanceArgs);

      // инстанс создан, но не проверен: до конца хуков он виден только собственной ветке
      // через inflight, в общую карту запроса (state) не попадает
      context.inflight.set(target, instance);

      // используем механику, аналогичную процедуре run, только в качестве источника
      // курсоров используем список instanceHooks
      const { prefix, endpoint } = cursor;

      // асинхронно запустим все хуки (порядок должен быть не важен)
      await Promise.all(
        $target.element.instanceHooks.map(($) => {
          const nextCursor = new AomCursor($, cursor.$, prefix, endpoint);
          nextCursor.creating = creating;
          return context.run([nextCursor]);
        }),
      );

      // хуки пройдены — только теперь инстанс становится общим: его видят @State, @This
      // и курсоры чужих веток. Если хук отказал, в state не попадает ничего
      context.state.set(target, instance);
      return instance;
    })().finally(() => context.inflight.delete(target));

    // до первого await зафиксируем идущее создание. При успехе запись снимем — инстанс уже в state.
    // При отказе (конструктор или хук) отклонённое создание остаётся до конца запроса: следующие
    // обращения к классу получают ту же ошибку и не создают его заново — иначе соседний хук,
    // обратившийся к классу после отказа, запускал бы создание и проверку по кругу
    context.pending.set(target, creation);
    creation.then(
      () => context.pending.delete(target),
      // ошибку получают все, кто ждёт creation; здесь только не даём ей стать необработанной
      () => undefined,
    );
    return creation;
  }
```

Реентрантность решают два условия сразу: класс есть в цепочке владения этой ветки (`AomCursor.creating` — список классов, создание которых держит текущая ветка исполнения; живёт на курсоре, а не в контексте, потому что веток одновременно несколько — `Promise.all` по хукам и по аргументам, `packages/router/src/common/cursor.ts` (`AomCursor.creating`)) **и** выполняемый код принадлежит этому же классу (`cursor.$._.target === target`). Тогда собственный хук класса или его же middleware, поднятая через `@Run()`-`next()`, получает непроверенный инстанс из `inflight` сразу, без ожидания — ждать нечего, эта ветка и есть то создание, которого пришлось бы ждать. Если класс в цепочке владения, а код чужой — это цикл: непроверенный инстанс наружу не отдаётся, вместо него `CIRCULAR_INSTANCE_ERROR` (`packages/router/src/constants/errors.ts` (`CIRCULAR_INSTANCE_ERROR`)) с перечнем имён классов цепочки, через `->`.

Чужая ветка, наткнувшаяся на создание, которое держит не она (класса нет в её `creating`), не плодит второй инстанс и не виснет: `pending`-промис на класс уже есть, и она встаёт в очередь через `RxContext.waitCreation` — получит либо проверенный инстанс, либо ту же ошибку хука.

`packages/router/src/common/context.ts` (`RxContext.waitCreation`)

```ts
  // ожидание чужого создания: прежде чем встать в очередь, проверим, не ждёт ли target (прямо
  // или по цепочке) создание самого ожидающего — иначе обе ветки встанут навсегда
  waitCreation(target: ClassConstructor, creation: Promise<any>, waiter?: ClassConstructor): any {
    // ветка ничего не создаёт — замкнуть цикл нечем, ребро не нужно
    if (!waiter) return creation;

    const cycle = this.findWaitPath(target, waiter);
    if (cycle) throw circularInstanceError([waiter, ...cycle]);

    const targets = this.waits.get(waiter) ?? new Set<ClassConstructor>();
    targets.add(target);
    this.waits.set(waiter, targets);

    const release = () => {
      const current = this.waits.get(waiter);
      if (!current) return;
      // снимаем только своё ребро: ветка может ждать и других
      current.delete(target);
      if (!current.size) this.waits.delete(waiter);
    };
    // ошибку создания получает тот, кто ждёт creation; здесь только снимаем ребро в обе
    // стороны и не даём отказу стать необработанным
    creation.then(release, release);

    return creation;
  }
```

Граф `waits` (`Map<ClassConstructor, Set<ClassConstructor>>` — «кто кого ждёт», ребро живёт, пока ветка ждёт чужое создание) превращает встречное ожидание двух веток в тот же `CIRCULAR_INSTANCE_ERROR`, а не в зависший запрос.

Ветка может ждать нескольких созданий сразу — и аргументы конструктора, и хуки экземпляра исполняются параллельно, — поэтому хранятся все рёбра, а не последнее, и проверка на цикл идёт обходом графа (`RxContext.findWaitPath`, поиск в глубину с пометками посещённых узлов), а не проходом по цепочке. С одним ребром на ветку второе ожидание затирало бы первое, и цикл через забытое ребро вешал бы запрос вместо ошибки.

**Отказ конструктора или хука помнится до конца запроса**: `pending` не снимается при ошибке, следующие обращения к тому же классу в рамках запроса получают ту же ошибку без повторного создания. Паттерн «попробовать → войти → повторить» в одном запросе не работает — второй `next(Auth.Required)` после перехваченной ошибки первого получает ту же ошибку, не запуская проверку заново.

`@This(...)` (`packages/router/src/decorators/arguments/index.ts` (`This`)) разрешает цель в порядке: `FwdContainer` → `exec()`; `RouteRefContainer` → `exec(cursor.endpoint.$._.target)`; `ThisRefContainer` → `exec(cursor.$._.target)` — у унаследованного метода это потомок, на котором он исполняется, так что базовый класс может взять класс из статики потомка; класс — как есть; без аргумента — класс текущего курсора. Затем всегда — `AomApi.instanceWithHooks(target, args)`, без отдельного чтения `state`.

Публичные следствия:

1. Пока хуки класса не прошли, его инстанс не виден из чужих веток ни через `@This(X)`, ни через `@State(X)`, ни через `@State()` без аргумента — чужое обращение ждёт.
2. `@This(СоздаваемыйКласс)` в middleware или хуке ЧУЖОГО класса, поднятого через `@Run()`-`next()` из хука создаваемого класса, даёт `CIRCULAR_INSTANCE_ERROR`. Приём «хук зовёт через `next()` класс-помощник, а тот сам берёт `@This` на вызывающий класс» не работает — объект нужно передавать помощнику аргументом, обычным вызовом функции в обход `next()` (`next()` строит курсор из `AomApi.instance(handler)` и выполняет именно декорированный метод-цель, а не произвольное замыкание, поэтому передать инстанс через него нельзя — только через параметр):

   ```ts
   // так нельзя: Reporter.report берёт Auth сам, через @This, из курсора, поднятого next()
   @Controller()
   class Auth {
     @OnInstance()
     static async audit(@Run() next: RunFunction) {
       await next(Reporter.report); // Reporter.report(@This(Auth) auth) → CIRCULAR_INSTANCE_ERROR
     }
   }
   @Controller()
   class Reporter {
     @Middleware()
     static async report(@This(Auth) auth: Auth) {
       /* ... */
     }
   }

   // так можно: Reporter — обычный класс, self передаётся аргументом обычным вызовом, без next()
   @Controller()
   class Auth {
     @OnInstance()
     static async audit(@This() self: Auth) {
       await Reporter.notify(self);
     }
   }
   class Reporter {
     static async notify(auth: Auth) {
       /* ... */
     }
   }
   ```

3. Взаимные хуки двух классов (`A` ждёт `B` через `@This`, `B` ждёт `A`) → `CIRCULAR_INSTANCE_ERROR` с именами классов.
4. Цикл «конструктор ↔ хук» → та же ошибка.
5. Взаимный `@This` в конструкторах двух классов → та же ошибка.
6. `@This(СвоегоКласса)` внутри собственного конструктора класса (инстанса ещё нет) → та же ошибка.
7. Исключение — собственный код класса: `@This()` и `@This(СвойКласс)` **внутри собственного хука класса или его же middleware, поднятой через `@Run()`-`next()` из хука** отдают инстанс сразу, до окончания всех проверок этого класса (реентрантность из правила выше — свой код своего же создающегося класса). Свой хук видит ещё не проверенный объект и сам отвечает за то, чтобы не отдать его наружу — не положить в `ctx`, не сохранить в модульную переменную, не передать в чужой `next()`. Кодом фреймворка это не проверяется и не может: граница ответственности — на границе класса.

> Чужой код (другой класс, параллельная ветка) не видит инстанс раньше времени и не может произвести видимый эффект через него до отказа проверки — это обеспечивает двухстадийная публикация выше. Хуки одного и того же класса друг друга при отказе не отменяют — см. [§«Ограничения»](#ограничения).

### Ленивые значения контекста (`lazy`, `LazyValue`, `RxContext.value`)

`HttpContextValues` (`src/types/index.ts` (`HttpContextValues`)) принимает в полях `query`, `params`, `cookies`, `headers`, `session` либо готовое значение, либо `lazy(() => value)` — обёртку `Lazy<T> = T | LazyValue<T>` из `packages/router/src/common/lazy.ts`. Поля `body` и `files` имеют тип `any`, но по тому же контракту тоже принимают `lazy(...)`. Декораторы `@Body`, `@Query`, `@Params`, `@Cookies`, `@Headers`, `@Session`, `@Files` берут значение не напрямую из `context.values`, а через `context.value(key)`.

`packages/router/src/common/context.ts` (`RxContext.value`)

```ts
  // разрешение ленивого поля контекста: готовое значение возвращается как есть, ленивое —
  // запускает фабрику не раньше первого обращения и только один раз на запрос
  value<K extends keyof HttpContextValues>(key: K): any {
    const source: any = this.values[key];
    if (!(source instanceof LazyValue)) return source;

    const cached = this.resolved.get(key);
    if (cached) return cached;

    const promise = Promise.resolve().then(() => source.factory());
    this.resolved.set(key, promise);
    promise.catch(() => undefined);
    return promise;
  }
```

Фабрика вызывается не раньше первого обращения к полю и максимум один раз за запрос: результат (или отказ) кладётся в приватную карту `RxContext.resolved` синхронно, до первого `await`, поэтому параллельные обращения (два `@Body` в одном методе, `@Body` в middleware и в эндпоинте) получают один и тот же промис, а не запускают фабрику дважды. Синхронный `throw` внутри фабрики и её собственный отказ приходят к вызывающему коду одним и тем же путём — `reject` промиса `value()`.

Зачем это нужно: значение, которое дорого получить — прежде всего тело запроса, — не вычисляется, если маршрут до него не дошёл, например когда проверка доступа отказала раньше. Адаптер чужого HTTP-фреймворка кладёт в соответствующее поле `HttpContextValues` либо готовое значение (фреймворк уже всё разобрал), либо `lazy(() => ...)` (поток сырой, разбор дорогой) — отдельного интерфейса адаптера не требуется, контракт целиком описывается `HttpContextValues` и `LazyValue`.

> Оговорка про порядок: выигрыш «неавторизованный запрос не заставляет читать тело» держится только пока проверки доступа идут раньше `@Body` в списке курсоров маршрута и сами не читают `@Body`. Курсоры идут строго последовательно (`concatMap`, см. §«Исполнение запроса…» выше), поэтому если билдер тела поставить в `@Before` раньше авторизации, тело снова будет читаться первым — раньше, чем выяснится, что читать его не нужно было.

### Декораторы аргументов (`Args`)

`Args(handler, descriptor?)` кладёт обработчик по индексу параметра в фазе LAST (`$.element.parameters.handlers[i]`), а рядом — дескриптор того, что параметр внедряет (`$.element.parameters.descriptors[i]`: `kind`, для `Values` — `source`, цель `ref`). Обработчик получает `{context, cursor, route}` и может быть асинхронным — все обработчики метода разрешаются через `Promise.all`. Каждый встроенный декоратор передаёт свой дескриптор; пользовательский `Args(handler)` без дескриптора получает `{kind: "other"}`. Цели-рефы (`FwdRef`/`ThisRef`/`RouteRef`) обработчики разрешают через `resolveTarget` на каждом вызове — той же функцией, что и проекция курсора.

| Декоратор                                            | Что получает                                                                                                                                                                   | Формы аргумента                                                                                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@Args(h)`                                           | результат `h({context, cursor, route})`                                                                                                                                        | функция; по умолчанию — тождественная (возвращает весь объект)                                                                                                                                                      |
| `@Query`, `@Body`, `@Params`, `@Cookies`, `@Headers` | `values.query/body/params/cookies/headers`, через `context.value(key)` — если поле было `lazy(...)`, фабрика вызывается здесь, не раньше                                       | строка — значение по ключу; функция — вызывается со всем объектом; `ThisRef` — вызывается с классом курсора, результат применяется как функция; `RouteRef` — то же с классом эндпоинта; без аргумента — весь объект |
| `@Session(name?)`, `@Files(name?)`                   | `values.session` / `values.files`, тоже через `context.value(key)`                                                                                                             | строковый ключ либо ничего                                                                                                                                                                                          |
| `@Ctx()`, `@Req()`, `@Res()`                         | `values.ctx` / `values.req` / `values.res`                                                                                                                                     | нет                                                                                                                                                                                                                 |
| `@Cursor()`, `@Route()`                              | текущий `AomCursor` / `AomRoute`                                                                                                                                               | нет                                                                                                                                                                                                                 |
| `@State(ctor?)`                                      | инстанс из `state` (только прошедший свои хуки) либо весь `state`                                                                                                              | конструктор                                                                                                                                                                                                         |
| `@This(ctor?)`                                       | инстанс класса; создаётся при отсутствии; пока идут хуки класса — виден без ожидания только его собственному коду, чужой ждёт или получает `CIRCULAR_INSTANCE_ERROR` при цикле | класс, `FwdRef`, `ThisRef`, `RouteRef`, пусто                                                                                                                                                                       |
| `@Run()`                                             | функция `(...handlers) => Promise<any>`, строящая новые курсоры с тем же эндпоинтом и цепочкой владения (`creating`) и прогоняющая их в текущем контексте                      | нет                                                                                                                                                                                                                 |
| `@Err(Ctor = Error)`                                 | фабрика `(message, status?, data?) => Error` со `status` из аргумента, инстанса или статики класса                                                                             | класс-наследник `Error`                                                                                                                                                                                             |

### Отложенные ссылки и `DelayRefStack`

Контейнеры `FwdContainer`/`ThisRefContainer`/`RouteRefContainer` хранят функцию и различаются аргументом её вызова: `FwdRef` — без аргумента (обход циклических импортов), `ThisRef` — класс текущего курсора, `RouteRef` — класс эндпоинта маршрута (`packages/router/src/common/references.ts` (`RefContainer`, `FwdContainer`, `ThisRefContainer`, `RouteRefContainer`), фабрики — `packages/router/src/specials/references.ts` (`FwdRef`, `ThisRef`, `RouteRef`)).

`@Before`/`@After`/`@Next`/`@UseMarker` разворачивают `FwdRef` при первом чтении связей шага — обычно при сборке `Router`, когда все модули уже загружены, — поэтому ссылка на класс ниже по файлу или из модуля в цикле импортов работает (`packages/router/src/common/api.ts` (`AomApiElement`)). Прямую ссылку они проверяют сразу, при объявлении класса; `FwdRef` на шаг не того вида даёт `USE_MIDDLEWARE_DEFINE_ERROR`/`USE_NEXT_DEFINE_ERROR`/`USE_MARKER_DEFINE_ERROR` при сборке.

`@DelayRefStack(container)` откладывает целые декораторы: функция контейнера должна вернуть массив декораторов, которые применяются к методу в момент создания курсора — то есть уже в контексте конкретного потомка. Это то, на чём стоят билдеры `@aom-js/api` (базовый класс объявляет middleware, потомок задаёт статическое значение — схему или имя параметра).

`packages/router/src/common/cursor.ts` (`AomCursor.realizeDelay`)

```ts
    // отложенный стек реализуется на инстансе однократно; при ошибке признак не взводится
    // и стек не расходуется — проблема привязки воспроизводится на каждой сборке, а не гаснет тихо
    if (!$.delayRealized && $.delayStack.length) {
      for (const handler of $.delayStack) {
        // дескриптор передаётся явно
        const descriptor = Reflect.getOwnPropertyDescriptor(target, property!);
        // RouteRef зависит от эндпоинта, а стек реализуется один раз на мета-инстанс:
        // держать его может только стек самого эндпоинта
        if (handler instanceof RouteRefContainer && $ !== this.endpoint?.$) {
          throw new Error(constants.ROUTE_REF_DELAY_ERROR);
        }
        Reflect.decorate([...resolveTarget(handler, this)], target, property!, descriptor);
      }
      $.delayRealized = true;
      $._.apply();
    }
```

Ветки `FwdRef`/`ThisRef`/`RouteRef` — в одной функции `resolveTarget` (раздел «Метаданные цепочки»). Аргумент `@DelayRefStack` — только контейнер: голая функция (`@DelayRefStack(() => [...])`) роняет сборку курсора (`resolveTarget` возвращает её как есть, и разворот `[...fn]` бросает `TypeError`). Правило `RouteRef` в `@DelayRefStack`: допустим только на эндпоинт-методе. Стек реализуется один раз на мета-инстанс, в контексте первого курсора, поэтому на шаге, общем для нескольких маршрутов, реализация от первого маршрута тихо распространилась бы на остальные; на любом другом шаге сборка `Router` бросает `ROUTE_REF_DELAY_ERROR`. В аргументах (`@This(RouteRef(...))`, `@Query(RouteRef(...))`) `RouteRef` разрешается на каждом вызове и на общем шаге даёт класс эндпоинта своего маршрута.

Перед реализацией стека конструктор курсора перепривязывает мета-инстанс: `this.$ = AomApi.resolveFor($, origin._.target)` (`packages/router/src/common/cursor.ts` (`AomCursor`)). Это нужно, когда ссылка `Self.Method` зафиксировала статику родителя до того, как отработал `@Controller()` потомка: `resolveFor` возвращает инстанс каррированной копии потомка, если она есть (`packages/core/src/defines/core.ts` (`AomCore.resolveFor`)). Ту же перепривязку делают `@Before`, `@After`, `@UseMarker` и `@Next` в контексте класса-декларатора; `@Before/@After/@UseMarker/@Next` дополнительно принимают `FwdContainer` и разворачивают его перед разрешением (`packages/router/src/decorators/middlewares/index.ts` (`Before`, `After`, `UseMarker`, `Next`)). В генераторе документа `ThisRef`/`RouteRef` в схемах исполняются с теми же контекстами (`packages/router/src/classes/openapi.ts` (`OpenApi.schemaExtract`)).

### Маркеры

`@Marker()` помечает статический метод сигнатуры `(route: AomRoute, cursor: AomCursor) => void`; `@UseMarker(marker)` привязывает его к методу. При создании маршрута для каждого курсора вызываются все маркеры его мета-инстанса, с `this` = класс маркера (`packages/router/src/common/route.ts` (`AomRoute`)). Это **build-time** механизм: на запросе маркеры не выполняются, результат живёт в `route.markers` (`Record<string, any>`).

`packages/api/src/controllers/access/access-controller.ts` (`BaseAccessController.setAccessMark`)

```ts
  // установить типичный доступ с учетом требований к конкретным типам партнерств
  @Marker()
  static setAccessMark(route: AomRoute, cursor: AomCursor): void {
```

Маркер срабатывает столько раз, сколько курсоров с ним в маршруте, и читает `cursor.origin._` — место сцепки, а не место объявления. На этом построена карта доступа: `@aom-js/api` собирает `route.markers[markerName]`, а приложение фильтрует по нему список маршрутов. Механика маркера доступа — [`@aom-js/api`](api.md).

### Сборка OpenAPI (`OpenApi.registerPath`)

`Router` вызывает `docs.registerPath(route)` для каждого маршрута. Метод формирует одну операцию: `operationId = ${Класс}_${метод}` эндпоинта, `summary`/`description` — из `@Title`/`@Description` эндпоинта (`packages/router/src/classes/openapi.ts` (`OpenApi.registerPath`)), затем проходит **по всем курсорам по порядку** и накапливает:

- **теги** (`OpenApi.registerPath`): правило переключается на любом курсоре с `@MergeNextTags`/`@IgnoreNextTags`/`@ReplaceNextTags`, со своим `@UseTag` или без, и действует на тег этого курсора и всех следующих; `REPLACE` (по умолчанию) заменяет последний тег, `MERGE` добавляет, `IGNORE` пропускает; имя тега — `$.title` класса-тега либо имя класса; итог — одна строка, склеенная `OpenApi.tagsSeparator` (`" > "`). Проба: `@UseTag` на middleware + `@UseTag` + `@MergeNextTags` на эндпоинте дают тег `"Раздел > TagB"`, без `@MergeNextTags` — `"TagB"`;
- **параметры пути** (`OpenApi.registerPath`): ключ структуры `@PathParameters` — литеральный фрагмент пути, на `{name}` заменяется первое вхождение ключа, за которым не идёт буква, цифра или `_` (`OpenApi.replacePathKey`): ключ может стоять внутри сегмента (`id-:countryId(...)`), а `:id` не задевает `:id2`; параметр добавляется как `in: "path", required: true`;
- **прочие параметры**, **ответы** (статус — ключ, поэтому последний курсор с тем же статусом заменяет ответ целиком; `isArray` оборачивает схему в `{type: "array", items}`; поток событий — ниже), **security**, **requestBody** (последний выигрывает; всё — там же, `OpenApi.registerPath`).

**Поток событий — опция `events`.** Ответ `@Responses` — один из двух видов (`packages/router/src/common/openapi.ts` (`OpenApiResponse`)): обычный `{ status, description, schema, isArray?, contentType? }` или поток Server-Sent Events `{ status, description, events, contentType? }`, где `events` — словарь «тип события → схема его значения» (класс `@ComponentSchema`, сырая схема, `ThisRef`/`RouteRef`); `schema` и `events` взаимоисключающие уже в типах. Событие в потоке — конверт `{ type, [type]: значение }` в `data` кадра, без строки `event:` ([`@aom-js/api`](api.md), «SSE-ссылки»). Поток пишется под `contentType` (по умолчанию `text/event-stream`) стандартным полем OpenAPI 3.2 `itemSchema` — схема одного события, один вариант, у которого `data` — JSON конверта, — и `schema` — всё содержимое как массив таких событий (по 3.2, раздел 4.14, `schema` потокового типа описывает содержимое целиком как массив элементов; инструменты без `itemSchema`, например Swagger UI 5.33, видят хотя бы его) (`packages/router/src/classes/openapi.ts` (`OpenApi.eventsItemSchema`)):

```jsonc
{
  "schema": { "type": "array", "items": { /* то же, что itemSchema */ } },
  "itemSchema": {
    "type": "object", "required": ["data"],
    "properties": {
      "data":  { "type": "string", "contentMediaType": "application/json",
                 "contentSchema": {
                   "type": "object", "required": ["type"],
                   "properties": {
                     "type":   { "enum": ["unread", "notice"] },
                     "unread": { "$ref": "#/components/schemas/UnreadEvent" },
                     "notice": { "$ref": "#/components/schemas/NoticeEvent" } } } },
      "id":    { "type": "string" },
      "retry": { "type": "integer" } } }
}
```

Правило «значение — под ключом, названным в `type`» схема не выражает — его держат сборка конверта в реестре и проверка отправки; строгой формы (`oneOf` + `discriminator`) генератор не пишет. Схема каждого значения проходит тот же `schemaExtract`, что и `schema` обычного ответа: класс попадает в `components.schemas`, `ThisRef`/`RouteRef` разрешаются на курсоре. Пустой словарь или ключ `type` (занят типом конверта) — `RESPONSE_EVENTS_DEFINE_ERROR` при сборке `Router`. Готовый ответ из реестра потоков — `AomServerEvents.JSONSchema` ([`@aom-js/api`](api.md), «SSE-ссылки»).

Схемы проходят через `schemaExtract`: `ThisRef`/`RouteRef` исполняются, результат отдаётся `SchemasCollector.extract` из `@aom-js/schemer`, который превращает компонент-класс в `{$ref}` и складывает рендер в `components` (`packages/router/src/classes/openapi.ts` (`OpenApi.schemaExtract`); подробности сборщика — [`@aom-js/schemer`](schemer.md)).

Конструктор принимает только `info` документа (`title`, `version`, `description`, `contact`, …); остальное в документе — строго результат генерации (`packages/router/src/classes/openapi.ts` (`OpenApi.toJSON`)): `openapi` — константа генератора `OpenApi.version` (версия формата — свойство генератора: от неё зависит, какие поля он умеет писать), `tags` — имена из `@UseTag` без описаний, `paths` — зарегистрированные маршруты, `components` — `securitySchemes` (ключ — имя класса курсора, `OpenApi.storeSecurityScheme`) и `schemas` из сборщика. Заранее переданных `components`/`tags`/`paths`, `servers` и описаний тегов нет.

### Метаданные цепочки (`toJSON`, `routeOf`, `@CursorKind`)

Собранная цепочка маршрута — список курсоров: порядок шагов, причина, по которой шаг стоит в цепочке, и класс, на котором он исполняется (`resolveFor`, `ThisRef`, `DelayRefStack`), в нём явно не записаны. Проекция делает цепочку читаемым артефактом. Источник истины — код: проекция пересчитывается по требованию, ничего не исполняет и в рантайме не хранится.

**Словари** — string-enum, значения — строки (сериализация стабильна между версиями), неклассифицируемое — явное значение, а не пропуск (`packages/router/src/common/kinds.ts`):

- `AomCursorKind` — вид шага: `handler`, `checkpoint`, `transport`, `filter`, `value`, `collector`, `pager`, `response`, `input`, `meta`, `step` (умолчание);
- `AomParameterKind` — что внедряет параметр: `this`, `state`, `run`, `values`, `cursor`, `route`, `ctx`, `req`, `res`, `err`, `other` (пользовательский `Args`);
- `AomValuesSource` — поле запроса для `values`: `query`, `body`, `params`, `headers`, `cookies`, `session`, `files`;
- `AomViaKind` — почему курсор в цепочке (таблица ниже).

**`@CursorKind(kind)`** ставится на **определении** шага и только там, где вид нельзя вывести из того, чем код является; синтаксис прикреплений (`@Before(...)`, `@Next(...)`) не меняется. Пакет хранит только объявленный вид (`$.element.cursorKind`); виды из классов ядра (`handler`, `checkpoint`, `input`, `meta`) выводит `@aom-js/api/testing` (`kindOf`: гейт и билдеры — классы `api`, а роутер от `api` не зависит), вид своих классов передаёт приложение — [Тестирование приложения](../testing.md#вид-шага-и-выгрузка-aom-jsapitesting). Значение вне словаря и повторная разметка — `CURSOR_KIND_DEFINE_ERROR` при декорировании: `bun test` типы не проверяет, и опечатка не должна тихо стать `step`.

**Цели параметров.** `Args` пишет дескриптор рядом с обработчиком (раздел «Декораторы аргументов»). `resolveTarget(ref, cursor)` — единственное место, где разворачиваются рефы: `FwdRef` → результат функции, `ThisRef` → функция от класса курсора (после `resolveFor`), `RouteRef` → функция от класса эндпоинта (без эндпоинта — `ROUTE_REF_DELAY_ERROR`), остальное — как есть. Её вызывают обработчики параметров на каждом запросе, `AomCursor.realizeDelay` и `AomCursor.parameters()`, поэтому проекция совпадает с исполнением по построению. `cursor.parameters()` — вычисляемый список `{kind, source?, target?, name?}` по порядку сигнатуры; для `@This()` без аргумента цель — класс самого курсора.

**`via` и `viaGroup`** задаются там, где цепочка раскладывается, и переносятся при пересоздании курсоров в `AomRoute`:

| `via`          | Откуда                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| `class-before` | `Router.build`: классовый `@Before`, в том числе пришедший через `@Bridge` |
| `class-after`  | `Router.build`: классовый `@After` — встаёт **до** эндпоинта              |
| `before`       | `plain`: методный `@Before` эндпоинта или шага                   |
| `endpoint`     | конструктор `AomRoute`: сам обработчик                                    |
| `after`        | `plain`: методный `@After`                                       |
| `next`         | `plain`: раскрытие `@Next`; `viaGroup` — `AomApi.toString` шага, чей `@Next` раскрыт |

Курсоры, созданные на запросе (`@Run()`-`next()`, хуки `@OnInstance`), `via` не имеют: содержимое подцепочек `@Run` проекцией не покрывается.

**`Router.routeOf(endpoint)`** — маршрут по ссылке на эндпоинт-метод, а не по паре method+path. Поиск идёт через `AomApi.checkExists` и ничего не регистрирует. Нет маршрута — `ROUTE_OF_NOT_FOUND_ERROR`; больше одного (ядро допускает: `@Get @Post` на одном методе, контроллер под двумя `@Bridge`) — `ROUTE_OF_AMBIGUOUS_ERROR` со всеми `method path` в сообщении. Для унаследованного обработчика ссылку брать через класс из дерева роутера (`ChildOrders.Create`, не `BaseOrders.Create`).

**`toJSON()`** у `Router`, `AomRoute`, `AomCursor` — один сериализатор для дампа и для сравнений: `JSON.stringify(router)` — дамп, `router.routeOf(X).toJSON()` — проекция маршрута.

- `Router` → `{version: 1, routes}`, маршруты отсортированы по `method path`;
- `AomRoute` → `{method, path, markers, steps}`; `markers` — по каждому маркеру `{accessPoints: string[]}` (только `ident` точек доступа), плюс `accessTypes` маркера, если они у него есть, и `extra` — слои точек по `ident` точки (`{ident, accessTypes}[]`), только у точек со слоями;
- `AomCursor` → `{i, step, origin, via, viaGroup?, kind?, parameters, creates, hooks}`: `step`/`origin` — `AomApi.toString` шага и точки прикрепления, `kind` — только объявленный `@CursorKind`; `parameters` — `{kind: "this", subject}`, `{kind: "state", subject?}`, `{kind: "values", source, fields?}`, `{kind: "other", name?}` или просто `{kind}`; `fields` — имена из `$.openApi` шага после `realizeDelay` (параметры по `in`, параметры пути, свойства верхнего уровня схемы тела), иначе строковый ключ декоратора; `creates` — классы, чей инстанс этот шаг создаёт первым в маршруте (свой класс, затем цели `@This`; за каждым — рекурсивно цели `@This` его конструктора, как их создаёт `AomApi.instanceWithHooks`), `hooks` — их `@OnInstance`-хуки.

```ts
// псевдокод — чтение цепочки
const route = router.routeOf(Leaf.Items);
route.toJSON().steps.map(({ i, via, step }) => `${i} ${via} ${step}`);
// ["0 class-before Guard.Check", "1 class-after Audit.Record", "2 before Filters.Where",
//  "3 endpoint Leaf.Items", "4 after Audit.Tail", "5 next Pager.Page"]
```

Выгрузка с видом и родителем шага, текст дампа и общие правила цепочки (`@aom-js/router/testing`: `parentsOf`, `sharedEndpoints`, `identCollisions`, `serializationErrors`, `constructorThisRefs`, `repeatsOf`) и граница с приложением — [Тестирование приложения](../testing.md).

### Ошибки определения

Ошибки сборки — синхронный `throw new Error(КОД)` в момент декорирования; текста нет, `message` равен коду (`packages/router/src/constants/errors.ts`). Коды не экспортируются из пакета.

| Код                                                         | Когда бросается                                                                                                                                                                                                                          | Где                                                                                                                                                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MIDDLEWARE_DEFINE_ERROR`                                   | `@Middleware()` на методе, уже помеченном nextpoint/endpoint/websocket/instance                                                                                                                                                          | `middlewares/index.ts` (`Middleware`)                                                                                                                                                 |
| `ENDPOINT_DEFINE_ERROR`                                     | эндпоинт-декоратор на методе с `isMiddleware`/`isWebsocket`                                                                                                                                                                              | `endpoints/index.ts` (`Endpoint`)                                                                                                                                                     |
| `NEXPOINT_DEFINE_ERROR`                                     | `@Nextpoint()` на middleware; `@WebSocketPoint()` на middleware/nextpoint                                                                                                                                                                | `endpoints/index.ts` (`Nextpoint`, `WebSocketPoint`)                                                                                                                                  |
| `ON_INSTANCE_DEFINE_ERROR`                                  | `@OnInstance()` на nextpoint/endpoint/websocket/middleware                                                                                                                                                                               | `middlewares/index.ts` (`OnInstance`)                                                                                                                                                 |
| `COMMON_ENDPOINT_ERROR`                                     | классовая форма `@Get(path, handler)`, где `handler` не `@Nextpoint()`                                                                                                                                                                   | `endpoints/index.ts` (`defineEndpoint`)                                                                                                                                               |
| `USE_NEXT_DEFINE_ERROR`                                     | `@Next(h)`, где `h` не `@Nextpoint()`                                                                                                                                                                                                    | `middlewares/index.ts` (`Next`)                                                                                                                                                       |
| `USE_MARKER_DEFINE_ERROR`                                   | `@UseMarker(h)`, где `h` не `@Marker()`                                                                                                                                                                                                  | `middlewares/index.ts` (`UseMarker`)                                                                                                                                                  |
| `USE_MIDDLEWARE_DEFINE_ERROR`                               | `@Before`/`@After` со ссылкой не на `@Middleware()` (иначе цепочка молча укоротилась бы)                                                                                                                                              | `middlewares/index.ts` (`checkMiddleware`, `Before`, `After`)     |
| `ROUTE_REF_DELAY_ERROR` | `RouteRef` в `@DelayRefStack` не на эндпоинт-методе — при сборке `Router`; `RouteRef` у курсора без эндпоинта в `resolveTarget` | `common/cursor.ts` (`AomCursor.realizeDelay`, `resolveTarget`) |
| `RESPONSE_EVENTS_DEFINE_ERROR` | не при декорировании, а при сборке `Router` (`OpenApi.registerPath`): `@Responses({ events })` с пустым словарём или с именем события, где есть перевод строки; после кода — `operationId` | `classes/openapi.ts` (`OpenApi.eventsItemSchema`) |
| `CURSOR_KIND_DEFINE_ERROR` | `@CursorKind(k)`, где `k` не значение `AomCursorKind` (опечатка `AomCursorKind.Colector` — это `undefined`), или второй `@CursorKind` на том же методе | `kinds/index.ts` (`CursorKind`) |
| `ROUTE_OF_NOT_FOUND_ERROR`, `ROUTE_OF_AMBIGUOUS_ERROR` | не при декорировании, а при вызове `Router.routeOf(endpoint)`: у роутера нет маршрута с этим обработчиком / их больше одного; после кода — имя эндпоинта или все `method path` | `classes/router.ts` (`Router.routeOf`) |
| `CIRCULAR_INSTANCE_ERROR`                                   | цикл создания инстансов — чужой код внутри своей же цепочки создания (`AomCursor.creating`), взаимные хуки/конструкторы двух классов, встречное ожидание двух веток (`RxContext.waits`); сообщение включает имена классов цепочки | `common/context.ts` (`circularInstanceError`, `RxContext.waitCreation`), `common/api.ts` (`AomApi.instanceWithHooks`)                       |
| `CONSTRUCTOR_TYPE_ERROR`                                    | `@This(x)`, где `x` не функция, не `FwdRef` и не `RouteRef` (в том числе `ThisRef`)                                                                                                                                                      | `arguments/index.ts` (`This`)                                                                                                                                                         |
| `ERROR_CONSTRUCTOR_ERROR`                                   | `@Err(C)`, где `C` не `Error` и не его наследник                                                                                                                                                                                         | `arguments/index.ts` (`Err`)                                                                                                                                                          |
| `PARAMETER_HANDLER_ERROR`                                   | `Args(h)`, где `h` не функция                                                                                                                                                                                                            | `arguments/index.ts` (`Args`)                                                                                                                                                         |
| `WEBSOCKET_DEFINE_ERROR`, `CONSTRUCTOR_PROPERTY_TYPE_ERROR` | объявлены, но не бросаются                                                                                                                                                                                                                    | `constants/errors.ts` (`WEBSOCKET_DEFINE_ERROR`, `CONSTRUCTOR_PROPERTY_TYPE_ERROR`)                                                                                                   |

Ошибки времени запроса возвращаются как `reject` промиса `route.apply(...)`; преобразование их в HTTP-ответ — задача `Server` из `@aom-js/api`.

## Как использует приложение

Корень сервера модуля — контроллер без методов, собранный из бриджей; `Router` строится один раз при импорте модуля и передаётся в `Server`. Роутер удобно вынести в отдельный файл, чтобы тесты брали тот же роутер, не запуская сервер:

```ts
// router.ts
@Controller()
@Bridge("/", ModuleRoot)
@Bridge("/api", OrdersRoutes)
class Index {}

export const router = new Router(Index, Docs);

// index.ts
export default new Server(settings, router, i18nizer);
```

Ресурс собирается из классового `@Before` (общая подготовка), бриджа на дочерний контроллер по ID-сегменту и эндпоинтов, каждый из которых цепляет свои `@Before` и `@Next`:

```ts
  @Get("/")
  @Before(Orders.PrepareBaseQuery)
  @Next(OrdersData.PagerData)
  @Title("Список заказов")
  static async Index() {
    //
  }
```

Бридж по ID-сегменту — ``@Bridge(`/id-${OrderIDValue}`, Order)``: шаблонная строка разворачивается в сегмент `:orderId(...)` через `toString()` ID-параметра из `@aom-js/api`. Отложенные ссылки применяются по образцу билдеров: `ThisRef` + `@DelayRefStack` подставляют `Responses` со схемой конкретного потомка или `@Next` на `Index` конкретного корневого контроллера модуля.

Если приложение фильтрует карту маршрутов по маркерам доступа (`router.routes = router.routes.filter(...)`), оно мутирует общий объект `Router`, разделяемый всеми запросами процесса.

## Зонды (`@aom-js/router/testing`)

Зонд — статический метод, который выполняется **в контексте запроса, но вне его маршрута**. Роутер разрешает ему аргументы и создаёт инстансы тем же механизмом, что и шагам маршрута, поэтому зонду видно всё, что запрос накопил: инстансы контроллеров, накопленные условия, собранные запросы. Шагом маршрута зонд не является: в `route.cursors` не входит и на сборку маршрутов не влияет. Своего механизма исполнения у компонента нет — контекст `RxContext` создаёт прогонщик внутри пакета и наружу не отдаёт. Код — `packages/router/src/testing/`.

Зонд нужен тогда и только тогда, когда проверяемое существует только во время запроса (что накопили шаги, включая хуки `@OnInstance()`); порядок шагов и маркеры читаются проекцией `router.routeOf(X).toJSON()` и дампом ([«Метаданные цепочки…»](#метаданные-цепочки-tojson-routeof-cursorkind)), а не зондом. Правила формы цепочки, одинаковые для любого приложения (один эндпоинт — один маршрут, уникальный `ident`, повторы шага, сериализация, `ThisRef` в конструкторах), — функции того же подпути без запуска маршрута: [Тестирование приложения](../testing.md#общие-правила). Зонд вызывается **из** обычного теста.

Пример — зонд проверяет, что фильтр из адреса попал в собранный запрос (`Orders*`, `CurrentUser` — классы приложения):

```ts
// orders/probes.ts (выдержка; прочие импорты опущены)
import { Probe, Observe, Report, Tester, type TesterReport } from "@aom-js/router/testing";

@Tester(Orders.Index)
export class OrdersIndexFilterProbes {
  @Probe("список заказов с ?status=: фильтр в запросе", {
    query: { status: "new" },
  })
  static async filtered(
    @Observe(OrdersQuery) { where }: OrdersQuery,
    @Observe(CurrentUser) current: CurrentUser,
    @Report() report: TesterReport,
  ) {
    report.check("фильтр по статусу", where.status === "new");
    report.check("только заказы текущего пользователя", where.userId === current.user.id);
  }
}

// probes.test.ts рядом (выдержка): частичный прогон без базы, «кто спрашивает» — preset
const list: RunOptions = { cursors: [OrdersData.PrepareQuery], preset };
const report = await runProbes(OrdersIndexFilterProbes, router, list);
```

| Имя | Смысл |
|---|---|
| `@Tester(endpoint)` / `@Tester({ match })` | привязывает класс зондов к эндпоинту ссылкой `Класс.метод` (точечная схема, `runProbes`) или к предикату маршрута `(route) => boolean` (сквозная схема, `runAcross`); агрегатор класса, брат `@Controller()` (выполняет `$._.apply()`), но контроллером класс не делает |
| `@Probe(title, input?, { route? })` | метод — зонд; `input` — частичные `HttpContextValues` поверх значений прогона; зонды с разным входом идут разными прогонами. `route` — ожидаемый исход маршрута (`RouteOutcome`): `"ok"` (по умолчанию) — без ошибки, число — ошибка с таким `status` (его несут ответы-ошибки `@aom-js/api`), `"any"` — не проверяется; иной исход — нарушение `route` у каждого такого зонда входа, ручная проверка `report.routeError` в тесте не нужна. Входы различаются по JSON, поэтому вход — только простой JSON (строки, конечные числа, `true/false`, `null`, массивы, простые объекты): функция, `undefined`, символ или инстанс класса — ошибка до прогона; ошибка маршрута одного входа (`report.routeError`) зондам другого не видна |
| `@Observe(Class)` | инстанс из `state`; в отличие от `@This` **не создаёт** — отсутствие роняет зонд («шаг не выполнялся») |
| `@Report()` | `TesterReport`: `check(name, boolean \| () => void)`, `results`, `failures`, `checks`, `routeError`, `created` — карта созданных прогоном маршрута объектов текущего входа (`{ target, by, via? }[]`, копия до зондов; только диагностика, порядок — не контракт) |
| `isTester(cls)` | класс ли это зондов — для проверки «ни один класс зондов не стоит в маршруте»; сам реестр наружу не отдаётся |
| `runProbes(tester, router, options?)` | маршрут — `router.routeOf(endpoint)`; на каждый вход — свежий `RxContext`, `preset` и отчёт кладутся в `state` до прогона, шаги — `context.run(steps)` (ошибка → `report.routeError`, зонды выполняются всё равно; исход сверяется с `route` каждого зонда), каждый зонд — отдельным `context.run` на том же контексте; бросает, если есть красные |
| `runAcross(tester, routers, { values, steps?, preset?, skip? })` | сквозной прогон класса `@Tester({ match })` на каждом маршруте роутеров, который подходит предикату: `values(route)` — значения запроса (один набор или массив — прогон на каждый), `steps(route)` — свои курсоры маршрута (по умолчанию вся цепочка), `skip` — `Map<эндпоинт, причина>`. Маршрут подошёл, а значений и причины нет — дрейф, ошибка до прогона; причина у маршрута, который класс не отбирает, — устаревшее исключение, ошибка. Каждый маршрут и вход — свой контекст: ошибка и карта созданного одного маршрута зондам другого не видны. Результаты несут `route` (`METHOD /path`), а при нескольких наборах значений у маршрута — и `set` (`#n` и `query` набора); при провале сообщение сгруппировано «зонд → проверка → маршруты» (до 20 проверок и 10 маршрутов под каждой), маршрут — с меткой набора, если она есть |
| `routesOf(tester, router \| routers)` | маршруты, которые проверяет класс зондов: маршрут эндпоинта (точечная схема) или все отобранные предикатом (сквозная) — для подсчёта покрытия; эндпоинта нет в роутере — пустой список |
| `runSteps(route, values?, steps = route.cursors)` | выбранные шаги маршрута в свежем контексте и в порядке маршрута, без записи в `route.cursors`; шаг обязан быть курсором этого маршрута; результат, ошибка и объекты запроса вызывающего (передаются как есть) — как у `route.apply()` |

Опции `runProbes`: `values` (по полям накладываются на пустые значения той же формы, что собирает сервер; заголовки прогона и зонда складываются), `cursors` (шаги ссылками; каждый разворачивается со своими `@Before/@After/@Next` той же `plain` и берётся во всех местах маршрута; классовые хуки так не подтягиваются — их называют явно), `preset` (`[Класс, инстанс][]`; `instanceWithHooks` сначала смотрит в `state`, поэтому подстановка отменяет и создание, и хуки — так частичный прогон обходится без базы).

Адрес: значения `params` подставляются в шаблон пути по `PATH_PARAM`, готовый адрес сверяется с `compilePath(route.path)` — теми же правилами, по которым сервер довёл бы запрос до маршрута. Прогоны реентерабельны: ни один не пишет в `route.cursors`.

| Сообщение | Причина |
|---|---|
| `no @Tester() — probe parameters would arrive undefined` | класс не прошёл через агрегатор |
| `@Observe(X): no instance in the request state` | маршрут не создал `X`: шаг не выполнялся, срез узкий или защита снята |
| `probe made no assertions` | ранний `return` или ветка без `check` |
| `probe returned a value` | в теле зонда `return` со значением |
| `has no @Probe() methods` | в классе нет зондов |
| `route ended with X, expected Y` | маршрут завершился не так, как объявлено в `@Probe(…, { route })`: `ok`, `status 404 (…)` или `error …` |
| `input is not plain JSON (…)` | вход `@Probe` с функцией, `undefined`, символом или инстансом класса: JSON его потеряет, и два разных входа слились бы в один прогон |
| `ROUTE_OF_NOT_FOUND_ERROR` / `ROUTE_OF_AMBIGUOUS_ERROR` | эндпоинта нет в этом роутере / его выполняют несколько маршрутов |
| `has a route predicate — run it with runAcross` / `is bound to one endpoint — run it with runProbes` | класс сквозной схемы передан в `runProbes` / точечной — в `runAcross` |
| `N matched routes have no values and no skip: …` | дрейф сквозного прогона: предикат отобрал маршрут, для которого нет ни значений (или пустой список наборов), ни причины исключения |
| `the predicate matches no route` | предикат сквозного класса не отобрал ни одного маршрута — проверять было бы нечего |
| `skip names X, which the class does not match` | устаревшее исключение сквозного прогона |
| `path parameter "x" is not set` / `the route has no path parameters x` | недостающий / лишний параметр адреса |
| `… does not match the route path` | сервер не довёл бы такой адрес до этого маршрута |
| `X is not a step of route …` / `… is not a step of this route` | в `cursors` шаг, которого маршрут не выполняет / в `runSteps` курсор другого маршрута |

Изоляция держится на направлении импорта: `@aom-js/router/testing` импортируют только файлы зондов. Карта созданных объектов: необязательное поле `RxContext.created` заводит только прогонщик; запись `{ target, by: шаг, via: внутри чьего создания }` делается рядом с `context.state.set` в `AomApi.instanceWithHooks`, у `route.apply()` поля нет; при провале сообщение печатает строку `created (input …): …` (до 20 записей на вход). Сквозная схема — один класс на много маршрутов (`@Tester({ match })` + `runAcross`); подсчёт покрытия строится на `routesOf` в приложении.

## Инварианты и подводные камни

- `@Controller()` — верхний декоратор каждого класса, у которого есть декораторы роутера; наследник контроллера тоже `@Controller()`.
- Контроллер — класс со статическими методами; `this` внутри обработчика равен классу, per-request данные живут только в инстансах из `state`.
- В `@Before`/`@After` попадают только методы с `@Middleware()`; ссылка на что-то другое — `USE_MIDDLEWARE_DEFINE_ERROR` при сборке.
- Middleware продолжает цепочку, только вернув `undefined`. Любое другое значение — ответ.
- Ключ реестра для статического метода — сама функция дескриптора (`packages/core/src/defines/core.ts` (`AomCore.instanceKey`)), поэтому после наследования у потомка другой ключ и нужна перепривязка `resolveFor`.
- Классовые `@Before` проталкиваются в бриджи, классовые `@After` — нет.
- Тег операции задаёт `@UseTag` на курсоре (middleware или эндпоинте) — методный декоратор; на классе — ошибка типов.
- Наследник, участвующий в `@This`/маршрутах, обязан сам быть `@Controller()` — без него не наследует ни FIRST/LAST-очередь родителя, ни его `@OnInstance`-хуки.
- Декоратора `Summary` не существует: `summary` операции задаёт `@Title`.

## Ограничения

- Классовый `@After` исполняется **до** эндпоинта, а не после него — следствие сборки `Router.build` (`postCursors` собираются раньше эндпоинта), см. §«Раскладка курсоров…» выше. Шаг после эндпоинта — методный `@After` или `@Next`.
- Без `@Controller()` на классе декораторы аргументов не срабатывают (аргументы `undefined`) — фаза LAST у `Args` разбирается только в `$._.apply()` из `@Controller()` (`packages/router/src/decorators/arguments/index.ts` (`Args`), `packages/router/src/decorators/controllers/index.ts` (`Controller`)). Касается и классов-целей `@This` с декорированным конструктором, и наследования: потомок без `@Controller()` не получает `@OnInstance`-хуки родителя, и `@This` на него отдаёт объект без проверки родителя. Как обходить: `@Controller()` на каждом классе иерархии.
- `@OnInstance`-хуки одного класса выполняются параллельно (`Promise.all`, `packages/router/src/common/api.ts` (`AomApi.instanceWithHooks`)), порядок не определён, отказ одного не отменяет остальные — их побочные эффекты (не связанные с отказавшей проверкой) всё равно доводятся до конца, хотя чужой код не видит инстанс до общего результата. Как обходить: один хук на класс либо явная последовательность внутри него.
- Любое не-`undefined` значение из middleware (включая `null`, `false`, `0`, `""`) прерывает цепочку и становится ответом; возвращённый `Error` эквивалентен брошенному (`packages/router/src/common/context.ts` (`RxContext.run`)). Как обходить: middleware не возвращает ничего, ошибки бросает.
- Стек `@DelayRefStack` реализуется один раз на мета-инстанс (`delayRealized`), в контексте первого курсора (`packages/router/src/common/cursor.ts` (`AomCursor.realizeDelay`)). Поэтому `RouteRef` в стеке допустим только на эндпоинте, а потомкам билдеров `@aom-js/api` нужен `@Controller()`: он даёт потомку собственную каррированную копию метода и свой узел, и стек реализуется для каждого потомка отдельно.

## Сборка и потребление

Сборка: `bun run build:router` в корне ядра (то же, что `bun --filter @aom-js/router build`). Скрипт чистит `dist/`, запускает `tsc` трижды — `tsconfig.build.json` (CommonJS → `dist/cjs`), `tsconfig.build.mjs.json` (ESM → `dist/mjs`), `tsconfig.build.types.json` (только декларации → `dist/types`) — и завершается `node ../../scripts/post-build.js`, который дописывает расширения относительным импортам и кладёт `dist/cjs/package.json`. Сам `package.json` пакета генерируется `scripts/prebuild.js`: скрипт мержит общую версию из корневого `package.json` и `package.src.json` пакета с общим `scripts/jsons/package.dist.json` (`scripts/files.js`, `scripts/prebuild.js`), поэтому `main: "./src/index.ts"` из `package.src.json` в итоговом манифесте перекрывается `main: "./dist/cjs/index.js"` из dist-манифеста. Править нужно `package.src.json` и `scripts/jsons`, а не сгенерированный `package.json`. `exports` сливаются: `"."` задаёт шаблон, `package.src.json` router добавляет `"./testing"` (`dist/{mjs,cjs,types}/testing/index.*`); `smoke.js` грузит каждую точку входа через `require()` и `import()`, алиас `@aom-js/router/testing` в `vitest.config.ts` стоит раньше корневого.

Потребитель пакета исполняет **собранный** `dist`, поэтому после правки `src` нужен `bun run build` в корне ядра. Тесты ядра, наоборот, идут по `src` через алиасы `vitest.config.ts` (блок `resolve.alias`). Полная схема сборки монорепо и dist-потребления — [Архитектура ядра](../architecture.md#как-приложение-потребляет-ядро).

## Тесты пакета

Из корня ядра: `bunx vitest run packages/router`.
