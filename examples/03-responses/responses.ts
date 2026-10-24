import { CommonResponse, ErrorMessage } from "@aom-js/api";
import { ComponentSchema, PropertySchema } from "@aom-js/schemer";

import * as messages from "./messages";

/** Схема ответа «книга»: попадает в документ OpenAPI как компонент. */
@ComponentSchema({ description: "Книга" })
export class BookResponse extends CommonResponse {
  @PropertySchema.Number({ description: "Номер" })
  id!: number;

  @PropertySchema.String({ description: "Название" })
  title!: string;

  @PropertySchema.Boolean({ description: "Сейчас выдана" })
  onLoan!: boolean;

  @PropertySchema.Boolean({ description: "Списана" })
  archived!: boolean;
}

/** Своя ошибка: статус и описание по умолчанию — у класса, тело — как у всех ошибок. */
@ComponentSchema({ description: "Книга списана" })
export class BookArchivedResponse extends ErrorMessage {
  static status = 410;

  static description = messages.BOOK_ARCHIVED;
}
