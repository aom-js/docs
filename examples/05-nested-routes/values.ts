import { NotFoundResponse } from "@aom-js/api";
import { Before, Controller, Middleware, Responses, This } from "@aom-js/router";

import { CityID, CountryID } from "./params";
import { cities, type City, type Country, findCountry } from "./store";

/** Страна из адреса: один объект на запрос, его видят все шаги маршрута через `@This(CountryValue)`. */
@Controller()
export class CountryValue {
  value: Country;

  @Middleware()
  @Before(CountryID.PathID)
  @Responses(NotFoundResponse.JSONSchema())
  static async Init(@This() self: CountryValue, @This(CountryID) { value }: CountryID) {
    const country = findCountry(Number(value));
    if (!country) throw new NotFoundResponse("REFERENCES:COUNTRY_NOT_FOUND");
    self.value = country;
  }
}

/** Город из адреса — только среди городов страны, уже найденной выше по маршруту. */
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
    // условие на страну обязательно: без него /countries/2/cities/1 отдал бы Париж «как японский»
    const city = cities.find((c) => c.id === Number(value) && c.countryId === country.id);
    if (!city) throw new NotFoundResponse("REFERENCES:CITY_NOT_FOUND");
    self.value = city;
  }
}
