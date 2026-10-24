import { Before, Bridge, Controller, Get, Router, This, Title } from "@aom-js/router";

import { AccessController } from "./access";
import { CurrentUser } from "./current-user";
import { Notes } from "./notes";
import { docs, ModuleRoot } from "./root";

/** всё под `/api` — только для вошедших: классовый `@Before` наследуют все мосты */
@Controller()
@Before(AccessController.Init, CurrentUser.Required, AccessController.Grant)
@Bridge("/notes", Notes)
class Api {
  @Get("/me")
  @Title("Текущий пользователь")
  static async Me(@This(CurrentUser) { user }: CurrentUser) {
    return user;
  }
}

@Controller()
@Bridge("/", ModuleRoot)
@Bridge("/api", Api)
class Index {}

export const router = new Router(Index, docs);
