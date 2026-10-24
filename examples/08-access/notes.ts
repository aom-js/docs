import { BodyBuilder, NotFoundResponse, NumberIDParam } from "@aom-js/api";
import { Before, Bridge, Controller, Get, Middleware, Patch, Post } from "@aom-js/router";
import { Responses, This, Title } from "@aom-js/router";
import { ComponentSchema, PropertySchema } from "@aom-js/schemer";

import { AccessController, Permissions } from "./access";
import { notes, stats, type Note } from "./store";

@Controller()
export class NoteID extends NumberIDParam("noteId") {}

@ComponentSchema()
class NoteDTO {
  @PropertySchema.String({ description: "Текст заметки" })
  text!: string;
}

@Controller()
class NoteBody extends BodyBuilder(NoteDTO) {}

/** Заметка из адреса: её видят все шаги карточки через `@This(NoteValue)`. */
@Controller()
export class NoteValue {
  value!: Note;

  @Middleware()
  @Before(NoteID.PathID)
  @Responses(NotFoundResponse.JSONSchema())
  static async Init(@This() self: NoteValue, @This(NoteID) { value }: NoteID) {
    stats.loads++;
    const note = notes.get(Number(value)); // здесь был бы запрос к базе
    if (!note) throw new NotFoundResponse("NOTES:NOTE_NOT_FOUND");
    self.value = note;
  }
}

@Controller()
export class Note {
  @Patch("/")
  @Title("Изменить заметку")
  @Before(NoteBody.Body)
  static async Patch(@This(NoteValue) { value }: NoteValue, @This(NoteBody) { body }: NoteBody) {
    return Object.assign(value, body);
  }
}

@Controller()
export class Notes {
  @Get("/")
  @Title("Список заметок")
  static async Index() {
    return [...notes.values()];
  }

  @Post("/")
  @Title("Добавить заметку")
  @Before(NoteBody.Body)
  @AccessController.TypesRequired(Permissions.ADMIN)
  static async Add(@This(NoteBody) { body }: NoteBody) {
    const note = { id: notes.size + 1, ...body };
    notes.set(note.id, note);
    return note;
  }

  /** мост карточки: TypesRequired ниже @Before — декораторы применяются снизу вверх, права проверяются раньше загрузки */
  @Middleware()
  @Title("Карточка заметки")
  @Before(NoteValue.Init)
  @AccessController.TypesRequired(Permissions.ADMIN)
  @Bridge(`/${NoteID}`, Note)
  static async Card() {}
}
