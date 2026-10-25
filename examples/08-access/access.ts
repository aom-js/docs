import { AomAccessCore, AomAccessMarkerElement, BaseAccessController } from "@aom-js/api";
import { Controller, Middleware, This } from "@aom-js/router";
import { ComponentSchema, PropertySchema } from "@aom-js/schemer";

import { CurrentUser } from "./current-user";
import { roles } from "./store";

/** типы полномочий: крупные категории маршрутов, внутри них доступ решают роли */
export enum Permissions {
  ADMIN = "admin",
}

@ComponentSchema()
export class AccessMarker extends AomAccessMarkerElement {
  @PropertySchema.Enum({ value: Permissions, isArray: true, description: "Типы полномочий" })
  accessTypes: Permissions[] = [];
}

@Controller()
export class AccessController extends BaseAccessController {
  static readonly MarkerName = "access";

  static readonly AllowedAccessTypes = Object.values(Permissions);

  static readonly AccessMarker = AccessMarker;

  static readonly AccessCore = AomAccessCore;

  // гранты ролей берутся только для этого модуля — имя то же, что `ident` корня
  moduleIdent = "notes";

  /** карта доступа текущего пользователя: его роль и действующие типы полномочий */
  @Middleware()
  static async Grant(@This() access: AccessController, @This(CurrentUser) { user }: CurrentUser) {
    access.generateAccessMap(AccessController.AllowedAccessTypes, [roles[user.role]]);
  }
}
