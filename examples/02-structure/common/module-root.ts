import { BaseRootController, RouteElement, RoutesStructure } from "@aom-js/api";
import { Controller } from "@aom-js/router";
import { ComponentSchema } from "@aom-js/schemer";

@ComponentSchema()
class ModuleRoute extends RouteElement {}

@ComponentSchema()
class ModuleRoutes extends RoutesStructure<ModuleRoute> {}

/** Общий корень модулей: модулю остаётся задать `ident` и `docs`. */
@Controller()
export class ModuleRootController extends BaseRootController {
  static readonly RoutesStructure = ModuleRoutes;

  static readonly RouteElement = ModuleRoute;

  // у маршрутов пока нет своих маркеров — переносить в список нечего
  markersToRoute() {}
}
