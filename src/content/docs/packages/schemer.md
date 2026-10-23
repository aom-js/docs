---
title: "@aom-js/schemer"
sidebar:
  label: "@aom-js/schemer"
  order: 2
---

Пакет описания DTO: компонент-схемы (`@ComponentSchema`), описания свойств (`PropertySchema.*`), mapped-types, рендер JSON Schema, сборщик `$ref`-каскада и собственный формат свёртки схем для кодогенерации (`foldSchemas`). Единственное место комплекта, где перечислены параметры фабрик свойств и набор библиотечных декораторов, который каждая фабрика навешивает.
Читать до: [`@aom-js/core`](core.md) (мета-класс, фазы, наследование метаданных). Читать после: [`@aom-js/router`](router.md) (сборка OpenAPI), [`@aom-js/api`](api.md) (билдеры и `SafeData`).

## Назначение и место в стеке

Пакет строит DTO-слой поверх трёх библиотек: `class-validator` (валидация), `class-transformer` (приведение и исключение полей), `class-validator-jsonschema` (рендер JSON Schema). Собственного рендерера у пакета нет; его вклад — декларативный слой над этими библиотеками на базе мета-класса `AomSchemas extends AomCore`. Класс помечается `@ComponentSchema(params?)`, свойства — фабриками `PropertySchema.String/Number/Boolean/Date/Enum/Any/Type({...})`. Каждая фабрика сохраняет «сырые параметры» (`$.schemaName`, `$.schemaParams`) в узле свойства и в фазе LAST навешивает набор библиотечных декораторов. Сырые параметры — то, ради чего слой существует: они позволяют пересобрать класс (mapped-types), прочитать описание свойства извне (`ParamsBuilder` в `@aom-js/api`) и свернуть схему в собственный сериализуемый формат для кодогенерации (`foldSchemas`).

Зависимости: `@aom-js/core` (реестр метаданных и фабрики декораторов) + три перечисленные библиотеки. Потребители внутри ядра: `@aom-js/router` — `SchemasCollector` наполняет `components.schemas` документа OpenAPI (`packages/router/src/classes/openapi.ts` (`OpenApi.collector`, `OpenApi.toJSON`)); `@aom-js/api` — `Schemer.validate` внутри `SafeData` и `Schemer.render` внутри `plainJsonSchema` (`packages/api/src/decorators/safe-data.ts` (`SafeData`), `packages/api/src/functions/json-schema.ts` (`plainJsonSchema`)); `@aom-js/transfer` — сбор компонент в дескриптор изолятора через `SchemasCollector` и `foldSchemas` (`packages/transfer/src/defines/decorators.ts` (`distribute`)); `@aom-js/codegen` — восстановление классов из собственного формата свёртки, использует `SCALAR_TYPE_SCHEMAS`, `PropertySchema` и `isFoldedValidatorName` (`packages/codegen/src/defines/emit-schemas.ts` (`emitSchemas`)).

Полный граф пакетов и схема сборки монорепо — [Архитектура ядра](../architecture.md).

## Публичный API

### Декораторы и фабрики

| Экспорт           | Сигнатура                                                                                                                     | Назначение                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ComponentSchema` | `ComponentSchema(params?: ClassDescriptionsProperties): ClassDecorator`                                                       | Помечает класс компонент-схемой: поднимается по цепочке прототипов до ближайшего компонента-предка включительно (недекорированные промежуточные классы это не блокирует — их собственные `PropertySchema` тоже переносятся), вешает `JSONSchema(schema)` на класс, где `schema` — `params` без поля `decorators`, применяет отложенные `PropertySchema`, затем `params.decorators` |
| `PropertySchema`  | `{ String(p: StringDescriptionsProperties): PropertyDecorator; Number(p); Boolean(p); Date(p); Enum<T>(p); Any(p); Type(p) }` | Семь фабрик описания свойства; ключи объекта — значения `SchemaTypes`                                                                                                                                                                                                                                                                                                              |

`params` у `ComponentSchema` — `ClassDescriptionsProperties`, то есть `{ description?, deprecated?, decorators? }` (`packages/schemer/src/defines/types.ts` (`ClassDescriptionsProperties`)); поля переименования нет, имя компонента — всегда `target.name`.

### Классы

| Экспорт               | Сигнатура                                                                                                                                                                                                                                         | Назначение                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Schemer`             | `new Schemer(refPointerPrefix: string)`; `render(target): SchemaObject`; `validate<T>(ctor: T, data: object): { values, errors }`                                                                                                                 | Рендер JSON Schema класса с заданным префиксом `$ref` и валидация plain-данных                                                                                                        |
| `SchemasCollector`    | `new SchemasCollector(schemer: Schemer)`; `readonly components: Map<string, any>`; `readonly classes: Map<string, ClassType>`; `extract(schema: any): any`                                                                                        | Превращает компонент-класс в `{$ref}` и рекурсивно складывает рендеры связанных схем в `components`; `classes` хранит сами классы за именами компонентов — источник для `foldSchemas` |
| `AomSchemas`          | `class AomSchemas extends AomCore { properties: Set<Property>; connections: Map<Property, ConnectionSchema>; isComponentSchema: boolean; schemaName?; schemaParams?; componentParams?: ClassDescriptionsProperties; mapped?: {kind, of, keys?} }` | Мета-класс схем; `AomSchemas.checkExists(Class)` — способ узнать, компонент ли класс, и прочитать сырые параметры; `mapped` помечает анонимные классы, порождённые mapped-хелперами   |
| `isComponentAncestor` | `isComponentAncestor($: AomSchemas \| undefined): boolean`                                                                                                                                                                                        | `!!$?.isComponentSchema` — граница подъёма по цепочке прототипов, общая для `ComponentSchema.inherit` и `foldSchemas.extends`                                                         |

