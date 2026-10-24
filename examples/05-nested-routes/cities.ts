import { Before, Bridge, Controller, Get, MergeNextTags, Middleware, This, Title, UseTag } from "@aom-js/router";

import { CityID } from "./params";
import { cities } from "./store";
import { CityValue, CountryValue } from "./values";

@Controller()
@Before(CityValue.Init)
export class City {
  @Get("/")
  @Title("Город")
  static async Index(
    @This(CityValue) { value: city }: CityValue,
    @This(CountryValue) { value: country }: CountryValue,
  ) {
    return { ...city, country: country.name };
  }
}

@Controller()
@Title("Города")
@Before(Cities.Setup)
@Bridge(`/${CityID}`, City)
export class Cities {
  // тег «Города» дописывается к тегу родителя: в документе — «Страны > Города»
  @Middleware()
  @UseTag(Cities)
  @MergeNextTags()
  static async Setup() {}

  @Get("/")
  @Title("Города страны")
  static async Index(@This(CountryValue) { value: country }: CountryValue) {
    return cities.filter((city) => city.countryId === country.id); // здесь был бы запрос к базе
  }
}
