import { ConflictResponse, MessageResponse } from "@aom-js/api";
import { Before, Bridge, Controller, Get, Post, Responses, This, Title } from "@aom-js/router";

import * as messages from "./messages";
import { BookID } from "./params";
import { BookArchivedResponse, BookResponse } from "./responses";
import { BookValue } from "./values";

// классовый @Before: книга найдена до любого обработчика карточки, его 404 попадает в описание каждого
@Controller()
@Before(BookValue.Init)
export class Book {
  @Get("/")
  @Title("Карточка книги")
  @Responses(BookResponse.JSONSchema("Книга"))
  static async Index(@This(BookValue) { value }: BookValue) {
    return value;
  }

  @Post("/loan")
  @Title("Выдать книгу")
  @Responses(
    MessageResponse.JSONSchema(messages.LOAN_CREATED),
    ConflictResponse.JSONSchema(messages.BOOK_ON_LOAN),
    BookArchivedResponse.JSONSchema(),
  )
  static async Loan(@This(BookValue) { value: book }: BookValue) {
    if (book.archived) throw new BookArchivedResponse(messages.BOOK_ARCHIVED);
    // в `data` — подробности для клиента: какую книгу не удалось выдать
    if (book.onLoan) throw new ConflictResponse(messages.BOOK_ON_LOAN, { id: book.id });
    book.onLoan = true;
    return new MessageResponse(messages.LOAN_CREATED);
  }
}

@Controller()
@Bridge(`/${BookID}`, Book)
export class Books {}