### Свёртка схем для кодогенерации (`foldSchemas`)

| Экспорт                                                                             | Сигнатура                                                                                                                       | Назначение                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foldSchemas`                                                                       | `foldSchemas(roots: Iterable<ClassType>): FoldedSchemas`                                                                        | Сворачивает компонент-классы (и всё, до чего они дотягиваются через `Type`/`extends`) в сериализуемую структуру `{factory, params}` на свойство — без потерь при развёртке обратно в декораторы (`@aom-js/codegen`)                                |
| `isFoldedValidatorName`                                                             | `isFoldedValidatorName(name: string): boolean`                                                                                  | true, если имя — экспорт `class-validator`, который свёртка вообще может положить в `$validator`                                                                                                                                                   |
| `FoldedSchemas`, `FoldedComponent`, `FoldedProperty`, `FoldedParent`, `FoldedValue` | `packages/schemer/src/defines/folding.ts` (`FoldedSchemas`, `FoldedComponent`, `FoldedProperty`, `FoldedParent`, `FoldedValue`) | Типы результата: `{format: 1, components, enums}`; на компонент — `{params?, extends?, properties}`; `extends` — либо имя родителя-компонента, либо `{$mapped: "Pick"\|"Omit"\|"Partial"\|"Intersection", of, keys?}` для анонимных mapped-классов |

`foldSchemas` требует, чтобы каждый узел графа (корень, цель `Type`, родитель по `extends`) был либо именованным `@ComponentSchema`-классом, либо мог быть развёрнут структурно как mapped-класс; анонимный mapped-класс, использованный напрямую как корень или как цель `Type`, вызывает явную ошибку с текстом вида `PickType(User, ["id"])` (`packages/schemer/src/defines/folding.ts` (`resolveRef`, `foldComponent`)). Свойство, чей декоратор не восстанавливается однозначно (не `class-validator`, собственный `registerDecorator`, `Transform`/`ValidateIf`, message-функция, несколько метаданных сразу), молча пропускается (`folding.ts` (`foldDecorator`, `foldDecorators`)).

### Mapped-types

| Экспорт            | Сигнатура                                                                                   | Назначение                                                   |
| ------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `PartialType`      | `PartialType<T>(classRef: Type<T>): MappedType<RemoveFieldsWithType<Partial<T>, Function>>` | Новый компонент, все свойства исходного с `isOptional: true` |
| `PickType`         | `PickType<T, K extends keyof T>(classRef: Type<T>, keys: readonly K[])`                     | Новый компонент только с выбранными свойствами               |
| `OmitType`         | `OmitType<T, K extends keyof T>(classRef: Type<T>, keys: readonly K[])`                     | Новый компонент без указанных свойств                        |
| `IntersectionType` | `IntersectionType<T extends Type[]>(...classRefs: T)`                                       | Объединение свойств нескольких компонент                     |
| `MappedType<T>`    | `interface MappedType<T> extends Type<T> { new (): T }`                                     | Тип результата mapped-types                                  |

### Типы и словари

| Экспорт                                                                                                         | Сигнатура                                                                                                                                                 | Назначение                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `SchemaTypes`                                                                                                   | `enum { STRING='String', DATE='Date', NUMBER='Number', BOOLEAN='Boolean', ENUM='Enum', ANY='Any', TYPE='Type' }`                                          | Идентификаторы фабрик; они же ключи `PropertySchema` и значение `$.schemaName`                                                        |
| `SCALAR_TYPE_SCHEMAS`                                                                                           | `Record<string, Record<string, any>>` — `string / number / integer / boolean / date`                                                                      | Словарь скаляров по имени для `@TopicSchema` (transfer) и codegen; `date` — `oneOf` двух форматов, как рендерит `PropertySchema.Date` |
| `CommonDescriptionsProperties`, `ClassDescriptionsProperties`, `BaseDescriptionsProperties`, `ConnectionSchema` | `packages/schemer/src/defines/types.ts` (`CommonDescriptionsProperties`, `ClassDescriptionsProperties`, `BaseDescriptionsProperties`, `ConnectionSchema`) | Типы параметров декораторов; `ConnectionSchema = () => ClassConstructor`                                                              |

Не экспортируются, но важны: `decorateProperty(decorators, target, property)` (`packages/schemer/src/defines/properties.ts` (`decorateProperty`)) — `Reflect.decorate` с фильтрацией `undefined`/`false` через `.filter(Boolean)`. Интерфейсы параметров фабрик (`StringDescriptionsProperties` и остальные шесть, включая `enumName?: string` у `EnumDescriptionsProperties`) объявлены через `declare interface` внутри `properties.ts` и наружу тоже не выходят. `Type<T>` (`packages/schemer/src/defines/mapped-types/type.interface.ts` (`Type`)) и `RemoveFieldsWithType` (`packages/schemer/src/defines/mapped-types/types/remove-fields-with-type.type.ts` (`RemoveFieldsWithType`)) наружу не выходят: `mapped-types/index.ts` реэкспортирует только `mapped-type.interface` и четыре helper'а, поэтому в сигнатурах mapped-types эти типы видны, а импортировать их из `@aom-js/schemer` нельзя.

`IsNullable(opts)` экспортируется публично: `packages/schemer/src/defines/helpers/is-nullable.ts` (`IsNullable`) попадает в пакет через `export * from "./defines/helpers"` в `src/index.ts`, где `helpers/index.ts` реэкспортирует только `is-nullable`. У `@aom-js/api` своя копия того же декоратора (`packages/api/src/decorators/is-nullable.ts` (`IsNullable`)).

## Внутренние модули

| Файл                                                       | Ответственность                                                                                                                                                                              | Ключевые символы                                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/index.ts`                                             | Точка входа: `import "reflect-metadata"` и реэкспорт `decorators`, `types`, `module`, `collector`, `folding`, `PropertySchema`, `mapped-types`, `helpers`                                    | —                                                                                                         |
| `src/defines/module.ts`                                    | Мета-класс `AomSchemas`, `isComponentAncestor` и класс `Schemer` (`render`/`validate`)                                                                                                       | `AomSchemas`, `Schemer`, `isComponentAncestor`                                                            |
| `src/defines/decorators.ts`                                | `ComponentSchema` — классовый декоратор фазы INSTANT: подъём до ближайшего компонента-предка → `JSONSchema` → `apply()` → `params.decorators`                                                  | `ComponentSchema`                                                                                         |
| `src/defines/properties.ts`                                | Семь фабрик `PropertySchema.*`, их интерфейсы параметров, `decorateProperty` и `checkExistsSchemaParams` (защита от двойного описания + регистрация свойства в `root.properties`)            | `PropertySchema`, `_String`, `_Number`, `_Boolean`, `_Any`, `_Enum`, `_Date`, `_Type`, `decorateProperty` |
| `src/defines/types.ts`                                     | Типы параметров и `enum SchemaTypes`                                                                                                                                                         | `SchemaTypes`, `CommonDescriptionsProperties`, `ClassDescriptionsProperties`                              |
| `src/defines/collector.ts`                                 | `SchemasCollector.extract` и словари скаляров: `SCALAR_SCHEMAS` (по конструктору, приватный, берёт записи из `SCALAR_TYPE_SCHEMAS`) / `SCALAR_TYPE_SCHEMAS` (по имени, публичный)          | `SchemasCollector`, `SCALAR_TYPE_SCHEMAS`                                                                 |
| `src/defines/folding.ts`                                   | `foldSchemas` и типы `Folded*`: собственный формат свёртки схем для кодогенерации                                        | `foldSchemas`, `isFoldedValidatorName`, `FoldedSchemas`                                                   |
| `src/defines/helpers/`                                     | `IsNullable` (обёртка над `ValidateIf(value !== null)`)                                                                                                                                      | `IsNullable`                                                                                              |
| `src/defines/mapped-types/`                                | Четыре helper-функции пересборки схемы плюс интерфейсы `Type`, `MappedType`, `RemoveFieldsWithType`; каждый помечает результат `AomSchemas.instance(NewClass).mapped = {...}`                | `PartialType`, `PickType`, `OmitType`, `IntersectionType`                                                 |
| `src/defines/class-transformer-cjs-storage.d.ts`           | Ambient-объявление подпути `"class-transformer/cjs/storage.js"` (у библиотеки нет объявления типов для него)                                                                                            | `defaultMetadataStorage`                                                                                  |
| `package.json`, `package.src.json`, `tsconfig.build*.json` | Манифесты и три конфигурации сборки (cjs/mjs/types)                                                                                                                                          | —                                                                                                         |

