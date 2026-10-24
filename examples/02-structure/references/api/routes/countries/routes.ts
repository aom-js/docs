import { Before, Bridge, Controller, Get, This, Title } from "@aom-js/router";

import { citiesOf } from "../cities/init/value";
import { countries } from "../../../store";
import { CountryID } from "./init/params";
import { CountryValue } from "./init/value";

// элемент объявлен выше коллекции: @Bridge ниже берёт класс сразу, при объявлении
@Controller()
export class Country {
  @Get("/")
  @Title("Страна")
  @Before(CountryValue.Init)
  static async Index(@This(CountryValue) { value }: CountryValue) {
    return value;
  }

  @Get("/cities")
  @Title("Города страны")
  @Before(CountryValue.Init)
  static async Cities(@This(CountryValue) { value }: CountryValue) {
    return citiesOf(value.id);
  }
}

@Controller()
@Bridge(`/${CountryID}`, Country)
export class Countries {
  @Get("/")
  @Title("Список стран")
  static async Index() {
    return countries;
  }
}
