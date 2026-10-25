export type Translation = { locale: string; name: string };
export type Country = { id: number; name: string; archived: boolean; translations: Translation[] };
export type City = { id: number; countryId: number; name: string; translations: Translation[] };

// здесь была бы база: таблицы стран, городов и переводов их названий
export const countries: Country[] = [];
export const cities: City[] = [];

export function resetStore() {
  countries.splice(0, countries.length,
    { id: 1, name: "Франция", archived: false, translations: [{ locale: "en", name: "France" }] },
    { id: 2, name: "Византия", archived: true, translations: [] },
  );
  cities.splice(0, cities.length,
    { id: 1, countryId: 1, name: "Париж", translations: [{ locale: "en", name: "Paris" }] },
    { id: 2, countryId: 2, name: "Константинополь", translations: [] },
  );
}

resetStore();
