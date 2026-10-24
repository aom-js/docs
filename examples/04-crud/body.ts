import { Controller } from "@aom-js/router";
import { BodyBuilder } from "@aom-js/api";

import { CountryBodyDTO, CountryPartialBodyDTO } from "./schemas";

@Controller()
export class CountryBody extends BodyBuilder(CountryBodyDTO) {}

@Controller()
export class CountryBodyPartial extends BodyBuilder(CountryPartialBodyDTO) {}
