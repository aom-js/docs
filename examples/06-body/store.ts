import type { City, Country } from "./schemas";

// здесь была бы база: таблицы стран и городов вместо массивов
export const store = { countries: [] as Country[], cities: [] as City[] };

export function resetStore() {
  store.countries.length = 0;
  store.cities.length = 0;
}
