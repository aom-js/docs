export interface Country {
  id: number;
  name: string;
  code: string;
  active: boolean;
}

// здесь была бы таблица в базе; в примере — массив в памяти процесса
export const countries: Country[] = [
  { id: 1, name: "Россия", code: "RU", active: true },
  { id: 2, name: "Беларусь", code: "BY", active: true },
  { id: 3, name: "Казахстан", code: "KZ", active: true },
  { id: 4, name: "Армения", code: "AM", active: false },
  { id: 5, name: "Грузия", code: "GE", active: true },
  { id: 6, name: "Германия", code: "DE", active: false },
];
