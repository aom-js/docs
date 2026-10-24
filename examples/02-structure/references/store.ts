// данные в памяти процесса: в настоящем приложении здесь сущности ORM, а поиск — запрос к базе
export const countries = [
  { id: 1, name: "Армения" },
  { id: 2, name: "Грузия" },
];

export const cities = [
  { id: 1, name: "Ереван", countryId: 1 },
  { id: 2, name: "Гюмри", countryId: 1 },
  { id: 3, name: "Тбилиси", countryId: 2 },
];
