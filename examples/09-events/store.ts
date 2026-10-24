export type User = { id: string };

// пользователи по токенам; в приложении здесь был бы запрос к базе
export const tokens = new Map<string, User>([
  ["token-ann", { id: "ann" }],
  ["token-bob", { id: "bob" }],
]);

/** Сколько непрочитанных сообщений у пользователя, по его id. */
export const unread = new Map<string, number>();
