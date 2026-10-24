import { Before, Bridge, Controller, OpenApi, Router } from "@aom-js/router";

import { Chat } from "./chat";
import { CurrentUser } from "./current-user";
import { Events } from "./events";

export const docs = new OpenApi({ title: "Events API", version: "1.0.0" });

/** обе точки — только для вошедших: классовый `@Before` наследуют все мосты */
@Controller()
@Before(CurrentUser.Required)
@Bridge("/", Chat)
@Bridge("/", Events)
class Index {}

export const router = new Router(Index, docs);
