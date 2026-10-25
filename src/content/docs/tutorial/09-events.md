---
title: "Веб-сокеты и события"
sidebar:
  order: 9
---

Как сервер сам сообщает клиенту о событии, не дожидаясь запроса. К концу главы у сервиса две точки: WebSocket-точка `/chat` — двусторонний канал, где сервер знает, кто подключился, и шлёт сообщение одному пользователю или всем, — и SSE-ссылка `GET /events` — поток событий сервера по обычному HTTP. Всё на этой странице — файлы каталога `examples/09-events/`, тест `examples/09-events/events.test.ts` подключается к ним настоящими клиентами.

## Что выбрать

Обычно сообщение от сервера — сигнал «у тебя изменились данные»: пришло сообщение, пересчитан счётчик, сменился статус. Клиент по сигналу перечитывает нужный маршрут или обновляет одно число на экране. Поэтому в сигнале немного данных — тип события и короткое значение, а не весь документ.

- **SSE-ссылка** — когда данные идут только от сервера к клиенту. Это обычный `GET`: проходит те же проверки доступа, что любой маршрут, и попадает в OpenAPI. Клиентскому приложению хватает одной такой ссылки на все события: по HTTP/1.1 браузер держит около шести соединений на домен на все вкладки сразу.
- **WebSocket-точка** — когда клиент тоже шлёт сообщения по тому же соединению (чат, совместное редактирование) или не умеет SSE.

## Пользователи и токены

```ts title="09-events/store.ts"
export type User = { id: string };

// пользователи по токенам; в приложении здесь был бы запрос к базе
export const tokens = new Map<string, User>([
  ["token-ann", { id: "ann" }],
  ["token-bob", { id: "bob" }],
]);

/** Сколько непрочитанных сообщений у пользователя, по его id. */
export const unread = new Map<string, number>();
```

```ts title="09-events/current-user.ts"
import { AuthHeaderToken, AuthRequiredResponse } from "@aom-js/api";
import { After, Before, Controller, Middleware, Responses, This } from "@aom-js/router";

import { tokens, type User } from "./store";

@Controller()
export class CurrentUser {
  user!: User;

  /** шаг «кто спрашивает»: токен из заголовка, затем пользователь по нему */
  @Middleware()
  @Before(AuthHeaderToken.Required)
  @After(CurrentUser.Init)
  static async Required() {}

  @Middleware()
  @Responses(AuthRequiredResponse.JSONSchema())
  static async Init(@This(AuthHeaderToken) token: AuthHeaderToken, @This() self: CurrentUser) {
    const user = tokens.get(token.value);
    if (!user) throw new AuthRequiredResponse("CHAT:TOKEN_INVALID");
    self.user = user;
  }
}
```

Это шаг `CurrentUser.Required` из [главы об авторизации](08-access.md), повторённый здесь, чтобы пример был самостоятельным: `AuthHeaderToken.Required` разбирает заголовок `authorization`, `CurrentUser.Init` ищет пользователя по токену и при неудаче отвечает 401 с кодом `CHAT:TOKEN_INVALID`. Обе точки главы стоят за этим шагом — и SSE-ссылка, и WebSocket-точка.

## WebSocket-точка

```ts title="09-events/chat.ts"
import { AomWebSockets, WebSocketsController, type WebSocket } from "@aom-js/api";
import { After, Before, Controller, Middleware, This, WebSocketPoint } from "@aom-js/router";

import { CurrentUser } from "./current-user";
import { Events } from "./events";
import { unread } from "./store";

/** Сообщение клиента: `to` — id адресата; без `to` — всем. */
type Incoming = { to?: string; text: string };

function onMessage(from: string, _socket: WebSocket, data: string) {
  const { to, text } = JSON.parse(data) as Incoming;
  const message = JSON.stringify({ from, text });
  if (!to) return Chat.Sockets.broadcast(message);

  Chat.Sockets.send(to, message);
  // адресату — ещё и событие в поток SSE: реестр доступен из любого кода процесса
  const total = (unread.get(to) ?? 0) + 1;
  unread.set(to, total);
  Events.events.send(to, "unread", { total });
}

@Controller()
export class Chat {
  static Sockets = new AomWebSockets(onMessage);

  /** Ключ соединения — id текущего пользователя: под ним сокет попадёт в реестр. */
  @Middleware()
  @Before(WebSocketsController.Define)
  @After(WebSocketsController.Connect)
  static async UserID(
    @This(CurrentUser) { user }: CurrentUser,
    @This(WebSocketsController) ws: WebSocketsController,
  ) {
    ws.id = user.id;
  }

  @WebSocketPoint("/chat")
  @Before(Chat.UserID)
  static async Connect() {
    return true;
  }
}
```

Точку собирают три части:

- **реестр соединений** `static Sockets = new AomWebSockets(onMessage)` — словарь «id → открытые сокеты». Один пользователь может держать несколько соединений (вкладки, устройства), все они лежат под одним id;
- **шаг ключа** `UserID` — обычный `@Middleware()`, который выставляет `ws.id`: под этим ключом соединение попадёт в реестр. Ключ выбирает приложение — id пользователя, id комнаты чата, id документа на странице; готового шага в пакете нет;
- **сама точка** `@WebSocketPoint("/chat")` с шагом ключа в `@Before`.

