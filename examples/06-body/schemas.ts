import { TransformTrim } from "@aom-js/api";
import { ComponentSchema, PartialType, PickType, PropertySchema } from "@aom-js/schemer";

/** Страна в хранилище — то, что отдаёт API. */
@ComponentSchema({ description: "Страна" })
export class Country {
  @PropertySchema.String({ readOnly: true, description: "ID" })
  id!: string;

  // обрезка — в decorators: так её унаследуют тела из PickType и PartialType
  @PropertySchema.String({ minLength: 1, maxLength: 64, decorators: [TransformTrim()], description: "Название" })
  name!: string;

  @PropertySchema.String({ minLength: 2, maxLength: 2, decorators: [TransformTrim()], description: "Код ISO 3166" })
  isoCode!: string;

  @PropertySchema.Boolean({ isOptional: true, description: "Показывать в списках" })
  enabled?: boolean;
}

/** Город в хранилище. */
@ComponentSchema({ description: "Город" })
export class City {
  @PropertySchema.String({ readOnly: true, description: "ID" })
  id!: string;

  @PropertySchema.String({ readOnly: true, description: "ID страны" })
  countryId!: string;

  @PropertySchema.String({ minLength: 1, maxLength: 64, decorators: [TransformTrim()], description: "Название" })
  name!: string;

  @PropertySchema.Number({ minValue: 0, isOptional: true, description: "Население" })
  population?: number;
}

// тела запросов собираются из схем хранилища, а не переписываются: id задаёт сервер, клиенту его не передать
@ComponentSchema({ description: "Новая страна" })
export class CountryBodyDTO extends PickType(Country, ["name", "isoCode", "enabled"]) {}

@ComponentSchema({ description: "Правка страны: любые поля новой страны" })
export class CountryPartialBodyDTO extends PartialType(CountryBodyDTO) {}

@ComponentSchema({ description: "Новый город" })
export class CityBodyDTO extends PickType(City, ["name", "population"]) {}

/** Составное тело: страна и её города, каждая часть — по своей схеме. */
@ComponentSchema({ description: "Страна вместе с городами" })
export class CountryWithCitiesDTO {
  @PropertySchema.Type({ value: () => CountryBodyDTO, description: "Страна" })
  country!: CountryBodyDTO;

  @PropertySchema.Type({ value: () => CityBodyDTO, isArray: true, description: "Города" })
  cities!: CityBodyDTO[];
}
