import { WebSocket } from "@aom-js/api";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { serve } from "../serve";
import { Chat } from "./chat";
import { docs, router } from "./router";
import { unread } from "./store";

let api: Awaited<ReturnType<typeof serve>>;
beforeAll(async () => (api = await serve(router)));
afterAll(() => api.stop());

// закрываем всё, что открыл тест: соединения не переживают тест и не держат сервер
const opened: Array<() => unknown> = [];
afterEach(() => opened.splice(0).forEach((close) => close()));
beforeEach(() => unread.clear());

/** Клиент WebSocket: заголовки — подпротоколом, как у браузера; `inbox` копит пришедшие сообщения. */
function connect(token?: string) {
  const protocols = token
    ? [encodeURIComponent(JSON.stringify({ authorization: `Bearer ${token}` }))]
    : [];
  const ws = new WebSocket(`${api.url.replace("http", "ws")}/chat`, protocols);
  const inbox: unknown[] = [];
  ws.on("message", (data) => inbox.push(JSON.parse(String(data))));
  opened.push(() => ws.close());
  return new Promise<{ ws: WebSocket; inbox: unknown[] }>((resolve, reject) => {
    ws.once("open", () => resolve({ ws, inbox }));
    ws.once("error", reject);
  });
}

/** Ждёт, пока в `inbox` наберётся `count` сообщений. */
const received = (inbox: unknown[], count: number) =>
  vi.waitFor(() => expect(inbox).toHaveLength(count));

/** Поток SSE: `next()` отдаёт следующий кадр без завершающей пустой строки. */
async function events(token: string) {
  const res = await fetch(`${api.url}/events`, { headers: { authorization: `Bearer ${token}` } });
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  opened.push(() => reader.cancel());
  let buffer = "";
  const next = async () => {
    while (!buffer.includes("\n\n")) buffer += (await reader.read()).value;
    const end = buffer.indexOf("\n\n");
    const frame = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    return frame;
  };
  return { res, next };
}

describe("WebSocket-точка", () => {
  it("соединение с токеном попадает в реестр под id пользователя", async () => {
    await connect("token-ann");
    expect(Chat.sockets.connections.get("ann")).toHaveLength(1);
  });

  it("без токена или с чужим токеном соединение рвётся, причина — только в журнале сервера", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(connect()).rejects.toThrow();
    await expect(connect("token-eve")).rejects.toThrow();
    expect(error.mock.calls.map(([, err]) => err.message)).toEqual([expect.any(String), "CHAT:TOKEN_INVALID"]);
    error.mockRestore();
  });

  it("сообщение с адресатом получает только он, без адресата — все, включая отправителя", async () => {
    const ann = await connect("token-ann");
    const bob = await connect("token-bob");

    ann.ws.send(JSON.stringify({ to: "bob", text: "привет" }));
    await received(bob.inbox, 1);
    expect(bob.inbox[0]).toEqual({ from: "ann", text: "привет" });

    bob.ws.send(JSON.stringify({ text: "всем" }));
    await received(bob.inbox, 2);
    await received(ann.inbox, 1);
    // адресное сообщение пришло бы Ann раньше рассылки: у неё только рассылка
    expect(ann.inbox).toEqual([{ from: "bob", text: "всем" }]);
    expect(bob.inbox[1]).toEqual({ from: "bob", text: "всем" });
  });

  it("исключение в обработчике сообщений пишется в журнал, соединение остаётся открытым", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const ann = await connect("token-ann");

    ann.ws.send("не JSON");
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith("socket message error", expect.any(SyntaxError)));
    error.mockRestore();

    ann.ws.send(JSON.stringify({ text: "ещё здесь" }));
    await received(ann.inbox, 1);
  });

  it("закрытое соединение снимается с реестра, ключ остаётся с пустым списком", async () => {
    const bob = await connect("token-bob");
    bob.ws.close();
    await vi.waitFor(() => expect(Chat.sockets.connections.get("bob")).toEqual([]));
  });
});

describe("SSE-ссылка", () => {
  it("GET /events без токена или с чужим токеном — 401 с кодом сообщения", async () => {
    expect((await fetch(`${api.url}/events`)).status).toBe(401);
    const res = await fetch(`${api.url}/events`, { headers: { authorization: "Bearer token-eve" } });
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe("CHAT:TOKEN_INVALID");
  });

  it("поток открывается комментарием и присылает события в конверте { type, [type]: значение }", async () => {
    const bob = await events("token-bob");
    expect(bob.res.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(await bob.next()).toBe(": connected");

    const ann = await connect("token-ann");
    ann.ws.send(JSON.stringify({ to: "bob", text: "раз" }));
    expect(await bob.next()).toBe('data: {"type":"unread","unread":{"total":1}}');
    ann.ws.send(JSON.stringify({ to: "bob", text: "два" }));
    expect(await bob.next()).toBe('data: {"type":"unread","unread":{"total":2}}');
  });

  it("SSE-ссылка описана в OpenAPI как поток событий, WebSocket-точки там нет", () => {
    const { paths } = docs.toJSON();
    expect(paths["/events"].get.responses["200"].content).toHaveProperty(["text/event-stream"]);
    expect(paths).not.toHaveProperty(["/chat"]);
  });
});