Шаги идут по порядку: `WebSocketsController.Define` проверяет, что у контроллера есть реестр `Sockets`; `UserID` выставляет ключ; `WebSocketsController.Connect` завершает рукопожатие и кладёт сокет в реестр — или, если ключ пустой, рвёт соединение; последним идёт тело точки. Что тело вернуло, никуда не отправляется: к этому моменту соединение уже открыто. Проверки доступа, которые нужны до ключа, ставят классовым `@Before` контроллера точки или раздела, к которому она подключена мостом: здесь это `CurrentUser.Required` на корне (раздел «Дерево маршрутов»), поэтому `UserID` уже получает пользователя через `@This(CurrentUser)`.

**Отправка.** `Chat.Sockets.send(id, data)` пишет во все сокеты пользователя, `Chat.Sockets.broadcast(data)` — во все сокеты всех пользователей, включая отправителя. Данные уходят как есть, поэтому объект превращают в JSON сами. Неизвестный id — не ошибка: сообщение просто никому не уходит.

**Приём.** `onMessage(id, socket, data)` вызывается на каждое сообщение клиента: `id` — ключ соединения, то есть кто прислал, `data` — текст кадра строкой. Здесь клиент шлёт `{ to?, text }`: с адресатом сообщение уходит ему одному, без адресата — всем.

**Клиент.** Браузерный `WebSocket` не умеет ставить заголовки рукопожатия. Поэтому заголовки передают подпротоколом — тем же объектом, что у `fetch`, закодированным в строку; сервер разворачивает его в обычные заголовки до первого шага, и `AuthHeaderToken` читает `authorization` так же, как у обычного запроса:

```ts
// клиент в браузере
const ws = new WebSocket("ws://localhost:3000/chat", [
  encodeURIComponent(JSON.stringify({ authorization: `Bearer ${token}` })),
]);
ws.onmessage = (e) => console.log(JSON.parse(e.data)); // { from: "ann", text: "привет" }
ws.onopen = () => ws.send(JSON.stringify({ to: "bob", text: "привет" }));
```

