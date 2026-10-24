import { Controller, OpenApi } from "@aom-js/router";

import { ModuleRootController } from "../../common/module-root";

export const docs = new OpenApi({ title: "References API", version: "1.0.0" });

@Controller()
export class ModuleRoot extends ModuleRootController {
  readonly ident = "references";

  readonly docs = docs;
}
