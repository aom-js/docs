import { ComponentSchema, PartialType, PickType, PropertySchema } from "@aom-js/schemer";
import { Transform } from "class-transformer";
import { IsDefined } from "class-validator";

// обрезает только строки: число или null остаются как есть, и проверка типа их отвергнет
const Trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim() : value));

/** Страна в хранилище — то, что отдаёт API. */
@ComponentSchema({ description: "Страна" })
export class Country {
  @PropertySchema.String({ readOnly: true, description: "ID" })
  id!: string;

  // обрезка — в decorators: так её унаследуют тела из PickType и PartialType
  @PropertySchema.String({ minLength: 1, maxLength: 64, decorators: [Trim()], description: "Название" })
  name!: string;

  @PropertySchema.String({ minLength: 2, maxLength: 2, decorators: [Trim()], description: "Код ISO 3166" })
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

  @PropertySchema.String({ minLength: 1, maxLength: 64, decorators: [Trim()], description: "Название" })
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
  // без IsDefined вложенное поле можно не прислать вовсе: ValidateNested пропускает undefined
  @PropertySchema.Type({ value: () => CountryBodyDTO, decorators: [IsDefined()], description: "Страна" })
  country!: CountryBodyDTO;

  @PropertySchema.Type({
    value: () => CityBodyDTO,
    isArray: true,
    decorators: [IsDefined()],
    description: "Города",
  })
  cities!: CityBodyDTO[];
}