## Ключевые механизмы

### Двухфазное декорирование (LAST внутри INSTANT)

Фабрики свойств возвращают `AomSchemas.propertyDecorator(handler, ExecutionPhase.LAST)`. Для фазы LAST очередь узла отложенная (`packages/core/src/defines/callstack.ts` (`AomCallstackQueue.constructor`)), поэтому в момент декорирования свойства не выполняется ничего: вызов только кладётся в очередь (`packages/core/src/defines/callstack.ts` (`AomCallstackQueue.add`), фабрика — `packages/core/src/defines/core.ts` (`AomCore.propertyDecorator`)). `ComponentSchema` — классовый декоратор фазы INSTANT (`core.ts` (`AomCore.classDecorator`)), и именно он разбирает очереди: сначала поднимается по цепочке прототипов до ближайшего компонента-предка включительно, вызывая `$._.inherit(parent)` на каждом промежуточном классе, затем `JSONSchema(schema)` на класс, затем `$._.apply()` (обход `properties`/`statics`/`origins` с прогоном их callstack — `core.ts` (`AomNode.apply`)), и только после этого `params.decorators`.

`packages/schemer/src/defines/decorators.ts` (`ComponentSchema`):

```ts
export function ComponentSchema(params?: ClassDescriptionsProperties): ClassDecorator {
  return AomSchemas.classDecorator(($: AomSchemas) => {
    $.isComponentSchema = true;
    // поднимаемся до ближайшей @ComponentSchema включительно, а не только до прямого родителя
    let parent: ClassType = Object.getPrototypeOf($._.target);
    while (typeof parent === "function" && parent !== Function.prototype) {
      if (isComponentAncestor($._.inherit(parent))) break;
      parent = Object.getPrototypeOf(parent);
    }

    if (params) {
      $.componentParams = params;
      const { decorators: _decorators, ...schema } = params;
      Reflect.decorate([JSONSchema(schema)], $._.target);
    }

    $._.apply();
    Reflect.decorate(params?.decorators || [], $._.target);
  }, ExecutionPhase.INSTANT);
}
```

