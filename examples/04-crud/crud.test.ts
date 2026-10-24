import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Bridge, Controller, Get, Next, OpenApi, Router, This } from "@aom-js/router";

import { serve } from "../serve";
import { EntityController } from "./entity";
import { CountryID } from "./params";
import { docs, router } from "./router";
import { countries, resetStore } from "./store";
import { CountryValue } from "./value";

const MISSING = "00000000-0000-4000-8000-000000000000";

// тесты меняют хранилище: перед каждым — исходные записи
beforeEach(resetStore);

let api: Awaited<ReturnType<typeof serve>>;
beforeAll(async () => (api = await serve(router)));
afterAll(() => api.stop());

const call = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(`${api.url}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
};

describe("ресурс из схемы данных", () => {
  it("GET /countries отдаёт список, GET /countries/total — число записей", async () => {
    const list = await call("GET", "/countries");
    expect(list.status).toBe(200);
    expect(list.json.map((c: { isoCode: string }) => c.isoCode)).toEqual(["RU", "KZ"]);
    expect((await call("GET", "/countries/total")).json).toEqual({ value: 2 });
  });

  it("POST /countries добавляет страну, и она открывается карточкой", async () => {
    const created = await call("POST", "/countries", { name: "Беларусь", isoCode: "BY" });
    expect(created.status).toBe(200);
    expect(created.json).toEqual({ id: expect.any(String), name: "Беларусь", isoCode: "BY" });

    const card = await call("GET", `/countries/${created.json.id}`);
    expect(card).toEqual({ status: 200, json: created.json });
    expect((await call("GET", "/countries/total")).json).toEqual({ value: 3 });
  });

  it("PATCH /countries/{id} меняет только переданные поля", async () => {
    const [ru] = (await call("GET", "/countries")).json;
    const patched = await call("PATCH", `/countries/${ru.id}`, { name: "Российская Федерация" });
    expect(patched).toEqual({ status: 200, json: { ...ru, name: "Российская Федерация" } });
    expect((await call("GET", `/countries/${ru.id}`)).json.name).toBe("Российская Федерация");
  });

  it("DELETE /countries/{id} удаляет запись, после этого карточка отвечает 404", async () => {
    const [ru] = (await call("GET", "/countries")).json;
    expect(await call("DELETE", `/countries/${ru.id}`)).toEqual({ status: 200, json: ru });
    expect((await call("GET", `/countries/${ru.id}`)).status).toBe(404);
    expect((await call("GET", "/countries/total")).json).toEqual({ value: 1 });
  });

  it("несуществующий id: карточка, правка и удаление отвечают 404 раньше проверки тела", async () => {
    for (const method of ["GET", "PATCH", "DELETE"]) {
      const body = method === "PATCH" ? { isoCode: "XYZ" } : undefined;
      expect(await call(method, `/countries/${MISSING}`, body)).toEqual({
        status: 404,
        json: { status: 404, message: "REFERENCES:COUNTRY_NOT_FOUND" },
      });
    }
    expect((await call("GET", "/countries/total")).json).toEqual({ value: 2 });
  });

  it("id не в формате UUID и косая черта в конце не подходят под маршрут: 404 от сервера", async () => {
    for (const path of ["/countries/42", "/countries/"]) {
      const res = await call("GET", path);
      expect(res).toEqual({ status: 404, json: { status: 404, message: "AOM_API:PATH_NOT_FOUND" } });
    }
  });

  it("тело не по схеме — 400, запись не создаётся и не меняется", async () => {
    expect((await call("POST", "/countries", { name: "Беларусь" })).status).toBe(400);
    const [ru] = (await call("GET", "/countries")).json;
    expect((await call("PATCH", `/countries/${ru.id}`, { isoCode: "RUS" })).status).toBe(400);
    expect((await call("GET", "/countries")).json).toEqual([ru, expect.objectContaining({ isoCode: "KZ" })]);
  });

  it("документ OpenAPI: у списка массив CountryDTO, у карточки параметр пути и ответы 200, 400, 404", () => {
    const { paths } = docs.toJSON();
    const list = paths!["/countries"].get!.responses!["200"].content["application/json"].schema;
    expect(list).toEqual({ type: "array", items: { $ref: "#/components/schemas/CountryDTO" } });
    expect(JSON.stringify(paths!["/countries"].post!.requestBody)).toContain("CountryBodyDTO");

    const card = paths!["/countries/{countryId}"];
    expect(card.get!.parameters).toContainEqual(expect.objectContaining({ name: "countryId", in: "path" }));
    expect(Object.keys(card.get!.responses!)).toEqual(expect.arrayContaining(["200", "404"]));
    expect(Object.keys(card.patch!.responses!)).toEqual(expect.arrayContaining(["200", "400", "404"]));
  });
});

describe("когда ресурсов много: общий контроллер", () => {
  it("валюты собраны из готовых шагов: список, счёт, добавление, карточка и 404", async () => {
    expect((await call("GET", "/currencies")).json).toEqual([
      { id: expect.any(String), code: "RUB", name: "Российский рубль" },
    ]);
    const created = await call("POST", "/currencies", { code: "KZT", name: "Тенге" });
    expect(created).toEqual({ status: 200, json: { id: expect.any(String), code: "KZT", name: "Тенге" } });
    expect((await call("GET", `/currencies/${created.json.id}`)).json).toEqual(created.json);
    expect((await call("GET", "/currencies/total")).json).toEqual({ value: 2 });
    expect(await call("GET", `/currencies/${MISSING}`)).toEqual({
      status: 404,
      json: { status: 404, message: "REFERENCES:RECORD_NOT_FOUND" },
    });
  });

  it("схему ответа общий шаг берёт у наследника: у списка валют массив CurrencyDTO", () => {
    const { paths } = docs.toJSON();
    const list = paths!["/currencies"].get!.responses!["200"].content["application/json"].schema;
    expect(list).toEqual({ type: "array", items: { $ref: "#/components/schemas/CurrencyDTO" } });
    expect(Object.keys(paths!["/currencies/{currencyId}"].get!.responses!)).toEqual(
      expect.arrayContaining(["200", "404"]),
    );
  });
});

describe("подводные камни ресурса", () => {
  const build = (root: new () => unknown) => new Router(root, new OpenApi({ title: "t", version: "1" }));

  it("шаг, взятый у самого общего контроллера, роняет сборку роутера: схемы ответа нет", () => {
    @Controller()
    class Wrong {
      @Get("/")
      @Next(EntityController.Data)
      static async Index() {}
    }
    // у EntityController нет `schema`: описание ответа падает на undefined
    expect(() => build(Wrong)).toThrow(/reading 'constructor'/);
  });

  it("без шага CountryValue.Init объект значения пуст: @This его не заполнит", async () => {
    @Controller()
    class CardWithoutInit {
      @Get("/")
      static async Index(@This(CountryValue) { value }: CountryValue) {
        return { value: value ?? null };
      }
    }
    @Controller()
    @Bridge(`/${CountryID}`, CardWithoutInit)
    class Root {}

    const wrong = await serve(build(Root));
    const [id] = countries.keys();
    expect(await (await fetch(`${wrong.url}/${id}`)).json()).toEqual({ value: null });
    wrong.stop();
  });
});
