import { BodyBuilder } from "@aom-js/api";
import { Controller } from "@aom-js/router";

import { CountryBodyDTO, CountryPartialBodyDTO, CountryWithCitiesDTO } from "./schemas";

@Controller()
export class CountryBody extends BodyBuilder(CountryBodyDTO) {}

@Controller()
export class CountryBodyPartial extends BodyBuilder(CountryPartialBodyDTO) {}

@Controller()
export class CountryWithCitiesBody extends BodyBuilder(CountryWithCitiesDTO) {}
