import { readdirSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Bridge, Before, Controller, FwdRef, Get, Middleware, OpenApi, Router, This } from "@aom-js/router";

import { serve } from "../serve";
import { router } from "./references/api/router";

describe("структура: модуль справочников", () => {
  let api: Awaited<ReturnType<typeof serve>>;
  beforeAll(async () => (api = await serve(router)));
  afterAll(() => api.stop());

  const get = async (path: string) => {
    const res = await fetch(`${api.url}${path}`);
    return { status: res.status, body: await res.json() };
  };

  it("корень модуля перечисляет маршруты обоих ресурсов", async () => {
    const { body } = await get("/");
    expect(body.ident).toBe("references");
    expect(body.routes.map((r: { path: string }) => r.path).sort()).toEqual([
      "/",
      "/api/cities",
      "/api/cities/:cityId([0-9]{1,12})",
      "/api/countries",
      "/api/countries/:countryId([0-9]{1,12})",
      "/api/countries/:countryId([0-9]{1,12})/cities",
      "/openapi.json",
      "/swagger.html",
    ]);
  });

  it("город отдаётся вместе со своей страной", async () => {
    expect(await get("/api/cities/3")).toEqual({
      status: 200,
      body: { id: 3, name: "Тбилиси", countryId: 2, country: { id: 2, name: "Грузия" } },
    });
  });

  it("страна перечисляет свои города", async () => {
    const { status, body } = await get("/api/countries/1/cities");
    expect(status).toBe(200);
    expect(body.map((c: { name: string }) => c.name)).toEqual(["Ереван", "Гюмри"]);
  });

  it("нет записи — 404 от шага загрузки, id не числом — 404 от роутера", async () => {
    expect(await get("/api/countries/9")).toEqual({
      status: 404,
      body: { status: 404, message: "REFERENCES:COUNTRY_NOT_FOUND" },
    });
    expect((await get("/api/cities/9")).body.message).toBe("REFERENCES:CITY_NOT_FOUND");
    expect((await get("/api/countries/abc")).status).toBe(404);
  });
});

describe("структура: тест раскладки", () => {
  // контроллер с маршрутами — класс, хотя бы один метод которого роутер находит как обработчик
  const routeOwner = (value: unknown) =>
    typeof value === "function" &&
    Object.getOwnPropertyNames(value).some((key) => {
      const method = (value as unknown as Record<string, unknown>)[key];
      if (typeof method !== "function") return false;
      try {
        return Boolean(router.routeOf(method));
      } catch (error) {
        // обработчик под двумя мостами — тоже обработчик
        return String(error).includes("ROUTE_OF_AMBIGUOUS_ERROR");
      }
    });

  // файлы обходятся через node:fs и import(): тест не зависит от возможностей сборщика
  const ROUTES = join(dirname(fileURLToPath(import.meta.url)), "references/api/routes");
  const files = readdirSync(ROUTES, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".ts"))
    .sort();

  it("вне init/ — только index.ts и контроллеры с маршрутами", async () => {
    expect(files).toContain(join("countries", "routes.ts"));
    const misplaced: string[] = [];
    for (const path of files) {
      if (path.split(sep).includes("init") || basename(path) === "index.ts") continue;
      const exports: Record<string, unknown> = await import(join(ROUTES, path));
      for (const [name, value] of Object.entries(exports)) {
        if (!routeOwner(value)) misplaced.push(`${path}: ${name}`);
      }
    }
    expect(misplaced).toEqual([]);
  });

  it("тест отличает контроллер с маршрутами от служебного класса", async () => {
    const { Country } = await import("./references/api/routes/countries/routes");
    const { CountryValue } = await import("./references/api/routes/countries/init/value");
    expect(routeOwner(Country)).toBe(true);
    expect(routeOwner(CountryValue)).toBe(false);
  });

  it("адреса маршрутов без undefined", () => {
    expect(router.routes.filter(({ path }) => path.includes("undefined"))).toEqual([]);
  });
});

describe("структура: циклы", () => {
  const docs = () => new OpenApi({ title: "cycles", version: "1.0.0" });

  it("цикл импортов молча даёт undefined в адресе", async () => {
    const { Countries } = await import("./cycle/countries");
    const paths = new Router(Countries, docs()).routes.map(({ path }) => path);
    expect(paths).toContain("/cities/undefined");
  });

  it("@Bridge на класс, объявленный ниже, падает при объявлении", () => {
    expect(() => {
      @Controller()
      // @ts-expect-error TypeScript и сам видит класс до объявления
      @Bridge("/item", Item)
      class List {}

      @Controller()
      class Item {}
    }).toThrow(ReferenceError);
  });

  it("FwdRef в @Before разворачивается при объявлении: класс ниже ещё недоступен", () => {
    expect(() => {
      @Controller()
      class List {
        @Get("/")
        @Before(FwdRef(() => Guard.Check))
        static async Index() {}
      }

      @Controller()
      class Guard {
        @Middleware()
        static async Check() {}
      }
    }).toThrow(ReferenceError);
  });

  it("FwdRef в @This разрешается на запросе: класс ниже уже есть", async () => {
    @Controller()
    class List {
      @Get("/")
      // тип параметра — не сам класс: метаданные типа обратились бы к нему при объявлении
      static async Index(@This(FwdRef(() => Later)) later: { ready: boolean }) {
        return { ready: later.ready };
      }
    }

    @Controller()
    class Later {
      ready = true;
    }

    const local = await serve(new Router(List, docs()));
    expect(await (await fetch(`${local.url}/`)).json()).toEqual({ ready: true });
    await local.stop();
  });

  it("тип параметра классом ниже падает при объявлении даже с FwdRef", () => {
    expect(() => {
      @Controller()
      class List {
        @Get("/")
        static async Index(@This(FwdRef(() => Later)) later: Later) {
          return later;
        }
      }

      @Controller()
      class Later {}
    }).toThrow(ReferenceError);
  });
});
