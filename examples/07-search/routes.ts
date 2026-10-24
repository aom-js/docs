import { Before, Controller, Get, Middleware, Next, Title } from "@aom-js/router";

import { CountriesData } from "./data";

@Controller()
export class Countries {
  // общая подготовка списка и счётчика: один и тот же фильтр для обоих
  @Middleware()
  @Before(CountriesData.Filter)
  static async PrepareBaseQuery() {}

  @Get("/")
  @Title("Список стран")
  @Before(Countries.PrepareBaseQuery)
  @Next(CountriesData.Page)
  static async Index() {}

  @Get("/total")
  @Title("Количество стран по фильтру")
  @Before(Countries.PrepareBaseQuery)
  @Next(CountriesData.Total)
  static async Total() {}
}