Правила разворачивания и настройка списка извлекаемых заголовков — в справочнике [`@aom-js/api`](../packages/api.md#websocket-точки).

## SSE-ссылка

```ts title="09-events/events.ts"
import { AomServerEvents, type HttpCtx } from "@aom-js/api";
import { Controller, Ctx, Get, Responses, This, Title } from "@aom-js/router";
import { ComponentSchema, PropertySchema } from "@aom-js/schemer";

import { CurrentUser } from "./current-user";

/** Значение события `unread`: сколько непрочитанных сообщений у пользователя. */
@ComponentSchema()
export class UnreadEvent {
  @PropertySchema.Number({ description: "Непрочитанных сообщений" })
  total!: number;
}

@Controller()
export class Events {
  // словарь «тип события → класс значения»: по нему проверяется отправка и строится OpenAPI
  static events = new AomServerEvents({ unread: UnreadEvent });

  @Get("/events")
  @Title("Поток событий")
  @Responses(Events.events.JSONSchema("Событие из словаря"))
  static Connect(@This(CurrentUser) { user }: CurrentUser, @Ctx() { res }: HttpCtx) {
    return this.events.connect(user.id, res);
  }
}
```

`AomServerEvents` — реестр потоков, тоже по id. Его словарь `{ unread: UnreadEvent }` связывает тип события с классом значения: по нему `send` проверяет, что значение подходит типу, и по нему же `@Responses(Events.events.JSONSchema(...))` описывает поток в OpenAPI — документ и отправка не расходятся.

`connect(id, res)` ставит заголовки потока (`Content-Type: text/event-stream`), регистрирует поток под `id` и возвращает его — сервер передаёт его клиенту как тело ответа. Первым кадром идёт комментарий `: connected`, чтобы клиент сразу увидел открытие; дальше каждые 25 секунд — комментарий `: ping`, чтобы прокси не оборвал молчащее соединение. Когда клиент уходит, поток снимается с реестра сам.

Без токена или с чужим токеном до обработчика дело не доходит: `CurrentUser.Required` отвечает обычным `401`, поток не открывается.

**Конверт.** Каждое событие приходит в одном виде — `{ type, [type]: значение }`. В нашем примере письмо Бобу рождает такой кадр:

```text
data: {"type":"unread","unread":{"total":1}}
```

Клиент для любого события делает одно и то же: читает `type` и берёт значение `event[event.type]`. Отправитель конверт не собирает — он передаёт тип и значение, `Events.events.send(to, "unread", { total })`, остальное делает реестр. Отправить можно из любого кода процесса: здесь — из обработчика сообщений сокета.

**Проверка значения.** Вне production (по умолчанию) реестр проверяет значение по его классу и отсекает поля, которых в классе нет; значение не по классу — исключение у отправителя, кадр не уходит. В production проверка выключена, если не включить её явно: `new AomServerEvents(schemas, { validate: true })`.

**Клиент.** Браузерный `EventSource` заголовков не ставит, поэтому токен передать не сможет. Нужен fetch-клиент SSE, который принимает заголовки (например, `@microsoft/fetch-event-source`), или ручное чтение тела `fetch`, как в тесте главы:

```ts
// клиент: одно правило на все события
fetchEventSource("http://localhost:3000/events", {
  headers: { authorization: `Bearer ${token}` },
  onmessage: (e) => {
    const event = JSON.parse(e.data); // { type, [type]: значение }
    handle(event.type, event[event.type]);
  },
});
```

Подробности кадра, `retry`, `heartbeat` и описание в OpenAPI — в справочнике [`@aom-js/api`](../packages/api.md#sse-ссылки).

## Дерево маршрутов

```ts title="09-events/router.ts"
import { Before, Bridge, Controller, OpenApi, Router } from "@aom-js/router";

import { Chat } from "./chat";
import { CurrentUser } from "./current-user";
import { Events } from "./events";

export const docs = new OpenApi({ title: "Events API", version: "1.0.0" });

/** обе точки — только для вошедших: классовый `@Before` наследуют все мосты */
@Controller()
@Before(CurrentUser.Required)
@Bridge("/", Chat)
@Bridge("/", Events)
class Index {}

export const router = new Router(Index, docs);
```

Обе точки подключаются мостами, как любой контроллер. Роутер собирает WebSocket-точки отдельным списком: сервер сопоставляет с ним запросы на открытие сокета, а в документ OpenAPI они не попадают. SSE-ссылка — обычный `GET` и в документе есть.

## Несколько экземпляров сервиса

Соединения и потоки живут в памяти процесса: `send` и `broadcast` достают только клиентов того экземпляра, где их вызвали. Пока экземпляр один, этого достаточно. Когда их несколько, клиент Боба может быть подключён к соседнему — и сигнал из этого процесса до него не дойдёт.

Поэтому сигнал в таком сервисе рассылают через шину сообщений: код, где случилось событие, публикует его в шину, каждый экземпляр получает публикацию и вызывает `send`/`broadcast` для своих клиентов. Получать должен именно каждый экземпляр — не очередь, где сообщение берёт кто-то один. В `@aom-js/*` это делает изолятор шины — класс, метод которого публикует сообщение в шину, а исполнители в каждом процессе его принимают: [рецепт](../cookbook/isolators.md) и справочник [`@aom-js/transfer`](../packages/transfer.md).

## Проверка

Тест `examples/09-events/events.test.ts` подключает к сервису клиент `WebSocket` (реэкспорт из `@aom-js/api`, заголовки — подпротоколом, как у браузера) и читает поток SSE через `fetch`:

- WebSocket-точка: «соединение с токеном попадает в реестр под id пользователя», «без токена или с чужим токеном соединение рвётся, причина — только в журнале сервера», «сообщение с адресатом получает только он, без адресата — все, включая отправителя», «исключение в обработчике сообщений пишется в журнал, соединение остаётся открытым», «закрытое соединение снимается с реестра, ключ остаётся с пустым списком»;
- SSE-ссылка: «GET /events без токена или с чужим токеном — 401 с кодом сообщения», «поток открывается комментарием и присылает события в конверте { type, [type]: значение }», «SSE-ссылка описана в OpenAPI как поток событий, WebSocket-точки там нет».

После каждого теста клиенты закрываются: открытое соединение иначе пережило бы тест и держало сервер.

## Подводные камни

- **Реестр в `onMessage` — по имени класса.** Ядро вызывает обработчик без `this`, поэтому пишите `Chat.Sockets`, а не `this.Sockets`, даже если обработчик — статический метод контроллера.
- **Исключение в `onMessage` не видно клиенту.** Битый JSON или ошибка обработчика пишется в журнал сервера (`console.error`), соединение остаётся открытым, но ответа клиент не получит. Входящие данные проверяйте сами и отвечайте клиенту сообщением об ошибке, если это важно.
- **Отказ без ответа.** Если любой шаг до точки бросил исключение или ключ пустой, сервер просто рвёт соединение: HTTP-статуса и текста ошибки клиент не получает, видит только обрыв. Причину (здесь — `CHAT:TOKEN_INVALID`) ищут в журнале сервера. SSE-ссылка, наоборот, отказывает обычным ответом (`401`, `403`).
- **Пустой ключ остаётся в реестре сокетов.** Когда пользователь закрыл последнее соединение, под его id в `Chat.Sockets.connections` остаётся пустой массив. «Подключён ли пользователь» проверяют по длине списка, а не по `has(id)`.
- **Права проверяются при подключении.** Если доступ пользователя отозван, закройте его соединения сами — иначе он будет получать сообщения до переподключения.
- **Скобки в подпротоколе.** `encodeURIComponent` не кодирует `(` и `)`, а в подпротоколе они запрещены — не кладите в заголовки для сокета значения со скобками.

Дальше — [общий раздел для разных ресурсов](10-shared-routes.md): маршруты один раз в базовом классе, у наследников — только свои шаги.
