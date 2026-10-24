import { NumberIDParam } from "@aom-js/api";
import { Controller } from "@aom-js/router";

// сегмент пути: `${BookID}` в шаблоне моста становится параметром `{bookId}` в документе OpenAPI
@Controller()
export class BookID extends NumberIDParam("bookId") {}
