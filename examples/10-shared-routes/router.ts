import { Bridge, Controller, OpenApi, Router } from "@aom-js/router";

import { Countries } from "./countries";

export const docs = new OpenApi({ title: "Countries API", version: "1.0.0" });

@Controller()
@Bridge("/countries", Countries)
class Index {}

export const router = new Router(Index, docs);
