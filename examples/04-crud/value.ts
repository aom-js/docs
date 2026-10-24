import { Before, Controller, Middleware, Responses, This } from "@aom-js/router";
import { NotFoundResponse } from "@aom-js/api";

import { CountryID } from "./params";
import type { CountryDTO } from "./schemas";
import { countries } from "./store";

/** Значение одной страны — запись из адреса; объект один на запрос. */
@Controller()
export class CountryValue {
  value!: CountryDTO;

  /** Шаг-значение: id из пути → запись → 404, если её нет. */
  @Middleware()
  @Before(CountryID.PathID)
  @Responses(NotFoundResponse.JSONSchema())
  static async Init(@This() self: CountryValue, @This(CountryID) { value }: CountryID) {
    const country = countries.get(value); // здесь был бы запрос к базе по id
    if (!country) throw new NotFoundResponse("REFERENCES:COUNTRY_NOT_FOUND");
    self.value = country;
  }
}
