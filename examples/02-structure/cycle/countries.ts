import { NumberIDParam } from "@aom-js/api";
import { Bridge, Controller, Get } from "@aom-js/router";

import { Cities } from "./cities";

@Controller()
export class CountryID extends NumberIDParam("countryId") {}

@Controller()
@Bridge("/cities", Cities)
export class Countries {
  @Get("/")
  static async Index() {
    return [];
  }
}
