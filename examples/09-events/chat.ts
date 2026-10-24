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
  if (!to) return Chat.sockets.broadcast(message);

  Chat.sockets.send(to, message);
  // адресату — ещё и событие в поток SSE: реестр доступен из любого кода процесса
  const total = (unread.get(to) ?? 0) + 1;
  unread.set(to, total);
  Events.events.send(to, "unread", { total });
}

@Controller()
export class Chat {
  static sockets = new AomWebSockets(onMessage);

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
