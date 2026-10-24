import { AuthHeaderToken, AuthRequiredResponse } from "@aom-js/api";
import { After, Before, Controller, Middleware, Responses, This } from "@aom-js/router";

import { tokens, type User } from "./store";

@Controller()
export class CurrentUser {
  user!: User;

  /** шаг «кто спрашивает»: токен из заголовка, затем пользователь по нему */
  @Middleware()
  @Before(AuthHeaderToken.Required)
  @After(CurrentUser.Init)
  static async Required() {}

  @Middleware()
  @Responses(AuthRequiredResponse.JSONSchema())
  static async Init(@This(AuthHeaderToken) token: AuthHeaderToken, @This() self: CurrentUser) {
    const user = tokens.get(token.value);
    if (!user) throw new AuthRequiredResponse("CHAT:TOKEN_INVALID");
    self.user = user;
  }
}
