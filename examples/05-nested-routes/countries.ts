import { Before, Bridge, Controller, Get, Middleware, This, Title, UseTag } from "@aom-js/router";

import { Cities } from "./cities";
import { CountryID } from "./params";
import { countries } from "./store";
import { CountryValue } from "./values";

// классовый @Before уходит во все мосты класса: страна найдена и для /cities, и для /cities/{cityId}
@Controller()
@Before(CountryValue.Init)
@Bridge("/cities", Cities)
export class Country {
  @Get("/")
  @Title("Страна")
  static async Index(@This(CountryValue) { value }: CountryValue) {
    return value;
  }
}

@Controller()
@Title("Страны")
@Before(Countries.Setup)
@Bridge(`/${CountryID}`, Country)
export class Countries {
  @Middleware()
  @UseTag(Countries)
  static async Setup() {}

  @Get("/")
  @Title("Список стран")
  static async Index() {
    return countries; // здесь был бы запрос к базе
  }
}
