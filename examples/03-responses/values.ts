import { NotFoundResponse } from "@aom-js/api";
import { Before, Controller, Middleware, Responses, This } from "@aom-js/router";

import * as messages from "./messages";
import { BookID } from "./params";
import { type Book, books } from "./store";

/** Книга из адреса: шаг находит её или бросает 404, обработчики берут её через `@This(BookValue)`. */
@Controller()
export class BookValue {
  value: Book;

  @Middleware()
  @Before(BookID.PathID)
  @Responses(NotFoundResponse.JSONSchema(messages.BOOK_NOT_FOUND))
  static async Init(@This() self: BookValue, @This(BookID) { value }: BookID) {
    const book = books.get(Number(value));
    if (!book) throw new NotFoundResponse(messages.BOOK_NOT_FOUND);
    self.value = book;
  }
}