Следствие: класс с `PropertySchema`, но без `@ComponentSchema`, — полный no-op: `schemer.render(NoComp)` даёт `{}`, а `validateSync(plainToInstance(NoComp, {x: "a"}))` — единственную ошибку `unknownValue`, потому что на прототип не попал ни один валидатор.

### Сырые параметры в узле AomSchemas

Handler каждой фабрики выполняет одну и ту же преамбулу: `checkExistsSchemaParams($)` (бросает `<Class>.<prop> already has defined schema params`, если параметры уже заданы, иначе добавляет свойство в `$._.root.properties`), затем `$.schemaName = SchemaTypes.X` и `$.schemaParams = params`. `PropertySchema.Type` дополнительно кладёт ленивую ссылку в `$._.root.connections`.

`packages/schemer/src/defines/properties.ts` (`checkExistsSchemaParams`):

```ts
function checkExistsSchemaParams($: AomSchemas) {
  if ($.schemaParams) {
    throw new Error(`${$._.target.name}.${String($._.property)} already has defined schema params`);
  }
  $._.root.properties.add($._.property!);
}
```

`properties` содержит все свойства с `PropertySchema`, включая `hidden`; `connections` — только свойства с `Type`. Эти два поля плюс `schemaName`/`schemaParams` — единственный источник для mapped-types, для каскада `SchemasCollector`, для `foldSchemas` и для `ParamsBuilder`, который требует ровно одно свойство: `packages/api/src/builders/params.ts` (`ParamsBuilder`).

### Набор библиотечных декораторов по типу

Каждая фабрика собирает массив декораторов (с `undefined` на месте невыполненных условий) и передаёт его в `decorateProperty`, который фильтрует пустые значения через `.filter(Boolean)` (`packages/schemer/src/defines/properties.ts` (`decorateProperty`)). Числовые ограничения проверяются через `!= null`, а не на truthy — поэтому `0` не теряется.

| Фабрика   | class-validator                                                                                              | class-transformer                                                                            | JSONSchema-ключи                                                                   | Особые параметры                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `String`  | `IsString(each/message/groups/always)`; `IsOptional?`; `MaxLength?`; `MinLength?`; `Matches?`; `IsNullable?` | `Exclude?` (`hidden`)                                                                        | `description`; `deprecated`; `nullable`; `default`; `examples`; `readOnly`         | `minLength`/`maxLength`/`pattern` — с `each: isArray`; `pattern` применяется через `Matches`, но в саму JSON Schema не попадает;       `default`; `decorators` применяются |
| `Number`  | `IsNumber({maxDecimalPlaces}, {each/message/groups/always})`; `IsOptional?`; `Max?`; `Min?`; `IsNullable?`   | `Exclude?`; `Transform(value → null при nullable, иначе Number(value))`                      | те же шесть                                                                        | `minValue`/`maxValue` — с `each: isArray`; `maxDecimalPlaces`; `default`; `decorators` применяются                                                                          |
| `Boolean` | `IsBoolean(...)`; `IsOptional?`; `IsNullable?`                                                               | `Exclude?`; `Transform('true'→true, 'false'→false, boolean как есть, иначе Boolean(+value))` | те же шесть                                                                        | `default`; `decorators` применяются                                                                                                                                         |
| `Any`     | `Allow(...)`; `IsOptional?`; `IsNullable?`                                                                   | `Exclude?`                                                                                   | те же шесть                                                                        | `default`; `decorators` применяются                                                                                                                                         |
| `Enum`    | `IsEnum(params.value, ...)`; `IsOptional?`; `IsNullable?`                                                    | `Exclude?`                                                                                   | те же шесть, включая `readOnly`                                                    | `value` (объект enum); `enumName?` (только для кодогенерации, в JSON Schema не попадает); `default`; `decorators` применяются                                               |
| `Date`    | `IsDate(...)`; `MaxDate?`/`MinDate?` (с `each: isArray`); `IsOptional?`; `IsNullable?`                       | `Exclude?`; `Transform(value → null при nullable, иначе new Date(value))`                    | те же шесть, включая `readOnly`                                                    | `minDate`; `maxDate`; `default`; `decorators` применяются                                                                                                                   |
| `Type`    | `ValidateNested({each: isArray, ...})`; `IsOptional?`; `IsNullable?`                                         | `Type(params.value)`; `Exclude?`                                                             | `description`; `deprecated`; `nullable`; `readOnly` — **без `default`/`examples`** | `value: () => Class`; `decorators` применяются                                                                                                                              |

