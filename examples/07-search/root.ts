import { BaseRootController, RouteElement, RoutesStructure } from "@aom-js/api";
import { Controller, OpenApi } from "@aom-js/router";
import { ComponentSchema } from "@aom-js/schemer";

export const docs = new OpenApi({ title: "Countries API", version: "1.0.0" });

@ComponentSchema()
class CountriesRoute extends RouteElement {}

@ComponentSchema()
class CountriesRoutes extends RoutesStructure<CountriesRoute> {}

@Controller()
export class ModuleRoot extends BaseRootController {
  static readonly RoutesStructure = CountriesRoutes;

  readonly RouteElement = CountriesRoute;

  readonly ident = "countries";

  readonly docs = docs;

  markersToRoute() {}
}
