import { Before, Bridge, Controller, Get, Middleware, OpenApi, Router, This } from "@aom-js/router";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { serve } from "../serve";
import { CountryID } from "./params";
import { docs, router } from "./router";
import { resetStore } from "./store";
import { TranslationsBase } from "./translations";
import { CountryValue } from "./values";

type Api = Awaited<ReturnType<typeof serve>>;
const caller = (api: () => Api) => async (method: string, path: string, body?: unknown) => {
  const res = await fetch(`${api().url}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
};

describe("общий раздел для разных ресурсов", () => {
  let api: Api;
  beforeAll(async () => (api = await serve(router)));
  afterAll(() => api.stop());
  beforeEach(resetStore);
  const call = caller(() => api);

  it("у страны и у города один и тот же раздел переводов: список и добавление", async () => {
    expect(await call("GET", "/countries/1/translations")).toEqual({
      status: 200,
      json: [{ locale: "en", name: "France" }],
    });
    expect((await call("POST", "/countries/1/translations", { locale: "de", name: "Frankreich" })).status).toBe(200);
    expect((await call("GET", "/countries/1/translations")).json).toHaveLength(2);

    expect((await call("POST", "/countries/1/cities/1/translations", { locale: "de", name: "Paris" })).status).toBe(200);
    expect((await call("GET", "/countries/1/cities/1/translations")).json).toEqual([
      { locale: "en", name: "Paris" },
      { locale: "de", name: "Paris" },
    ]);
  });

  it("общий обработчик: второй перевод на тот же язык — 409 у обоих ресурсов", async () => {
    for (const path of ["/countries/1/translations", "/countries/1/cities/1/translations"]) {
      expect(await call("POST", path, { locale: "en", name: "Other" })).toEqual({
        status: 409,
        json: { status: 409, message: "REFERENCES:TRANSLATION_EXISTS" },
      });
    }
  });

  it("проверка наследника: архивной стране перевод не добавить — 409 раньше проверки тела", async () => {
    expect(await call("POST", "/countries/2/translations", { locale: "x" })).toEqual({
      status: 409,
      json: { status: 409, message: "REFERENCES:COUNTRY_ARCHIVED" },
    });
    expect((await call("GET", "/countries/2/translations")).json).toEqual([]);
  });

  it("проверка своя у каждого наследника: город архивной страны переводится", async () => {
    const added = await call("POST", "/countries/2/cities/2/translations", { locale: "el", name: "Κωνσταντινούπολη" });
    expect(added.status).toBe(200);
  });

  it("установочный шаг наследника: чужой город и несуществующая страна — 404", async () => {
    expect((await call("GET", "/countries/1/cities/2/translations")).json.message).toBe("REFERENCES:CITY_NOT_FOUND");
    expect((await call("GET", "/countries/9/translations")).json.message).toBe("REFERENCES:COUNTRY_NOT_FOUND");
  });

  it("тело не по схеме — 400, перевод не добавляется", async () => {
    expect((await call("POST", "/countries/1/translations", { locale: "fr" })).status).toBe(400);
    expect((await call("GET", "/countries/1/translations")).json).toHaveLength(1);
  });

  it("документ: у обоих разделов одни и те же операции и ответы", () => {
    const { paths } = docs.toJSON() as any;
    for (const path of ["/countries/{countryId}/translations", "/countries/{countryId}/cities/{cityId}/translations"]) {
      expect(Object.keys(paths[path]).sort()).toEqual(["get", "post"]);
      expect(Object.keys(paths[path].post.responses)).toEqual(expect.arrayContaining(["400", "404", "409"]));
    }
  });
});

describe("подводные камни", () => {
  // наследник перегрузил Setup, а Writable забыл
  @Controller()
  class Forgetful extends TranslationsBase {
    @Middleware()
    static async Setup(@This() self: Forgetful, @This(CountryValue) { value }: CountryValue) {
      self.owner = value;
    }
  }

  // база берёт объект через @This(Base), а не через @This()
  @Controller()
  class Base {
    owner?: object;

    @Middleware()
    static async Setup(@This() self: unknown, ..._: never[]) {
      throw new Error(`${(self as object).constructor.name}: шаг Setup должен быть перегружен`);
    }

    @Get("/")
    @Before(Base.Setup)
    static async Index(@This(Base) { owner }: Base) {
      return { owner: owner ?? null };
    }
  }

  @Controller()
  class Heir extends Base {
    @Middleware()
    static async Setup(@This() self: Heir) {
      self.owner = { id: 1 };
    }
  }

  @Controller()
  @Before(CountryValue.Init)
  @Bridge("/forgetful", Forgetful)
  @Bridge("/heir", Heir)
  class Country {}

  @Controller()
  @Bridge(`/${CountryID}`, Country)
  class Root {}

  let api: Api;
  beforeAll(async () => (api = await serve(new Router(Root, new OpenApi({ title: "x", version: "1" })))));
  afterAll(() => api.stop());
  beforeEach(resetStore);
  const call = caller(() => api);

  it("забытая пустышка: маршруты без неё работают, маршрут с ней — 500", async () => {
    expect((await call("GET", "/1/forgetful")).status).toBe(200);
    expect((await call("POST", "/1/forgetful", { locale: "de", name: "Frankreich" })).status).toBe(500);
  });

  it("@This(Base) в шаге базы — отдельный объект: записи наследника он не видит", async () => {
    expect(await call("GET", "/1/heir")).toEqual({ status: 200, json: { owner: null } });
  });
});
