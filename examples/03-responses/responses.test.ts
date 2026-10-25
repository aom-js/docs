import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { ErrorMessage, MessageResponse, NotFoundResponse, type Server } from "@aom-js/api";
import { Controller, Get, OpenApi, Responses, Router } from "@aom-js/router";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { serve } from "../serve";
import { i18nizer } from "./i18n";
import * as messages from "./messages";
import { router } from "./router";
import { reset } from "./store";

const post = (url: string, init: RequestInit = {}) => fetch(url, { method: "POST", ...init });

describe("ответы и ошибки", () => {
  let api: Awaited<ReturnType<typeof serve>>;
  beforeAll(async () => (api = await serve(router)));
  afterAll(() => api.stop());
  beforeEach(reset);

  it("карточка отвечает данными книги", async () => {
    const res = await fetch(`${api.url}/api/books/1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: 1,
      title: "Мастер и Маргарита",
      onLoan: false,
      archived: false,
    });
  });

  it("нет книги — 404 с кодом сообщения в message", async () => {
    const res = await fetch(`${api.url}/api/books/9`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: messages.BOOK_NOT_FOUND, status: 404 });
  });

  it("книга уже выдана — 409 с подробностями в data", async () => {
    const res = await post(`${api.url}/api/books/2/loan`);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ message: messages.BOOK_ON_LOAN, status: 409, data: { id: 2 } });
  });

  it("своя ошибка-наследник отвечает своим статусом 410", async () => {
    const res = await post(`${api.url}/api/books/3/loan`);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ message: messages.BOOK_ARCHIVED, status: 410 });
  });

  it("успешная выдача отвечает MessageResponse, повторная — 409", async () => {
    const res = await post(`${api.url}/api/books/1/loan`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: messages.LOAN_CREATED });
    expect((await post(`${api.url}/api/books/1/loan`)).status).toBe(409);
  });

  it("без I18nizer клиент получает коды, а не тексты", async () => {
    const res = await fetch(`${api.url}/api/books/9?locale=en`);
    expect((await res.json()).message).toBe(messages.BOOK_NOT_FOUND);
  });

  it("документ OpenAPI описывает ответы маршрута по статусам", async () => {
    const doc = await (await fetch(`${api.url}/openapi.json`)).json();
    const { responses, parameters } = doc.paths["/api/books/{bookId}/loan"].post;
    expect(parameters).toMatchObject([{ name: "bookId", in: "path", required: true }]);
    const ref = (status: string) => responses[status].content["application/json"].schema.$ref;
    expect(Object.keys(responses)).toEqual(["200", "404", "409", "410"]);
    expect(ref("200")).toBe("#/components/schemas/MessageResponse");
    expect(ref("404")).toBe("#/components/schemas/NotFoundResponse");
    expect(ref("409")).toBe("#/components/schemas/ConflictResponse");
    expect(ref("410")).toBe("#/components/schemas/BookArchivedResponse");
    expect(responses["409"].description).toBe(messages.BOOK_ON_LOAN);
    // описание по умолчанию у ошибки — её `static description`
    expect(responses["410"].description).toBe(messages.BOOK_ARCHIVED);

    // 404 описан у шага BookValue.Init — и попадает в каждый маршрут карточки
    expect(Object.keys(doc.paths["/api/books/{bookId}"].get.responses)).toEqual(["200", "404"]);
    const card = doc.paths["/api/books/{bookId}"].get.responses["200"];
    expect(card.description).toBe("Книга");
    expect(card.content["application/json"].schema.$ref).toBe("#/components/schemas/BookResponse");
    expect(Object.keys(doc.components.schemas.BookResponse.properties)).toEqual([
      "id",
      "title",
      "onLoan",
      "archived",
    ]);
  });

  it("успешный ответ без аргументов JSONSchema берёт статус и описание своего класса", () => {
    class Created extends MessageResponse {
      static status = 201;
      static description = "Создано";
    }
    expect(MessageResponse.JSONSchema()).toMatchObject({ status: 200, description: MessageResponse.description });
    expect(Created.JSONSchema()).toMatchObject({ status: 201, description: "Создано" });
    expect(Created.JSONSchema("Принято", 202)).toMatchObject({ status: 202, description: "Принято" });
  });

  it("два ответа с одним статусом — в документе остаётся последний", () => {
    @Controller()
    class Twice {
      @Get("/twice")
      @Responses(NotFoundResponse.JSONSchema("первый"), NotFoundResponse.JSONSchema("второй"))
      static async Index() {}
    }
    const docs = new OpenApi({ title: "t", version: "1" });
    new Router(Twice, docs);
    expect(docs.toJSON().paths["/twice"].get.responses["404"].description).toBe("второй");
  });

  it("обычный Error уходит клиенту как 500 без своего текста", async () => {
    @Controller()
    class Broken {
      @Get("/broken")
      static async Index() {
        throw new Error("Книга не найдена");
      }
    }
    const broken = await serve(new Router(Broken, new OpenApi({ title: "t", version: "1" })));
    const res = await fetch(`${broken.url}/broken`);
    await broken.stop();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ message: "AOM_API:SERVER_ERROR", status: 500 });
  });

  it("класс ошибки без @ComponentSchema роняет сборку роутера", () => {
    class TeapotResponse extends ErrorMessage {
      static status = 418;
    }
    @Controller()
    class Teapot {
      @Get("/tea")
      @Responses(TeapotResponse.JSONSchema())
      static async Index() {}
    }
    expect(() => new Router(Teapot, new OpenApi({ title: "t", version: "1" }))).toThrow(
      /"TeapotResponse" is not a ComponentSchema class/,
    );
  });

  it("data в схеме ошибки необязательное: в теле без подробностей его нет", async () => {
    const doc = await (await fetch(`${api.url}/openapi.json`)).json();
    expect(doc.components.schemas.NotFoundResponse.required).not.toContain("data");
    const body = await (await fetch(`${api.url}/api/books/9`)).json();
    expect(body).not.toHaveProperty("data");
  });
});

describe("тексты на языке запроса", () => {
  let server: Server;
  let url: string;
  const port = process.env.API_PORT;
  beforeAll(async () => {
    // проверяем сам server.ts: он читает порт из окружения при импорте, 0 — любой свободный
    process.env.API_PORT = "0";
    server = (await import("./server")).default;
    if (!server.server.listening) await once(server.server, "listening");
    url = `http://localhost:${(server.server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await server.stop();
    if (port === undefined) delete process.env.API_PORT;
    else process.env.API_PORT = port;
  });
  beforeEach(reset);

  const message = async (res: Promise<Response>) => (await (await res).json()).message;

  it("без указания языка — русский текст", async () => {
    expect(await message(fetch(`${url}/api/books/9`))).toBe("Книга не найдена");
  });

  it("язык берётся из ?locale= или из заголовка x-locale", async () => {
    expect(await message(fetch(`${url}/api/books/9?locale=en`))).toBe("Book not found");
    expect(await message(post(`${url}/api/books/2/loan`, { headers: { "x-locale": "en" } }))).toBe(
      "Book is already on loan",
    );
    expect(await message(post(`${url}/api/books/1/loan?locale=en`))).toBe("Book loaned");
  });

  it("?locale= важнее заголовка x-locale", async () => {
    const res = fetch(`${url}/api/books/9?locale=en`, { headers: { "x-locale": "ru" } });
    expect(await message(res)).toBe("Book not found");
  });

  it("значение заголовка сравнивается целиком: en-US — это язык по умолчанию", async () => {
    const res = fetch(`${url}/api/books/9`, { headers: { "x-locale": "en-US" } });
    expect(await message(res)).toBe("Книга не найдена");
  });

  it("документ OpenAPI тоже переводится, вместе с текстами ядра", async () => {
    const doc = await (await fetch(`${url}/openapi.json?locale=en`)).json();
    expect(doc.paths["/api/books/{bookId}/loan"].post.responses["404"].description).toBe("Book not found");
    expect(doc.components.schemas.NotFoundResponse.properties.message.description).toBe("Error text");
  });

  it("адрес без маршрута тоже отвечает текстом на языке запроса", async () => {
    const res = await fetch(`${url}/nope?locale=en`);
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe("Path not found");
  });

  it("код заменяется в любом месте ответа, и в данных тоже", () => {
    const json = JSON.stringify({ title: messages.BOOK_NOT_FOUND });
    expect(i18nizer.localize(json, "en")).toBe('{"title":"Book not found"}');
  });
});
