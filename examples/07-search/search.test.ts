import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { serve } from "../serve";
import { router } from "./router";

describe("поиск и фильтры", () => {
  let api: Awaited<ReturnType<typeof serve>>;
  beforeAll(async () => (api = await serve(router)));
  afterAll(() => api.stop());

  const list = async (query = "") => {
    const res = await fetch(`${api.url}/api/countries${query}`);
    return { status: res.status, ids: res.ok ? (await res.json()).map((c: { id: number }) => c.id) : [] };
  };
  const total = async (query = "") => {
    const res = await fetch(`${api.url}/api/countries/total${query}`);
    return { status: res.status, body: await res.json() };
  };

  it("без параметров — первая страница по id и общее число", async () => {
    expect(await list()).toEqual({ status: 200, ids: [1, 2, 3, 4, 5, 6] });
    expect((await total()).body).toEqual({ total: 6 });
  });

  it("search ищет подстроку названия без учёта регистра, пробелы по краям срезаются", async () => {
    expect((await list("?search=ГЕР")).ids).toEqual([6]);
    expect((await list(`?search=${encodeURIComponent("  ия ")}`)).ids).toEqual([1, 4, 5, 6]);
    expect((await list("?search=")).ids).toEqual([1, 2, 3, 4, 5, 6]);
    expect((await list("?search=%20%20")).ids).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("active=true и active=false делят список на две части", async () => {
    expect((await list("?active=true")).ids).toEqual([1, 2, 3, 5]);
    expect((await list("?active=false")).ids).toEqual([4, 6]);
  });

  it("ids принимает повтор параметра и список через запятую", async () => {
    expect((await list("?ids=1&ids=3")).ids).toEqual([1, 3]);
    expect((await list("?ids=1,3")).ids).toEqual([1, 3]);
    expect((await list("?ids=5")).ids).toEqual([5]);
  });

  it("несколько фильтров сужают выборку вместе", async () => {
    expect((await list("?search=ия&active=true")).ids).toEqual([1, 5]);
    expect((await list("?ids=1,4,6&sort=-name")).ids).toEqual([1, 6, 4]);
    expect((await list("?ids=1,4,6&active=false&search=арм")).ids).toEqual([4]);
  });

  it("limit и offset режут страницу, sort задаёт порядок", async () => {
    expect((await list("?limit=2")).ids).toEqual([1, 2]);
    expect((await list("?limit=2&offset=4")).ids).toEqual([5, 6]);
    expect((await list("?sort=-id&limit=3")).ids).toEqual([6, 5, 4]);
    expect((await list("?sort=name")).ids).toEqual([4, 2, 6, 5, 3, 1]);
    expect((await list("?sort=-name&offset=1&limit=2")).ids).toEqual([3, 5]);
  });

  it("total считает по тому же фильтру и не смотрит на страницу", async () => {
    expect((await total("?active=true&limit=1")).body).toEqual({ total: 4 });
    expect((await total("?search=ия&ids=1,4")).body).toEqual({ total: 2 });
    expect((await total("?limit=abc&sort=zzz")).status).toBe(200);
  });

  it("неизвестные параметры отбрасываются", async () => {
    expect(await list("?foo=1&name=Россия")).toEqual({ status: 200, ids: [1, 2, 3, 4, 5, 6] });
  });

  it("неверные значения — 400", async () => {
    const wrong = ["?search=a&search=b", "?ids=x", "?ids=1,3&ids=5", "?limit=abc", "?limit=0", "?limit=101", "?offset=-1", "?sort=zzz"];
    for (const query of wrong) {
      expect((await list(query)).status, query).toBe(400);
    }
    expect((await total("?ids=x")).body).toMatchObject({ status: 400, message: "AOM_API:ERROR_WRONG_DATA" });
  });

  it("active принимает и 1/0, другие значения — 400", async () => {
    expect((await list("?active=1")).ids).toEqual([1, 2, 3, 5]);
    expect((await list("?active=0")).ids).toEqual([4, 6]);
    for (const query of ["?active=yes", "?active=", "?active=TRUE"]) {
      expect((await list(query)).status, query).toBe(400);
    }
  });

  it("документ OpenAPI показывает параметры фильтра у обоих маршрутов, страницы — только у списка", async () => {
    const doc = await (await fetch(`${api.url}/openapi.json`)).json();
    const names = (path: string) => doc.paths[path].get.parameters.map((p: { name: string }) => p.name);
    expect(names("/api/countries")).toEqual(["search", "active", "ids", "limit", "offset", "sort"]);
    expect(names("/api/countries/total")).toEqual(["search", "active", "ids"]);
    const sort = doc.paths["/api/countries"].get.parameters.find((p: { name: string }) => p.name === "sort");
    expect(sort.schema).toMatchObject({ enum: ["id", "-id", "name", "-name"], default: "id" });
    const limit = doc.paths["/api/countries"].get.parameters.find((p: { name: string }) => p.name === "limit");
    expect(limit).toMatchObject({ schema: { minimum: 1, maximum: 100, default: 20 } });
    expect(limit.required).toBeUndefined();
    expect(doc.paths["/api/countries"].get.responses["400"]).toBeDefined();
  });
});
