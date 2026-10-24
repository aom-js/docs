import { Bridge, Controller } from "@aom-js/router";

import { Cities } from "./cities";
import { Countries } from "./countries";

@Controller()
@Bridge("/countries", Countries)
@Bridge("/cities", Cities)
export class ReferencesRoutes {}
