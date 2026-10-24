import { BodyBuilder, TransformTrim } from "@aom-js/api";
import { Before, Controller, OpenApi, Post, Router } from "@aom-js/router";
import { ComponentSchema, PartialType, PropertySchema, Schemer } from "@aom-js/schemer";
import { Transform } from "class-transformer";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { serve } from "../serve";
import { docs, router } from "./router";
import { resetStore, store } from "./store";

const schemer = new Schemer("#/components/schemas/");
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

describe("проверка входящих данных", () => {
  let api: Awaited<ReturnType<typeof serve>>;
  beforeAll(async () => (api = await serve(router)));
  afterAll(() => api.stop());
  beforeEach(resetStore);

  async function send(method: string, path: string, body: unknown) {
    const res = await fetch(`${api.url}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  }

  const addRussia = async () => (await send("POST", "/countries", { name: "Россия", isoCode: "RU" })).json;

  describe("создание", () => {
    it("POST /countries создаёт страну: строки обрезаны, лишние поля и чужой id отброшены", async () => {
      const { status, json } = await send("POST", "/countries", {
        name: "  Россия ",
        isoCode: " RU",
        id: "hack",
        extra: 1,
      });
      expect(status).toBe(200);
      expect(json).toEqual({ id: expect.any(String), name: "Россия", isoCode: "RU", enabled: true });
      expect(json.id).not.toBe("hack");
      expect(store.countries).toEqual([json]);
    });

    it("без обязательного поля — 400 с именем поля, в хранилище ничего", async () => {
      const { status, json } = await send("POST", "/countries", { name: "Франция" });
      expect(status).toBe(400);
      expect(json.message).toBe("AOM_API:ERROR_WRONG_DATA");
      expect(json.data.map((error: { property: string }) => error.property)).toEqual(["isoCode"]);
      expect(json.data[0].constraints).toHaveProperty("isString");
      expect(store.countries).toEqual([]);
    });

    it("неверный тип или длина — 400; строка из пробелов после обрезки пуста", async () => {
      const cases = [
        [{ name: 123, isoCode: "FR" }, "name", "isString"],
        [{ name: "Франция", isoCode: "FRA" }, "isoCode", "maxLength"],
        [{ name: "   ", isoCode: "FR" }, "name", "minLength"],
      ] as const;
      for (const [body, property, constraint] of cases) {
        const { status, json } = await send("POST", "/countries", body);
        expect(status).toBe(400);
        expect(json.data[0].property).toBe(property);
        expect(json.data[0].constraints).toHaveProperty(constraint);
      }
      expect(store.countries).toEqual([]);
    });
  });

  describe("частичная правка", () => {
    it("PATCH меняет только присланные поля", async () => {
      const { id } = await addRussia();
      const { status, json } = await send("PATCH", `/countries/${id}`, { name: " Russia " });
      expect(status).toBe(200);
      expect(json).toEqual({ id, name: "Russia", isoCode: "RU", enabled: true });
      expect((await send("PATCH", `/countries/${id}`, {})).json).toEqual(json);
      expect(store.countries).toEqual([json]);
    });

    it("PATCH проверяет присланные поля по той же схеме", async () => {
      const country = await addRussia();
      const { status, json } = await send("PATCH", `/countries/${country.id}`, { isoCode: "RUS" });
      expect(status).toBe(400);
      expect(json.data[0].property).toBe("isoCode");
      expect(store.countries).toEqual([country]);
    });

    it("PATCH не даёт стереть обязательное поле через null", async () => {
      const country = await addRussia();
      const { status, json } = await send("PATCH", `/countries/${country.id}`, { name: null });
      expect(status).toBe(400);
      expect(json).toMatchObject({ message: "REFERENCES:COUNTRY_REQUIRED_FIELDS", data: ["name"] });
      expect(store.countries).toEqual([country]);
    });

    it("PATCH неизвестной страны — 404 раньше проверки тела", async () => {
      const { status, json } = await send("PATCH", `/countries/${MISSING_ID}`, { isoCode: "XYZ" });
      expect(status).toBe(404);
      expect(json.message).toBe("REFERENCES:COUNTRY_NOT_FOUND");
    });
  });

  describe("составное тело", () => {
    it("страна и города проверяются каждый по своей схеме и записываются вместе", async () => {
      const { status, json } = await send("POST", "/countries/with-cities", {
        country: { name: "Италия", isoCode: "IT", extra: 1 },
        cities: [{ name: " Рим ", population: 2800000, extra: 2 }, { name: "Милан" }],
      });
      expect(status).toBe(200);
      expect(store.countries).toEqual([{ id: json.id, name: "Италия", isoCode: "IT", enabled: true }]);
      expect(store.cities).toEqual([
        { id: expect.any(String), countryId: json.id, name: "Рим", population: 2800000 },
        { id: expect.any(String), countryId: json.id, name: "Милан" },
      ]);
    });

    it("ошибка в одном городе — 400 с путём до поля, не записано ничего", async () => {
      const { status, json } = await send("POST", "/countries/with-cities", {
        country: { name: "Италия", isoCode: "IT" },
        cities: [{ name: "Рим" }, { name: "Милан", population: -1 }],
      });
      expect(status).toBe(400);
      const [cities] = json.data;
      expect(cities.property).toBe("cities");
      expect(cities.children[0].property).toBe("1");
      expect(cities.children[0].children[0]).toMatchObject({ property: "population", constraints: { min: expect.any(String) } });
      expect(store.countries).toEqual([]);
      expect(store.cities).toEqual([]);
    });

    it("без вложенной части — 400", async () => {
      for (const [body, property] of [
        [{ country: { name: "Италия", isoCode: "IT" } }, "cities"],
        [{ cities: [] }, "country"],
      ] as const) {
        const { status, json } = await send("POST", "/countries/with-cities", body);
        expect(status).toBe(400);
        expect(json.data[0]).toMatchObject({ property, constraints: { isDefined: expect.any(String) } });
      }
      expect(store.countries).toEqual([]);
    });
  });

  describe("подводные камни", () => {
    it("строка вместо булева не даёт 400: ядро приводит её к boolean", async () => {
      const { status, json } = await send("POST", "/countries", { name: "Франция", isoCode: "FR", enabled: "yes" });
      expect(status).toBe(200);
      expect(json.enabled).toBe(false);
    });

    it("TransformTrim из ядра делает строкой что угодно, и проверка типа не срабатывает", () => {
      @ComponentSchema()
      class Named {
        @PropertySchema.String({ isOptional: true, decorators: [TransformTrim()] })
        name?: string;
      }
      for (const [input, output] of [[123, "123"], [null, "null"]] as const) {
        const { values, errors } = schemer.validate(Named, { name: input });
        expect(errors).toEqual([]);
        expect(values).toMatchObject({ name: output });
      }
    });

    it("PropertySchema.Type без IsDefined пропускает тело без вложенной части, хотя в схеме она required", () => {
      @ComponentSchema()
      class Part {
        @PropertySchema.String({})
        name!: string;
      }
      @ComponentSchema()
      class Whole {
        @PropertySchema.Type({ value: () => Part })
        part!: Part;
      }
      expect(schemer.validate(Whole, {}).errors).toEqual([]);
      expect(schemer.render(Whole).required).toEqual(["part"]);
    });

    it("mapped-type прямо в BodyBuilder: схемы получают одно служебное имя, в документе остаётся первая", () => {
      @ComponentSchema()
      class First {
        @PropertySchema.String({})
        first!: string;
      }
      @ComponentSchema()
      class Second {
        @PropertySchema.String({})
        second!: string;
      }
      @Controller()
      class FirstBody extends BodyBuilder(PartialType(First)) {}
      @Controller()
      class SecondBody extends BodyBuilder(PartialType(Second)) {}
      @Controller()
      class Root {
        @Post("/first")
        @Before(FirstBody.Body)
        static async First() {}

        @Post("/second")
        @Before(SecondBody.Body)
        static async Second() {}
      }
      const openapi = new OpenApi({ title: "t", version: "1" });
      new Router(Root, openapi);
      const { paths, components } = openapi.toJSON() as any;
      const ref = (path: string) => paths[path].post.requestBody.content["application/json"].schema.$ref;
      expect(ref("/first")).toBe("#/components/schemas/PartialClassType");
      expect(ref("/second")).toBe("#/components/schemas/PartialClassType");
      expect(Object.keys(components.schemas.PartialClassType.properties)).toEqual(["first"]);
    });

    it("декоратор рядом с PropertySchema, а не в decorators, PartialType теряет", () => {
      @ComponentSchema()
      class Named {
        @Transform(({ value }) => value.trim())
        @PropertySchema.String({})
        name!: string;
      }
      @ComponentSchema()
      class NamedPartial extends PartialType(Named) {}
      expect(schemer.validate(Named, { name: " a " }).values).toMatchObject({ name: "a" });
      expect(schemer.validate(NamedPartial, { name: " a " }).values).toMatchObject({ name: " a " });
    });
  });

  it("схемы тел — в документе OpenAPI", () => {
    const { paths, components } = docs.toJSON() as any;
    const ref = (op: any) => op.requestBody.content["application/json"].schema.$ref;
    expect(ref(paths["/countries"].post)).toBe("#/components/schemas/CountryBodyDTO");
    expect(paths["/countries"].post.responses).toHaveProperty("400");
    expect(ref(paths["/countries/{countryId}"].patch)).toBe("#/components/schemas/CountryPartialBodyDTO");
    expect(ref(paths["/countries/with-cities"].post)).toBe("#/components/schemas/CountryWithCitiesDTO");

    const { CountryBodyDTO, CountryPartialBodyDTO, CountryWithCitiesDTO } = components.schemas;
    expect(Object.keys(CountryBodyDTO.properties)).toEqual(["name", "isoCode", "enabled"]);
    expect(CountryBodyDTO.required).toEqual(["name", "isoCode"]);
    expect(CountryPartialBodyDTO.required).toBeUndefined();
    expect(CountryWithCitiesDTO.properties.country.$ref).toBe("#/components/schemas/CountryBodyDTO");
    expect(CountryWithCitiesDTO.properties.cities).toMatchObject({
      type: "array",
      items: { $ref: "#/components/schemas/CityBodyDTO" },
    });
  });
});
