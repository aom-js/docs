import { NumberIDParam } from "@aom-js/api";
import { Controller } from "@aom-js/router";

// сегменты пути: `${CountryID}` в шаблоне маршрута превращается в `:countryId(...)`
@Controller()
export class CountryID extends NumberIDParam("countryId") {}

@Controller()
export class CityID extends NumberIDParam("cityId") {}
