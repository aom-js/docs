import { NotFoundResponse } from "@aom-js/api";
import { Before, Controller, Middleware, Responses, This } from "@aom-js/router";

import { CityID, CountryID } from "./params";
import { cities, countries, type City, type Country } from "./store";

/** Страна из адреса — как в главе о вложенных маршрутах. */
@Controller()
export class CountryValue {
  value: Country;

  @Middleware()
  @Before(CountryID.PathID)
  @Responses(NotFoundResponse.JSONSchema())
  static async Init(@This() self: CountryValue, @This(CountryID) { value }: CountryID) {
    const country = countries.find((c) => c.id === Number(value)); // здесь был бы запрос к базе
    if (!country) throw new NotFoundResponse("REFERENCES:COUNTRY_NOT_FOUND");
    self.value = country;
  }
}

/** Город из адреса — только среди городов найденной страны. */
@Controller()
export class CityValue {
  value: City;

  @Middleware()
  @Before(CityID.PathID)
  @Responses(NotFoundResponse.JSONSchema())
  static async Init(
    @This() self: CityValue,
    @This(CityID) { value }: CityID,
    @This(CountryValue) { value: country }: CountryValue,
  ) {
    const city = cities.find((c) => c.id === Number(value) && c.countryId === country.id);
    if (!city) throw new NotFoundResponse("REFERENCES:CITY_NOT_FOUND");
    self.value = city;
  }
}
