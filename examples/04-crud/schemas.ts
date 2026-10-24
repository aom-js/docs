import { ComponentSchema, PartialType, PropertySchema } from "@aom-js/schemer";

@ComponentSchema({ description: "Данные страны" })
export class CountryBodyDTO {
  @PropertySchema.String({ minLength: 1, maxLength: 64, description: "Название" })
  name!: string;

  @PropertySchema.String({ minLength: 2, maxLength: 2, description: "Код ISO 3166-1" })
  isoCode!: string;
}

// правка — те же поля, но все необязательные
@ComponentSchema({ description: "Правка страны" })
export class CountryPartialBodyDTO extends PartialType(CountryBodyDTO) {}

@ComponentSchema({ description: "Страна" })
export class CountryDTO extends CountryBodyDTO {
  @PropertySchema.String({ description: "Идентификатор" })
  id!: string;
}
