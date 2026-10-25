import { BaseRootController, RouteElement, RoutesStructure } from "@aom-js/api";
import { Controller, OpenApi } from "@aom-js/router";
import { ComponentSchema } from "@aom-js/schemer";

export const docs = new OpenApi({ title: "Greetings API", version: "1.0.0" });

// классы ответа корня: свои у каждого модуля, чтобы потом добавить в них поля (например, доступ)
@ComponentSchema()
class GreetingsRoute extends RouteElement {}

@ComponentSchema()
class GreetingsRoutes extends RoutesStructure<GreetingsRoute> {}

/** Корень модуля: список маршрутов на `GET /`, документ на `GET /openapi.json`. */
@Controller()
export class ModuleRoot extends BaseRootController {
  static readonly RoutesStructure = GreetingsRoutes;

  static readonly RouteElement = GreetingsRoute;

  readonly ident = "greetings";

  readonly docs = docs;

  // маркеров у маршрутов модуля пока нет; объявить метод нужно всё равно — базовый бросает ошибку
  markersToRoute() {}
}
