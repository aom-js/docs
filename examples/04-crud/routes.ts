import { randomUUID } from "node:crypto";
import { Before, Bridge, Controller, Delete, Get, Patch, Post } from "@aom-js/router";
import { Responses, This, Title } from "@aom-js/router";
import { NumberResponse } from "@aom-js/api";

import { CountryBody, CountryBodyPartial } from "./body";
import { CountryID } from "./params";
import { CountryDTO } from "./schemas";
import { countries } from "./store";
import { CountryValue } from "./value";

const CountryResponse = { status: 200, schema: CountryDTO, description: "Страна" };

/** Одна страна: перед каждым обработчиком шаг `CountryValue.Init` загружает запись. */
@Controller()
@Before(CountryValue.Init)
export class Country {
  @Get("/")
  @Title("Информация о стране")
  @Responses(CountryResponse)
  static async Index(@This(CountryValue) { value }: CountryValue) {
    return value;
  }

  @Patch("/")
  @Title("Изменить страну")
  @Before(CountryBodyPartial.Body)
  @Responses(CountryResponse)
  static async Patch(
    @This(CountryValue) { value }: CountryValue,
    @This(CountryBodyPartial) { body }: CountryBodyPartial,
  ) {
    return Object.assign(value, body); // здесь было бы обновление в базе
  }

  @Delete("/")
  @Title("Удалить страну")
  @Responses(CountryResponse)
  static async Remove(@This(CountryValue) { value }: CountryValue) {
    countries.delete(value.id); // здесь было бы удаление из базы
    return value;
  }
}

@Controller()
@Bridge(`/${CountryID}`, Country)
export class Countries {
  @Get("/")
  @Title("Список стран")
  @Responses({ ...CountryResponse, isArray: true, description: "Список стран" })
  static async Index() {
    return [...countries.values()]; // здесь был бы запрос к базе
  }

  @Get("/total")
  @Title("Число стран")
  @Responses(NumberResponse.JSONSchema("Число стран"))
  static async Total() {
    return new NumberResponse(countries.size); // здесь был бы count-запрос
  }

  @Post("/")
  @Title("Добавить страну")
  @Before(CountryBody.Body)
  @Responses(CountryResponse)
  static async Add(@This(CountryBody) { body }: CountryBody) {
    const country = { ...body, id: randomUUID() };
    countries.set(country.id, country); // здесь была бы вставка в базу
    return country;
  }
}
