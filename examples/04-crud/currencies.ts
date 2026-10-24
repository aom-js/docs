import { After, Before, Bridge, Controller, Get, Middleware, Next, Post, This, Title } from "@aom-js/router";
import { BodyBuilder, UUIDParam } from "@aom-js/api";
import { ComponentSchema, PropertySchema } from "@aom-js/schemer";

import { EntityController } from "./entity";
import { currencies } from "./store";

@ComponentSchema({ description: "Данные валюты" })
export class CurrencyBodyDTO {
  @PropertySchema.String({ minLength: 3, maxLength: 3, description: "Код ISO 4217" })
  code!: string;

  @PropertySchema.String({ minLength: 1, maxLength: 64, description: "Название" })
  name!: string;
}

@ComponentSchema({ description: "Валюта" })
export class CurrencyDTO extends CurrencyBodyDTO {
  @PropertySchema.String({ description: "Идентификатор" })
  id!: string;
}

@Controller()
export class CurrencyID extends UUIDParam("currencyId") {}

@Controller()
export class CurrencyBody extends BodyBuilder(CurrencyBodyDTO) {}

/** Общий контроллер, привязанный к валютам, и загрузка валюты по id. */
@Controller()
export class CurrencyValue extends EntityController<CurrencyDTO> {
  static store = currencies;

  static schema = CurrencyDTO;

  @Middleware()
  @Before(CurrencyID.PathID)
  @After(CurrencyValue.Define)
  static async Init(@This() self: CurrencyValue, @This(CurrencyID) { value }: CurrencyID) {
    self.value = this.store.get(value); // здесь был бы запрос к базе по id
  }
}

// маршруты только связывают готовые шаги
@Controller()
@Before(CurrencyValue.Init)
export class Currency {
  @Get("/")
  @Title("Информация о валюте")
  @Next(CurrencyValue.Value)
  static async Index() {}
}

@Controller()
@Bridge(`/${CurrencyID}`, Currency)
export class Currencies {
  @Get("/")
  @Title("Список валют")
  @Next(CurrencyValue.Data)
  static async Index() {}

  @Get("/total")
  @Title("Число валют")
  @Next(CurrencyValue.TotalCount)
  static async Total() {}

  @Post("/")
  @Title("Добавить валюту")
  @Before(CurrencyBody.Body)
  @After(CurrencyValue.Create)
  @Next(CurrencyValue.Value)
  static async Add(@This(CurrencyBody) { body }: CurrencyBody, @This(CurrencyValue) currency: CurrencyValue) {
    currency.body = body;
  }
}
