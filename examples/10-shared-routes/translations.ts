import { BodyBuilder, ConflictResponse } from "@aom-js/api";
import { Before, Controller, Get, Middleware, Post, Responses, This, Title } from "@aom-js/router";
import { ComponentSchema, PropertySchema } from "@aom-js/schemer";

import type { Translation } from "./store";

@ComponentSchema({ description: "Перевод названия" })
export class TranslationDTO {
  @PropertySchema.String({ minLength: 2, maxLength: 2, description: "Язык, код ISO 639-1" })
  locale!: string;

  @PropertySchema.String({ minLength: 1, maxLength: 64, description: "Название на этом языке" })
  name!: string;
}

@Controller()
export class TranslationBody extends BodyBuilder(TranslationDTO) {}

/**
 * Раздел «переводы названия» для любого ресурса. Маршруты и работа с переводами — здесь,
 * в одном экземпляре. Наследник перегружает только шаги-пустышки: `Setup` — чьи это
 * переводы, `Writable` — можно ли их сейчас менять.
 */
@Controller()
export class TranslationsBase {
  // запись, чьи это переводы: её кладёт `Setup` наследника
  owner: { translations: Translation[] };

  // параметры пустышек — `unknown` и `never[]`: тогда наследник объявляет у шага свои
  // параметры, и статическая сторона его класса остаётся совместимой с базой

  /** Пустышка: наследник кладёт в `owner` запись-владельца. */
  @Middleware()
  static async Setup(@This() self: unknown, ..._: never[]) {
    throw new Error(`${(self as object).constructor.name}: шаг Setup должен быть перегружен`);
  }

  /** Пустышка: проверка наследника перед записью; нет своих правил — пустой шаг. */
  @Middleware()
  static async Writable(@This() self: unknown, ..._: never[]) {
    throw new Error(`${(self as object).constructor.name}: шаг Writable должен быть перегружен`);
  }

  @Get("/")
  @Title("Переводы названия")
  @Before(TranslationsBase.Setup)
  static async Index(@This() { owner }: TranslationsBase) {
    return owner.translations;
  }

  @Post("/")
  @Title("Добавить перевод")
  @Responses(ConflictResponse.JSONSchema())
  @Before(TranslationsBase.Setup, TranslationsBase.Writable, TranslationBody.Body)
  static async Add(@This() { owner }: TranslationsBase, @This(TranslationBody) { body }: TranslationBody) {
    if (owner.translations.some((t) => t.locale === body.locale)) {
      throw new ConflictResponse("REFERENCES:TRANSLATION_EXISTS");
    }
    owner.translations.push(body); // здесь была бы вставка в базу
    return body;
  }
}
