import { Before, Controller, Middleware, Nextpoint, This } from "@aom-js/router";

import { CountriesFilterQuery, QueryStringPager } from "./query";
import { countries, type Country } from "./store";

/** Выборка стран: шаги до обработчика копят условия, обработчики только применяют их. */
@Controller()
export class CountriesData {
  where: ((country: Country) => boolean)[] = [];

  // здесь был бы запрос к базе с собранными условиями
  rows() {
    return countries.filter((country) => this.where.every((test) => test(country)));
  }

  @Middleware()
  @Before(CountriesFilterQuery.Query)
  static async Filter(@This() self: CountriesData, @This(CountriesFilterQuery) { query }: CountriesFilterQuery) {
    if (query.search) {
      const search = query.search.toLowerCase();
      self.where.push((country) => country.name.toLowerCase().includes(search));
    }
    if (query.active !== undefined) {
      self.where.push((country) => country.active === query.active);
    }
    if (query.ids) {
      const ids = query.ids.map(Number);
      self.where.push((country) => ids.includes(country.id));
    }
  }

  @Nextpoint()
  @Before(QueryStringPager.Query)
  static async Page(@This() self: CountriesData, @This(QueryStringPager) { query }: QueryStringPager) {
    const field = query.sort.replace("-", "") as "id" | "name";
    const direction = query.sort.startsWith("-") ? -1 : 1;
    return self
      .rows()
      .sort((a, b) => direction * String(a[field]).localeCompare(String(b[field]), "ru", { numeric: true }))
      .slice(query.offset, query.offset + query.limit);
  }

  @Nextpoint()
  static async Total(@This() self: CountriesData) {
    return { total: self.rows().length };
  }
}
