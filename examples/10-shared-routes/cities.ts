import { Before, Bridge, Controller, Middleware, This } from "@aom-js/router";

import { CityID } from "./params";
import { TranslationsBase } from "./translations";
import { CityValue } from "./values";

/** Переводы города: та же база, свои пустышки. */
@Controller()
export class CityTranslations extends TranslationsBase {
  @Middleware()
  static async Setup(@This() self: CityTranslations, @This(CityValue) { value }: CityValue) {
    self.owner = value;
  }

  // своих правил записи у города нет: пустышку закрывает пустой шаг
  @Middleware()
  static async Writable() {}
}

@Controller()
@Before(CityValue.Init)
@Bridge("/translations", CityTranslations)
export class City {}

@Controller()
@Bridge(`/${CityID}`, City)
export class Cities {}
