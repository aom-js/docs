import { Bridge, Controller, Get } from "@aom-js/router";

// так не надо: countries.ts импортирует этот файл ради моста, а этот файл — countries.ts ради параметра
import { CountryID } from "./countries";

@Controller()
export class CountryCities {
  @Get("/")
  static async Index() {
    return [];
  }
}

@Controller()
@Bridge(`/${CountryID}`, CountryCities)
export class Cities {}
