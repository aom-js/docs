import { Bridge, Controller, Router } from "@aom-js/router";

import { docs, ModuleRoot } from "./init";
import { ReferencesRoutes } from "./routes";

@Controller()
@Bridge("/", ModuleRoot)
@Bridge("/api", ReferencesRoutes)
class Index {}

export const router = new Router(Index, docs);
