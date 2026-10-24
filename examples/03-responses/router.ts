import { Bridge, Controller, Router } from "@aom-js/router";

import { Books } from "./books";
import { docs, ModuleRoot } from "./root";

@Controller()
@Bridge("/books", Books)
class Api {}

@Controller()
@Bridge("/", ModuleRoot)
@Bridge("/api", Api)
class Index {}

export const router = new Router(Index, docs);
