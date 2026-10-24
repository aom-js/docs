import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BaseRootController, Server } from "@aom-js/api";
import { Bridge, Controller, Router } from "@aom-js/router";

import { serve } from "../serve";
import { Hello } from "./hello";
import { docs } from "./root";
import { router } from "./router";

describe("первый сервис", () => {
  let api: Awaited<ReturnType<typeof serve>>;
  beforeAll(async () => (api = await serve(router)));
  afterAll(() => api.stop());

  it("GET /api/hello отвечает JSON, имя берёт из строки запроса", async () => {
    expect(await (await fetch(`${api.url}/api/hello`)).json()).toEqual({ hello: "world" });
    expect(await (await fetch(`${api.url}/api/hello?name=aom`)).json()).toEqual({ hello: "aom" });
  });

  it("корень модуля перечисляет маршруты", async () => {
    const res = await (await fetch(`${api.url}/`)).json();
    expect(res.ident).toBe("greetings");
    expect(res.routes.map((r: { path: string }) => r.path)).toContain("/api/hello");
  });

  it("документ OpenAPI описывает маршрут с его заголовком", async () => {
    const doc = await (await fetch(`${api.url}/openapi.json`)).json();
    expect(doc.info.title).toBe("Greetings API");
    expect(doc.paths["/api/hello"].get.summary).toBe("Приветствие");
  });
});

describe("подводные камни первого сервиса", () => {
  it("путь из url сервер приписывает к пути запроса: маршруты без него не находятся", async () => {
    const server = new Server({ port: 0, url: "http://localhost/v1" }, router);
    if (!server.server.listening) await once(server.server, "listening");
    const { port } = server.server.address() as AddressInfo;
    try {
      expect((await fetch(`http://localhost:${port}/api/hello`)).status).toBe(404);
      expect((await fetch(`http://localhost:${port}/v1/api/hello`)).status).toBe(404);
    } finally {
      await server.stop();
    }
  });

  it("корень без RoutesStructure падает при сборке роутера", () => {
    @Controller()
    class BareRoot extends BaseRootController {
      readonly ident = "bare";
      readonly docs = docs;
      markersToRoute() {}
    }

    @Controller()
    @Bridge("/", BareRoot)
    @Bridge("/api", Hello)
    class Index {}

    expect(() => new Router(Index, docs)).toThrow(/JSONSchema/);
  });
});
