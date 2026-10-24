import { AomServerEvents, type HttpCtx } from "@aom-js/api";
import { Controller, Ctx, Get, Responses, This, Title } from "@aom-js/router";
import { ComponentSchema, PropertySchema } from "@aom-js/schemer";

import { CurrentUser } from "./current-user";

/** Значение события `unread`: сколько непрочитанных сообщений у пользователя. */
@ComponentSchema()
export class UnreadEvent {
  @PropertySchema.Number({ description: "Непрочитанных сообщений" })
  total!: number;
}

@Controller()
export class Events {
  // словарь «тип события → класс значения»: по нему проверяется отправка и строится OpenAPI
  static events = new AomServerEvents({ unread: UnreadEvent });

  @Get("/events")
  @Title("Поток событий")
  @Responses(Events.events.JSONSchema("Событие из словаря"))
  static Connect(@This(CurrentUser) { user }: CurrentUser, @Ctx() { res }: HttpCtx) {
    return this.events.connect(user.id, res);
  }
}
