import { NotFoundResponse } from "@aom-js/api";
import { Before, Controller, Middleware, This } from "@aom-js/router";

import { countries } from "../../../../store";
import { CountryID } from "./params";

/** Поиск страны по id: им пользуются и шаг ниже, и соседние ресурсы. */
export function findCountry(id: number) {
  const country = countries.find((item) => item.id === id);
  if (!country) throw new NotFoundResponse("REFERENCES:COUNTRY_NOT_FOUND");
  return country;
}

@Controller()
export class CountryValue {
  value: ReturnType<typeof findCountry>;

  /** Шаг «страна из адреса»: id из пути — запись или 404. */
  @Middleware()
  @Before(CountryID.PathID)
  static async Init(@This() self: CountryValue, @This(CountryID) { value }: CountryID) {
    self.value = findCountry(+value);
  }
}
