import { QueryStringBuilder, TransformToArray, TransformTrim } from "@aom-js/api";
import { Controller } from "@aom-js/router";
import { ComponentSchema, PropertySchema } from "@aom-js/schemer";

@ComponentSchema({ description: "Фильтр списка стран" })
export class CountriesFilter {
  @PropertySchema.String({
    isOptional: true,
    decorators: [TransformTrim()],
    description: "Часть названия, без учёта регистра",
  })
  search?: string;

  @PropertySchema.Boolean({ isOptional: true, description: "true — только активные, false — только выключенные" })
  active?: boolean;

  // TransformToArray делит строку по запятым, потом Number приводит и проверяет каждый элемент
  @PropertySchema.Number({
    isArray: true,
    isOptional: true,
    decorators: [TransformToArray()],
    description: "ID стран: ?ids=1&ids=2 или ?ids=1,2",
  })
  ids?: number[];
}

@Controller()
export class CountriesFilterQuery extends QueryStringBuilder(CountriesFilter) {}

export enum CountriesSort {
  id = "id",
  idDesc = "-id",
  name = "name",
  nameDesc = "-name",
}

@ComponentSchema({ description: "Страница списка и её порядок" })
export class Pager {
  // default пишет значение только в документ OpenAPI, а в запрос его подставляет инициализатор поля
  @PropertySchema.Number({
    isOptional: true,
    minValue: 1,
    maxValue: 100,
    default: 20,
    description: "Сколько записей отдать",
  })
  limit = 20;

  @PropertySchema.Number({ isOptional: true, minValue: 0, default: 0, description: "Сколько записей пропустить" })
  offset = 0;

  @PropertySchema.Enum({
    value: CountriesSort,
    isOptional: true,
    default: CountriesSort.id,
    description: "Поле сортировки, «-» — по убыванию",
  })
  sort = CountriesSort.id;
}

@Controller()
export class QueryStringPager extends QueryStringBuilder(Pager) {}
