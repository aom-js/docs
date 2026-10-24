import { Bridge, Controller, OpenApi, Router } from "@aom-js/router";

import { Currencies } from "./currencies";
import { Countries } from "./routes";

export const docs = new OpenApi({ title: "References API", version: "1.0.0" });

@Controller()
@Bridge("/countries", Countries)
@Bridge("/currencies", Currencies)
class Index {}

export const router = new Router(Index, docs);
