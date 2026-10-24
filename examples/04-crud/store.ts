import { randomUUID } from "node:crypto";

import type { CurrencyDTO } from "./currencies";
import type { CountryDTO } from "./schemas";

// здесь были бы таблицы в базе; Map по id — чтобы пример запускался без неё
export const countries = new Map<string, CountryDTO>();
export const currencies = new Map<string, CurrencyDTO>();

/** Возвращает хранилище к исходным записям: тесты не зависят друг от друга. */
export function resetStore() {
  countries.clear();
  for (const [name, isoCode] of [["Россия", "RU"], ["Казахстан", "KZ"]]) {
    const id = randomUUID();
    countries.set(id, { id, name, isoCode });
  }
  currencies.clear();
  const id = randomUUID();
  currencies.set(id, { id, code: "RUB", name: "Российский рубль" });
}

resetStore();
