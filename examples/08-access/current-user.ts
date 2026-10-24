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
    const user = tokens.get(token.value); // здесь был бы запрос к таблице токенов
    // неизвестный токен и заблокированный пользователь — один и тот же 401
    if (!user?.enabled) throw new AuthRequiredResponse("NOTES:WRONG_TOKEN");
    self.user = user;
  }
}
