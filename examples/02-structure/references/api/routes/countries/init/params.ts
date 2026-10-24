import { NumberIDParam } from "@aom-js/api";
import { Controller } from "@aom-js/router";

@Controller()
export class CountryID extends NumberIDParam("countryId") {}