Столбец «Особые параметры» перечисляет поля сверх `CommonDescriptionsProperties` (`nullable`, `examples`, `isOptional`, `hidden`, `readOnly`, `isArray`, `message`, `groups`, `always`, `decorators` — `packages/schemer/src/defines/types.ts` (`CommonDescriptionsProperties`)). `TypeDescriptionsProperties` не объявляет собственного `default`, а `examples` из общего интерфейса в `JSONSchema` у `Type` не передаётся (см. §«Ограничения»).

### Наследование схем через inherit

`ComponentSchema` поднимается по цепочке прототипов до ближайшего компонента-предка **включительно**, вызывая `$._.inherit(parent)` на каждом классе по пути — включая недекорированные промежуточные классы без `@ComponentSchema`, у которых при этом могут быть собственные `PropertySchema`. Без этого недекорированный промежуточный класс между двумя `@ComponentSchema`-классами сам ничего не наследовал бы, и `targetConstructorToSchema`, поднимаясь по цепочке прототипов, отдал бы `description`/свойства дальнего предка-компонента вместо свойств потомка. Если у класса вовсе нет предка (`Object.getPrototypeOf(target) === Function.prototype`), цикл не выполняется ни разу — `inherit(Function.prototype)` не вызывается, и пустой узел реестра для `Function.prototype` не создаётся. Ядро переносит callstack родителя на потомка и для каждого `origin` родителя, свойство которого потомок не объявил сам (двойная проверка: `Object.hasOwn` плюс реестр `AomSchemas`), создаёт узел свойства потомка и переносит туда LAST-очередь (`packages/core/src/defines/node.ts` (`AomNode.inherit`)). То есть `PropertySchema` родителя (и любого промежуточного класса) повторно навешивается на прототип потомка — у потомка собственные метаданные валидатора, а не заимствованные по цепочке прототипов. Благодаря этому работает и `class Ext extends Base`, и `class X extends PickType(...) {}`, и цепочка из нескольких недекорированных классов подряд (`class Child extends Mid2 {}`, `class Mid2 extends Mid1 {}`, `class Mid1 extends Base {}`).

Свойство, переопределённое потомком собственным `PropertySchema`, родительский декоратор не получает — иначе сработала бы защита `checkExistsSchemaParams`. Например, `class C1 extends B1` с `@PropertySchema.Number({minValue: 3})` поверх родительского `String({minLength: 5})` рендерится как `{"v":{"minimum":3,"type":"number"}}`.

### Mapped-types: пересборка из origins

Все четыре helper'а работают одинаково: создают `abstract class` с фиксированным именем, проверяют `AomSchemas.checkExists(classRef)?.isComponentSchema` (иначе `throw <Name> parent class is not ComponentSchema constructor`), обходят `$classInstance._.origins`, берут `origin.self.{schemaName, schemaParams}` и вызывают `Reflect.decorate([PropertySchema[schemaName](schemaParams)], target, origin.property)`, где `target` — сам класс или его прототип в зависимости от `origin.target === origin._.target`. В конце — `Reflect.decorate([ComponentSchema()], NewClass)`, поэтому результат сам является компонент-схемой (и `connections` пересоздаются, т.к. `Type` вызывается заново). Дополнительно каждый helper помечает результат через `AomSchemas.instance(NewClass).mapped = { kind: "Pick"|"Omit"|"Partial"|"Intersection", of: [...], keys? }` — это не влияет на JSON Schema, но `foldSchemas` использует эту метку, чтобы развернуть анонимный класс в структуру `extends` вместо ссылки по имени.

`packages/schemer/src/defines/mapped-types/partial-type.helper.ts` (`PartialType`):

```ts
export function PartialType<T>(classRef: Type<T>) {
  abstract class PartialClassType {}
  // ...
  AomSchemas.instance(PartialClassType).mapped = { kind: "Partial", of: [classRef] };

  $classInstance._.origins.forEach((origin) => {
    const { schemaName, schemaParams } = origin.self;
    if (schemaName && schemaParams) {
      const isClassOrigin = origin.target === origin._.target;
      const target = isClassOrigin ? PartialClassType : PartialClassType.prototype;
      Reflect.decorate(
        [
          Reflect.apply(PropertySchema[schemaName], undefined, [
            { ...schemaParams, isOptional: true },
          ]),
        ],
        target,
        origin.property,
      );
    }
  });

  Reflect.decorate([ComponentSchema()], PartialClassType);
  return PartialClassType as MappedType<RemoveFieldsWithType<Partial<T>, Function>>;
}
```

