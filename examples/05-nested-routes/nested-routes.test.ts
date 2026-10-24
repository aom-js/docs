import { After, Before, Bridge, Controller, Get, MergeNextTags, Middleware, OpenApi, Router, This, Title, UseTag } from "@aom-js/router";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { serve } from "../serve";
import { Cities } from "./cities";
import { journal } from "./log";
import { CountryID } from "./params";
import { docs, router } from "./router";
import { reads } from "./store";
import { CountryValue } from "./values";

type Api = Awaited<ReturnType<typeof serve>>;
const getter = (api: () => Api) => async (path: string) => {
  const res = await fetch(`${api().url}${path}`);
  return { status: res.status, body: await res.json() };
};

describe("вложенные маршруты", () => {
  let api: Api;
  beforeAll(async () => (api = await serve(router)));
  afterAll(() => api.stop());
  beforeEach(() => {
    reads.countries = 0;
    journal.length = 0;
  });
  const get = getter(() => api);
  // итог запроса пишется по событию `finish` ответа — оно может прийти чуть позже, чем клиент прочёл тело
  const closed = (n: number) => vi.waitFor(() => expect(journal.filter((e) => e.status)).toHaveLength(n));

  it("страна, её города и город страны доступны по вложенным путям", async () => {
    expect(await get("/countries/1")).toEqual({ status: 200, body: { id: 1, name: "Франция" } });
    expect((await get("/countries/1/cities")).body.map((c: { name: string }) => c.name)).toEqual([
      "Париж",
      "Лион",
    ]);
    expect(await get("/countries/1/cities/2")).toEqual({
      status: 200,
      body: { id: 2, countryId: 1, name: "Лион", country: "Франция" },
    });
  });

  it("нет страны — 404 и у неё, и у всех её дочерних маршрутов", async () => {
    for (const path of ["/countries/9", "/countries/9/cities", "/countries/9/cities/1"]) {
      expect(await get(path)).toEqual({
        status: 404,
        body: { status: 404, message: "REFERENCES:COUNTRY_NOT_FOUND" },
      });
    }
  });

  it("город чужой страны — 404, как несуществующий", async () => {
    // Токио есть, но он не во Франции
    expect(await get("/countries/1/cities/3")).toEqual({
      status: 404,
      body: { status: 404, message: "REFERENCES:CITY_NOT_FOUND" },
    });
    expect((await get("/countries/2/cities/3")).status).toBe(200);
  });

  it("страна читается один раз за запрос, даже когда её берут несколько шагов", async () => {
    await get("/countries/1/cities/2");
    expect(reads.countries).toBe(1);
  });

  it("журнал пишет метод, шаблон пути, статус и длительность каждого запроса", async () => {
    await get("/countries/1/cities/2");
    await closed(1);
    await get("/countries/1/cities/3");
    await closed(2);
    const path = "/countries/:countryId([0-9]{1,12})/cities/:cityId([0-9]{1,12})";
    expect(journal).toEqual([
      expect.objectContaining({ message: "Logger initiated:", method: "get", path }),
      expect.objectContaining({ message: "Request success:", path, status: 200, duration: expect.any(Number) }),
      expect.objectContaining({ message: "Logger initiated:", path }),
      expect.objectContaining({ message: "Request rejected:", path, status: 404 }),
    ]);
  });

  it("запрос мимо маршрутов — 404 без записи в журнале", async () => {
    // `abc` не подходит под шаблон `[0-9]{1,12}`: маршрут не найден, его шаги не выполняются
    expect((await get("/countries/abc")).status).toBe(404);
    // следующий запрос идёт после ответа на первый: в журнале — только его записи
    await get("/countries");
    await closed(1);
    expect(journal.map((e) => e.path)).toEqual(["/countries", "/countries"]);
  });

  it("документ: параметры пути по родителю и потомку, тег потомка дописан к тегу родителя", () => {
    const { paths } = docs.toJSON() as any;
    const op = paths["/countries/{countryId}/cities/{cityId}"].get;
    expect(op.parameters.map((p: { name: string }) => p.name)).toEqual(["countryId", "cityId"]);
    expect(op.tags).toEqual(["Страны > Города"]);
    expect(paths["/countries/{countryId}"].get.tags).toEqual(["Страны"]);
  });
});

describe("подводные камни", () => {
  // повтор шага родителя: CountryValue.Init уже стоит у Parent
  @Controller()
  @Before(CountryValue.Init)
  class Twice {
    @Get("/")
    static async Index() {
      return { ok: true };
    }
  }

  @Controller()
  @Before(CountryValue.Init)
  @Bridge("/twice", Twice)
  class Parent {}

  // классовый @After вместо @Before: в мост /cities он не уходит
  @Controller()
  @After(CountryValue.Init)
  @Bridge("/cities", Cities)
  class AfterParent {
    @Get("/")
    static async Index(@This(CountryValue) { value }: CountryValue) {
      return value;
    }
  }

  @Controller()
  @Bridge("/before", Parent)
  @Bridge("/after", AfterParent)
  class Mistakes {}

  @Controller()
  @Bridge(`/${CountryID}`, Mistakes)
  class Root {}

  let api: Api;
  beforeAll(async () => (api = await serve(new Router(Root, new OpenApi({ title: "x", version: "1" })))));
  afterAll(() => api.stop());
  beforeEach(() => (reads.countries = 0));
  const get = getter(() => api);

  it("классовый @After у родителя: сам маршрут работает, у дочерних — 500", async () => {
    expect(await get("/1/after")).toEqual({ status: 200, body: { id: 1, name: "Франция" } });
    expect((await get("/1/after/cities")).status).toBe(500);
  });

  it("шаг родителя, повторённый у потомка, выполняется дважды", async () => {
    await get("/1/before/twice");
    expect(reads.countries).toBe(2);
  });

  it("теги: без @MergeNextTags тег заменяет предыдущий, после него дописываются и следующие", () => {
    @Controller()
    @Title("Раздел")
    class Section {
      @Middleware()
      @UseTag(Section)
      static async Tag() {}
    }

    @Controller()
    @Title("Подраздел")
    class Sub {
      @Middleware()
      @UseTag(Sub)
      static async Tag() {}

      @Middleware()
      @UseTag(Sub)
      @MergeNextTags()
      static async Merge() {}
    }

    @Controller()
    @Title("Лист")
    class Leaf {
      @Middleware()
      @UseTag(Leaf)
      static async Tag() {}
    }

    @Controller()
    @Before(Section.Tag)
    class Tags {
      @Get("/replace")
      @Before(Sub.Tag)
      static async Replace() {}

      @Get("/sticky")
      @Before(Sub.Merge, Leaf.Tag)
      static async Sticky() {}
    }

    const tagsDocs = new OpenApi({ title: "tags", version: "1" });
    new Router(Tags, tagsDocs);
    const { paths } = tagsDocs.toJSON() as any;
    expect(paths["/replace"].get.tags).toEqual(["Подраздел"]);
    expect(paths["/sticky"].get.tags).toEqual(["Раздел > Подраздел > Лист"]);
  });
});
