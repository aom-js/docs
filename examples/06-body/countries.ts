import { randomUUID } from "node:crypto";
import { WrongDataResponse } from "@aom-js/api";
import { Before, Bridge, Controller, Patch, Post, This, Title } from "@aom-js/router";

import { CountryBody, CountryBodyPartial, CountryWithCitiesBody } from "./body";
import { CountryID } from "./params";
import { store } from "./store";
import { CountryValue } from "./values";

@Controller()
@Before(CountryValue.Init)
export class Country {
  @Patch("/")
  @Title("Изменить страну")
  @Before(CountryBodyPartial.Body)
  static async Update(
    @This(CountryValue) { value }: CountryValue,
    @This(CountryBodyPartial) { body }: CountryBodyPartial,
  ) {
    // необязательное поле пропускает и null, а стирать обязательные поля правкой нельзя
    const erased = Object.keys(body).filter((key) => body[key as keyof typeof body] === null);
    if (erased.length) throw new WrongDataResponse("REFERENCES:COUNTRY_REQUIRED_FIELDS", erased);
    // в теле только присланные поля: остальные остаются как были
    return Object.assign(value, body);
  }
}

@Controller()
@Bridge(`/${CountryID}`, Country)
export class Countries {
  @Post("/")
  @Title("Добавить страну")
  @Before(CountryBody.Body)
  static async Add(@This(CountryBody) { body }: CountryBody) {
    const country = { id: randomUUID(), enabled: true, ...body };
    store.countries.push(country);
    return country;
  }

  @Post("/with-cities")
  @Title("Добавить страну с городами")
  @Before(CountryWithCitiesBody.Body)
  static async AddWithCities(@This(CountryWithCitiesBody) { body }: CountryWithCitiesBody) {
    // тело проверено целиком до первой записи: ошибка в любом городе — и не записано ничего
    const country = { id: randomUUID(), enabled: true, ...body.country };
    const cities = body.cities.map((city) => ({ id: randomUUID(), countryId: country.id, ...city }));
    store.countries.push(country);
    store.cities.push(...cities);
    return { ...country, cities };
  }
}