Свойство без `schemaName`/`schemaParams` (описанное «голыми» декораторами class-validator) в новый класс не переносится — молча. `IntersectionType` копит свойства в двух `Map` (класс и прототип), поэтому при совпадении имён побеждает последний переданный класс: `IntersectionType(E1, E2)`, где `E1.x` — строка, а `E2.x` — число, даёт `{"x":{"type":"number"}}`. Составимость работает: `PartialType(PartialType(A))` и `PartialType(OmitType(...))` возвращают полный набор свойств, а `foldSchemas` разворачивает вложенные mapped-types рекурсивно (`Intersection(A, Partial(B))`).

Классы всех четырёх helper'ов называются фиксированными именами (`PartialClassType`, `PickTypeClass`, `OmitTypeClass`, `IntersectionClassType`) — см. §«Ограничения».

### Рендер (`Schemer.render`)

`render` — один вызов `targetConstructorToSchema(target, {classTransformerMetadataStorage: defaultMetadataStorage, refPointerPrefix})`. Хранилище `class-transformer` (импортируется по подпути `"class-transformer/cjs/storage.js"`, для которого в пакете лежит ambient-объявление) нужно библиотеке, чтобы отбросить свойства с `Exclude()` и чтобы для `ValidateNested` найти тип из `@Type()` и подставить `{$ref: refPointerPrefix + Name}`; при `each: true` — `{type: "array", items: {$ref}}`.

`packages/schemer/src/defines/module.ts` (`Schemer.render`):

```ts
render(target: ClassType): ReturnType<typeof targetConstructorToSchema> {
  return targetConstructorToSchema(target, {
    classTransformerMetadataStorage: defaultMetadataStorage,
    refPointerPrefix: this.refPointerPrefix,
  });
}
```

В `required` попадают свойства без `IsOptional` и без `ValidateIf`: библиотека считает условную валидацию признаком необязательности. `IsNullable` навешивается всеми семью фабриками одинаково, поэтому асимметрии между `required` и `nullable` у отдельных фабрик нет.

`Date` рендерится не как скаляр из словарей коллектора, а как `{"oneOf":[{"format":"date","type":"string"},{"format":"date-time","type":"string"}]}` — это конвертер `IS_DATE` библиотеки; словари коллектора (`SCALAR_TYPE_SCHEMAS` и `SCALAR_SCHEMAS`) отдают для даты ту же форму, поэтому параметр с `design:type` `Date` в OpenAPI и скаляр `"date"` дескриптора `@TopicSchema` описаны одинаково. Префикс `$ref` задаётся на инстанс `Schemer`, а не на класс, поэтому одна и та же схема может рендериться с разными префиксами (router и api создают инстансы с `OpenApi.refPointerPrefix`, transfer — с `Transfer.refPointerPrefix`). Рендер не кэшируется; кэш появляется только на уровне `SchemasCollector.components`.

### Сборщик схем (`SchemasCollector.extract`)

`extract` разбирает вход по типу, в фиксированном порядке: строка → копия литерала из `SCALAR_TYPE_SCHEMAS` или ошибка с перечислением допустимых имён; массив → ровно один элемент, иначе ошибка, результат `{type: "array", items: extract(schema[0])}`; конструктор `String/Number/Boolean/Date` → копия литерала из приватного `SCALAR_SCHEMAS`; компонент-класс → регистрация в `components`/`classes` и `{$ref}`; любая другая функция → ошибка `is not a ComponentSchema class or scalar constructor`; всё остальное (готовый объект JSON Schema) возвращается тем же инстансом.

`packages/schemer/src/defines/collector.ts` (`SchemasCollector.extract`):

```ts
const saved = AomSchemas.checkExists(schema);
if (saved && saved.isComponentSchema) {
  const { name } = saved._.target;
  if (!this.components.has(name)) {
    // сначала фиксируем рендер (защита от циклов), затем обходим связи
    this.components.set(name, this.schemer.render(schema));
    this.classes.set(name, schema as ClassType);
    saved.connections.forEach((connection) => {
      this.extract(Reflect.apply(connection, null, []));
    });
  }
  return { $ref: `${this.schemer.refPointerPrefix}${name}` };
}
```

Порядок «сначала `set`, потом обход `connections`» — защита от циклов: самоссылающийся компонент (`Category.parent → Category`) не уводит рекурсию в бесконечность. Ключ словаря — `target.name`, поэтому имя класса и есть имя компонента; для анонимных mapped-классов это фиксированное служебное имя (см. §«Ограничения»).

### `Schemer.validate`

`validate` делает `plainToInstance(constructor, {...data}, {exposeDefaultValues: true, strategy: "exposeAll", exposeUnsetFields: false, enableCircularCheck: true})` и затем `validateSync(values, {whitelist: true})`, возвращая `{values, errors}`. `whitelist: true` удаляет из результата свойства, на которых нет ни одного валидатора, — так отсекаются лишние поля запроса. Единственный потребитель — `SafeData` в `@aom-js/api`, который на непустом `errors` бросает `WrongDataResponse` (`packages/api/src/decorators/safe-data.ts` (`SafeData`)).

### Свёртка схем для кодогенерации (`foldSchemas`)

