import { I18nizer } from "@aom-js/api";

import * as messages from "./messages";

// язык — из `?locale=` или заголовка `x-locale`; если не задан или словаря нет — русский
export const i18nizer = new I18nizer("ru", "x-locale", "locale", {
  ru: {
    [messages.BOOK_NOT_FOUND]: "Книга не найдена",
    [messages.BOOK_ON_LOAN]: "Книга уже выдана",
    [messages.BOOK_ARCHIVED]: "Книга списана",
    [messages.LOAN_CREATED]: "Книга выдана",
  },
  en: {
    [messages.BOOK_NOT_FOUND]: "Book not found",
    [messages.BOOK_ON_LOAN]: "Book is already on loan",
    [messages.BOOK_ARCHIVED]: "Book is archived",
    [messages.LOAN_CREATED]: "Book loaned",
  },
});
