import { ConflictResponse } from "@aom-js/api";
import { Before, Bridge, Controller, Middleware, This } from "@aom-js/router";

import { Cities } from "./cities";
import { CountryID } from "./params";
import { TranslationsBase } from "./translations";
import { CountryValue } from "./values";

/** Переводы страны: маршруты — из `TranslationsBase`, здесь только его пустышки. */
@Controller()
export class CountryTranslations extends TranslationsBase {
  @Middleware()
  static async Setup(@This() self: CountryTranslations, @This(CountryValue) { value }: CountryValue) {
    self.owner = value;
  }

  // архивную страну больше не переводят
  @Middleware()
  static async Writable(@This(CountryValue) { value }: CountryValue) {
    if (value.archived) throw new ConflictResponse("REFERENCES:COUNTRY_ARCHIVED");
  }
}

@Controller()
@Before(CountryValue.Init)
@Bridge("/translations", CountryTranslations)
@Bridge("/cities", Cities)
export class Country {}

@Controller()
@Bridge(`/${CountryID}`, Country)
export class Countries {}