`foldSchemas(roots)` обходит компонент-классы (начиная с явно переданных корней, дальше — по `Type` и `extends`) и для каждого свойства сохраняет пару `{factory, params}`, где `factory` — значение `SchemaTypes`, а `params` — те же сырые параметры, что лежат в `$.schemaParams`, но свёрнутые в JSON-совместимый вид: `Date` → `{$date: ISOString}`, `RegExp` → `{$regexp: [source, flags]}`, `Type.value` → `{$ref: Имя}` (цель обязана быть именованным компонентом — рекурсивно сворачивается тут же), `Enum.value` → `{$enum: Имя}` с объектом enum, вынесенным в общий словарь `enums` (имя по умолчанию — `${Компонент}${Свойство}`, либо явный `enumName`), `decorators` → массив `{$validator, args}` для декораторов `class-validator`, которые можно однозначно опознать по метаданным и минимальной арности (`class-validator`-декораторы со сложной внутренней логикой, `Transform`/`ValidateIf`, message-функции и собственные `registerDecorator` — пропускаются молча). Родитель по `extends` — либо имя компонента, либо, для анонимных mapped-классов, структура `{$mapped: "Pick"|"Omit"|"Partial"|"Intersection", of, keys?}`, разворачиваемая рекурсивно для составных mapped-types. Свойства, унаследованные без изменений (тот же объект `schemaParams`, что у ближайшего компонента-предка), в `properties` потомка не попадают — только собственные. Результат детерминирован: одинаковые корни дают одинаковый JSON независимо от порядка вызова.

`packages/schemer/src/defines/folding.ts` (`resolveRef`):

```ts
function resolveRef(cls: ClassType): string {
  const $ = AomSchemas.checkExists(cls as ClassConstructor);
  if ($?.mapped) {
    const form = describeMapped($.mapped);
    throw new Error(
      `foldSchemas: ${form} использован как цель Type, а не компонент; объявите класс-наследник с @ComponentSchema и используйте его, например: class Named extends ${form} {}`,
    );
  }
  if (!$ || !$.isComponentSchema) {
    throw new Error(
      `foldSchemas: "${(cls as Function).name}" не является именованным @ComponentSchema классом — унаследуйте именованным классом`,
    );
  }
  foldComponent(cls);
  return (cls as Function).name;
}
```

В отличие от `SchemasCollector` (который для той же ситуации просто получил бы коллизию имён), `foldSchemas` на анонимный mapped-класс в роли цели `Type` или корня падает явной ошибкой с готовой подсказкой по исправлению.

## Инварианты и подводные камни

- `PropertySchema` без `@ComponentSchema` на классе не делает ничего: фаза LAST разбирается только агрегатором. Наследование от компонента этого не заменяет — `class X extends PickType(...) {}` без собственного `@ComponentSchema()` рендерится (метаданные видны по цепочке прототипов), но `isComponentSchema` остаётся `undefined`, и `SchemasCollector.extract`/`foldSchemas` бросают, а `ParamsBuilder` — `COMPONENT_SCHEMA_NOT_DEFINED`.
- Одно свойство — одна фабрика. Повторное описание бросает `already has defined schema params`, но стек указывает на строку `@ComponentSchema`, а не на свойство: ошибка возникает в момент `apply()`.
- Именование параметров: `hidden` (не `exclude`), `isOptional` (не `required`), `isArray` (не `each`), `value` (не `type`) — для `Enum` это объект enum, для `Type` — ленивая ссылка `() => Class`.
- `isOptional: true` в class-validator пропускает и `undefined`, и `null`, поэтому вместе с ним `nullable` влияет только на JSON Schema и на `Transform`.
- Порядок внутри `ComponentSchema` фиксирован: подъём до ближайшего компонента-предка → `JSONSchema(schema)` → `apply()` свойств → `params.decorators`. Классовые декораторы из `params.decorators` видят уже полностью декорированный класс.
- Имя класса — это имя компонента и в OpenAPI, и в `foldSchemas`; переименовать компонент через параметры `@ComponentSchema` нельзя — такого параметра нет.
- Mapped-types, использованные напрямую (без обёртки в именованный класс с собственным `@ComponentSchema()`), безопасны только там, где схема разворачивается в плоский список параметров (`plainJsonSchema`, query-билдеры) — как компонент с `$ref` (через `SchemasCollector` или `foldSchemas`) они либо коллизируют по фиксированному служебному имени, либо (в `foldSchemas`) вызывают явную ошибку.
- Внешние скрипты и пробы должны импортировать `class-validator`/`class-transformer` из той же копии, что и schemer (`packages/schemer/node_modules`), иначе хранилища метаданных расходятся и валидация выглядит сломанной.

## Типовые приёмы

**Сущность = компонент-схема (двойное декорирование).** Поле сущности может нести пару декораторов: `@PropertySchema.*` для OpenAPI/валидации и декоратор ORM (например, `@Property`/`@ManyToOne` MikroORM):

```ts
@ComponentSchema({ description: "Категории" })
@Entity()
export class Category extends BaseEntity {
  @PropertySchema.String({ maxLength: 128, nullable: true, description: "Название" })
  @Property({ length: 128, nullable: true })
  name: string | null;

  @PropertySchema.Type({ value: () => Category, hidden: true, description: "Родительская категория" })
  @ManyToOne({ entity: () => Category, nullable: true, hidden: true })
  parent: Category | null;
}
```

