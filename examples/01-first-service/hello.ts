import { Controller, Get, Query, Title } from "@aom-js/router";

@Controller()
export class Hello {
  @Get("/hello")
  @Title("Приветствие")
  static async Index(@Query() query: Record<string, string>) {
    return { hello: query.name ?? "world" };
  }
}
