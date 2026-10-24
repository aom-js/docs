import { Controller } from "@aom-js/router";
import { UUIDParam } from "@aom-js/api";

// `${CountryID}` в пути — сегмент `:countryId(<regexp UUID>)`
@Controller()
export class CountryID extends UUIDParam("countryId") {}
