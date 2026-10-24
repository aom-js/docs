import { Bridge, Controller, Router } from "@aom-js/router";

import { Hello } from "./hello";
import { docs, ModuleRoot } from "./root";

@Controller()
@Bridge("/", ModuleRoot)
@Bridge("/api", Hello)
class Index {}

export const router = new Router(Index, docs);
