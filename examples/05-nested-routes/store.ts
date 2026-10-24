export type Country = { id: number; name: string };
export type City = { id: number; countryId: number; name: string };

export const countries: Country[] = [
  { id: 1, name: "Франция" },
  { id: 2, name: "Япония" },
];

export const cities: City[] = [
  { id: 1, countryId: 1, name: "Париж" },
  { id: 2, countryId: 1, name: "Лион" },
  { id: 3, countryId: 2, name: "Токио" },
];

// сколько раз страну читали из «базы»: тест сверяет, что за запрос — один раз
export const reads = { countries: 0 };

export function findCountry(id: number) {
  reads.countries++;
  return countries.find((country) => country.id === id); // здесь был бы запрос к базе
}
