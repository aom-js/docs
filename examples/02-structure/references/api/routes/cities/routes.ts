import { Before, Bridge, Controller, Get, This, Title } from "@aom-js/router";

import { cities } from "../../../store";
import { CityID } from "./init/params";
import { CityValue } from "./init/value";

@Controller()
export class City {
  @Get("/")
  @Title("Город")
  @Before(CityValue.Init)
  static async Index(@This(CityValue) { value }: CityValue) {
    return value;
  }
}

@Controller()
@Bridge(`/${CityID}`, City)
export class Cities {
  @Get("/")
  @Title("Список городов")
  static async Index() {
    return cities;
  }
}
