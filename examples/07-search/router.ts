import { Bridge, Controller, Router } from "@aom-js/router";

import { docs, ModuleRoot } from "./root";
import { Countries } from "./routes";

@Controller()
@Bridge("/countries", Countries)
class Api {}

@Controller()
@Bridge("/", ModuleRoot)
@Bridge("/api", Api)
class Index {}

export const router = new Router(Index, docs);
