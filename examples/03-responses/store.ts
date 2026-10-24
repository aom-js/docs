export type Book = { id: number; title: string; onLoan: boolean; archived: boolean };

// здесь была бы таблица в базе
export const books = new Map<number, Book>();

export function reset() {
  books.clear();
  books.set(1, { id: 1, title: "Мастер и Маргарита", onLoan: false, archived: false });
  books.set(2, { id: 2, title: "Война и мир", onLoan: true, archived: false });
  books.set(3, { id: 3, title: "Справочник 1987 года", onLoan: false, archived: true });
}

reset();
