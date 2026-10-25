import { BaseRootController, RouteElement, RoutesStructure } from "@aom-js/api";
import { Controller, OpenApi, type MarkerType } from "@aom-js/router";
import { ComponentSchema, PropertySchema } from "@aom-js/schemer";

import { AccessController, AccessMarker } from "./access";

export const docs = new OpenApi({ title: "Notes API", version: "1.0.0" });

@ComponentSchema()
class NotesRoute extends RouteElement {
  @PropertySchema.Type({ value: () => AccessMarker, isOptional: true, description: "Требования доступа" })
  access?: AccessMarker;
}

@ComponentSchema()
class NotesRoutes extends RoutesStructure<NotesRoute> {}

@Controller()
export class ModuleRoot extends BaseRootController {
  static readonly RoutesStructure = NotesRoutes;

  static readonly RouteElement = NotesRoute;

  readonly ident = "notes";

  readonly docs = docs;

  // маркер доступа маршрута — в его строку списка: клиент видит, что маршрут требует прав
  markersToRoute(route: NotesRoute, markers: MarkerType) {
    route.access = markers[AccessController.MarkerName];
  }
}
