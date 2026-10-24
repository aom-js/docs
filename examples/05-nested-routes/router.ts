import { Logger } from "@aom-js/api";
import { Before, Bridge, Controller, OpenApi, Router } from "@aom-js/router";

import { Countries } from "./countries";
import "./log";

export const docs = new OpenApi({ title: "Countries API", version: "1.0.0" });

// журнал — первый шаг корня: он есть у каждого маршрута дерева
@Controller()
@Before(Logger.Init)
@Bridge("/countries", Countries)
class Index {}

export const router = new Router(Index, docs);
