import { NotFoundResponse } from "@aom-js/api";
import { Before, Controller, Middleware, This } from "@aom-js/router";

import { cities } from "../../../../store";
// у соседа — из его init/ по пути файла: init/ не тянет routes.ts, и цикла импортов нет
import { findCountry } from "../../countries/init/value";
import { CityID } from "./params";

export function citiesOf(countryId: number) {
  return cities.filter((city) => city.countryId === countryId);
}

@Controller()
export class CityValue {
  value: (typeof cities)[number] & { country: ReturnType<typeof findCountry> };

  /** Шаг «город из адреса»: город вместе со своей страной или 404. */
  @Middleware()
  @Before(CityID.PathID)
  static async Init(@This() self: CityValue, @This(CityID) { value }: CityID) {
    const city = cities.find((item) => item.id === +value);
    if (!city) throw new NotFoundResponse("REFERENCES:CITY_NOT_FOUND");
    self.value = { ...city, country: findCountry(city.countryId) };
  }
}
