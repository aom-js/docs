import { randomUUID } from "node:crypto";
import { Controller, DelayRefStack, Middleware, Nextpoint } from "@aom-js/router";
import { Responses, This, ThisRef, type OpenApiResponse, type RefFunction } from "@aom-js/router";
import { NotFoundResponse, NumberResponse, type ClassConstructor } from "@aom-js/api";

// ThisRef вызывает функцию с классом, через который подключён шаг. Тип RefFunction видит в нём
// любой класс, поэтому функцию с параметром «наш класс» приводим к RefFunction явно
const ListResponse = ThisRef(((ctor: typeof EntityController) => [
  Responses(ctor.JSONSchema(true)),
]) as RefFunction);

const ValueResponse = ThisRef(((ctor: typeof EntityController) => [
  Responses(ctor.JSONSchema()),
]) as RefFunction);

/**
 * Общий контроллер над хранилищем записей: наследник задаёт `store` и `schema`
 * и получает готовые шаги — список, счёт, 404, создание и ответ записью.
 */
@Controller()
export class EntityController<T extends { id: string } = { id: string }> {
  static store: Map<string, any>;

  static schema: ClassConstructor;

  value?: T;

  body: Partial<T> = {};

  @Nextpoint()
  @DelayRefStack(ListResponse)
  static async Data() {
    return [...this.store.values()]; // здесь был бы запрос к базе
  }

  @Nextpoint()
  @Responses(NumberResponse.JSONSchema("Число записей"))
  static async TotalCount() {
    return new NumberResponse(this.store.size); // здесь был бы count-запрос
  }

  /** Проверка значения: шаг загрузки положил в `value` пусто — ответ 404. */
  @Middleware()
  @Responses(NotFoundResponse.JSONSchema())
  static async Define(@This() self: EntityController) {
    if (!self.value) throw new NotFoundResponse("REFERENCES:RECORD_NOT_FOUND");
  }

  @Middleware()
  static async Create(@This() self: EntityController) {
    self.value = { ...self.body, id: randomUUID() };
    this.store.set(self.value.id, self.value); // здесь была бы вставка в базу
  }

  @Nextpoint()
  @DelayRefStack(ValueResponse)
  static async Value(@This() self: EntityController) {
    return self.value;
  }

  static JSONSchema(isArray = false): OpenApiResponse {
    return { status: 200, schema: this.schema, isArray, description: "Запись" };
  }
}