Базовые поля (`id`, `createdAt`, `updatedAt`) могут приходить от общего базового класса, который сам помечен `@ComponentSchema`, — потомок получает их копии через подъём по цепочке предков.

**DTO через mapped-types.** Тело запроса собирается из сущности, а не переписывается вручную:

```ts
@ComponentSchema({ description: "Обновление профиля" })
export class ProfileUpdateDTO extends PickType(User, ["name", "surname", "birthDate"]) {}
```

Обёртка в именованный класс с собственным `@ComponentSchema()` обязательна — она даёт компоненту осмысленное имя и обходит коллизию `PickTypeClass` (см. §«Ограничения»).

**Композиция DTO через `IntersectionType`.** Тело собирается из нескольких частей — например, идентификатора владельца и полей заказа:

```ts
@ComponentSchema()
export class OrderBodyDTO extends PickType(Order, ["title", "comment"]) {}

@ComponentSchema()
export class CustomerOrderDTO extends IntersectionType(CustomerIdDTO, OrderBodyDTO) {}
```

Исключение из правила обёртки — фильтр query-строки: `QueryStringBuilder(PartialType(OrderFilter))` получает mapped-type напрямую. Это безопасно, потому что query-билдеры разворачивают схему в плоский список параметров через `plainJsonSchema` (`packages/api/src/functions/json-schema.ts` (`plainJsonSchema`)), а не через коллектор компонент.

**Одна схема — разные адресаты `$ref`.** Префикс ссылок задаётся экземпляру `Schemer`, а не классу, поэтому одни и те же классы годятся и для OpenAPI (`#/components/schemas/`), и для самодостаточной JSON Schema со связями в `$defs` — например, для структурированного ответа языковой модели:

```ts
const collector = new SchemasCollector(new Schemer("#/$defs/"));
collector.extract(Book); // { $ref: "#/$defs/Book" }; Book и всё, на что он ссылается, — в collector.components

const schema = {
  ...collector.components.get("Book"),
  $defs: Object.fromEntries(collector.components),
};
```

Корень остаётся и внутри `$defs`: так не ломается самоссылка (`Category.parent → Category`). Требования конкретного потребителя схемы (например, `additionalProperties: false`) рендер не добавляет — их дописывают поверх.

## Ограничения

- **Фиксированные имена mapped-классов.** `PartialType`, `PickType`, `OmitType` и `IntersectionType` возвращают классы с фиксированными именами `PartialClassType`, `PickTypeClass`, `OmitTypeClass`, `IntersectionClassType`. `SchemasCollector` при совпадении имени молча оставляет первый компонент; `foldSchemas` на анонимный mapped-класс в роли корня или цели `Type` падает явной ошибкой. Как обойти: чтобы использовать mapped-тип как самостоятельный компонент, оборачивать результат в именованный класс с `@ComponentSchema()` (см. §«Типовые приёмы»).
- **`pattern` не попадает в JSON Schema.** У `PropertySchema.String` `pattern` применяется только как валидатор `Matches`: в `schemer.render(X)` ключа `pattern` нет. Искать ограничение нужно в декораторах, а не в схеме.
- **`Type` не передаёт `examples`.** `TypeDescriptionsProperties` наследует `examples` из `CommonDescriptionsProperties`, но в `JSONSchema` у `Type` оно не попадает; собственного `default` у `Type` нет.
- **`foldSchemas` пропускает нераспознаваемые декораторы.** Свойство, чей декоратор не восстанавливается однозначно (не `class-validator`, собственный `registerDecorator`, `Transform`/`ValidateIf`, message-функция), сворачивается без этого декоратора, молча (см. §«Свёртка схем для кодогенерации (`foldSchemas`)»).

## Сборка и потребление

Сборка стандартная для монорепо: `bun run build:schemer` из корня ядра (эквивалент `bun --filter @aom-js/schemer build`) выполняет `tsc` трижды — `tsconfig.build.json` (CommonJS → `dist/cjs`), `tsconfig.build.mjs.json` (ESM → `dist/mjs`), `tsconfig.build.types.json` (только декларации → `dist/types`) — и затем `node ../../scripts/post-build.js`, который дописывает расширения относительным импортам и кладёт `dist/cjs/package.json` с `{"type": "commonjs"}` (сам пакет — `"type": "module"`). Манифест `package.json` генерируется из `package.src.json` скриптом `scripts/prebuild.js`, поэтому править надо `package.src.json`. Потребитель исполняет `dist`, а не `src`: **правки `src` не видны потребителю без `bun run build`**. Тесты монорепо, наоборот, идут по алиасу на `src` (`vitest.config.ts` (`resolve.alias`), с `oxc: false` на `vitest.config.ts` (`oxc`)), поэтому зелёные тесты не гарантируют, что `dist` пересобран. Полная схема сборки и dist-потребления — [Архитектура ядра](../architecture.md).

## Тесты пакета

Из корня ядра: `bunx vitest run packages/schemer` (все пакеты — `bun run test`). Скрипт `test` в `packages/schemer/package.json` — заглушка и падает.
