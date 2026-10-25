import { BaseRootController, RouteElement, RoutesStructure } from "@aom-js/api";
import { Controller, OpenApi } from "@aom-js/router";
import { ComponentSchema } from "@aom-js/schemer";

export const docs = new OpenApi({ title: "Library API", version: "1.0.0" });

// классы ответа корня: свои у каждого модуля, чтобы потом добавить в них поля (например, доступ)
@ComponentSchema()
class LibraryRoute extends RouteElement {}

@ComponentSchema()
class LibraryRoutes extends RoutesStructure<LibraryRoute> {}

/** Корень модуля: список маршрутов на `GET /`, документ на `GET /openapi.json`. */
@Controller()
export class ModuleRoot extends BaseRootController {
  static readonly RoutesStructure = LibraryRoutes;

  static readonly RouteElement = LibraryRoute;

  readonly ident = "library";

  readonly docs = docs;

  // у маршрутов этого модуля нет своих маркеров — переносить в список нечего
  markersToRoute() {}
}
