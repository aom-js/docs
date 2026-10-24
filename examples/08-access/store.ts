import type { AomAccessToModulesStructure } from "@aom-js/api";

export type User = { name: string; role: string; enabled: boolean };

export type Note = { id: number; text: string };

// в базе это таблицы токенов и пользователей; здесь — сразу «токен → пользователь»
export const tokens = new Map<string, User>([
  ["token-alice", { name: "alice", role: "admin", enabled: true }],
  ["token-bob", { name: "bob", role: "editor", enabled: true }],
  ["token-carol", { name: "carol", role: "reader", enabled: true }],
  ["token-dave", { name: "dave", role: "admin", enabled: false }],
]);

// роль даёт либо полный доступ, либо гранты на точки доступа модуля (`Класс.метод`)
export const roles: Record<string, AomAccessToModulesStructure> = {
  admin: { fullAccess: true, modulesAccess: [] },
  editor: {
    fullAccess: false,
    modulesAccess: [{ moduleIdent: "notes", elements: [{ ident: "Notes.Add" }] }],
  },
  reader: { fullAccess: false, modulesAccess: [] },
};

export const notes = new Map<number, Note>();

/** сколько раз шаг карточки обратился к хранилищу: тест так видит, была ли загрузка */
export const stats = { loads: 0 };

export function reset() {
  notes.clear();
  notes.set(1, { id: 1, text: "первая заметка" });
  stats.loads = 0;
}

reset();
