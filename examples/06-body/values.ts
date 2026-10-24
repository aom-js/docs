import { NotFoundResponse } from "@aom-js/api";
import { Before, Controller, Middleware, Responses, This } from "@aom-js/router";

import { CountryID } from "./params";
import type { Country } from "./schemas";
import { store } from "./store";

/** Страна из адреса: загружается до проверки тела, поэтому неизвестная страна получает 404 раньше 400. */
@Controller()
export class CountryValue {
  value: Country;

  @Middleware()
  @Before(CountryID.PathID)
  @Responses(NotFoundResponse.JSONSchema())
  static async Init(@This() self: CountryValue, @This(CountryID) { value }: CountryID) {
    const country = store.countries.find((item) => item.id === value);
    if (!country) throw new NotFoundResponse("REFERENCES:COUNTRY_NOT_FOUND");
    self.value = country;
  }
}
