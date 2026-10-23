---
title: "@aom-js/core"
sidebar:
  label: "@aom-js/core"
  order: 1
---

Механика декораторной фабрики aom: реестр мета-инстансов, узел, фазы исполнения, наследование метаданных, `resolveFor`. Документ — единый источник истины по этой механике; router, schemer, transfer, holder и api ссылаются сюда вместо собственных объяснений.
Читать до: [Архитектура ядра](../architecture.md) (состав ядра, граф пакетов, сборка). Читать после: [`@aom-js/router`](router.md), [`@aom-js/schemer`](schemer.md).

## Назначение и место в стеке

Пакет даёт любому мета-классу — наследнику `AomCore` — две вещи: собственный реестр «мета-инстансов», ключуемых парой «класс + свойство», и пять фабрик legacy-декораторов, которые не выполняют обработчик немедленно, а кладут ленивый вызов `[handler, [$, ...args], inherit, parameter?]` в очередь одной из четырёх фаз (`ExecutionPhase`); четвёртый элемент — признак вызова декоратора параметра конструктора, используется при переносе на потомка (см. §«Наследование…»). Всё прикладное состояние хранят поля наследника; сам `AomCore` держит единственное поле экземпляра — узел `_` (`packages/core/src/defines/core.ts`, `AomCore._`).

Runtime-зависимостей у пакета нет (`packages/core/package.json`, `dependencies: {}`); `reflect-metadata` он не использует и о HTTP ничего не знает. Потребители — все остальные пакеты ядра: router (`AomApi`, `packages/router/src/common/api.ts`), schemer (`AomSchemas`, `packages/schemer/src/defines/module.ts`), transfer (`AomIsolator`, `packages/transfer/src/defines/main.ts`), holder (`AomHolder`, `packages/holder/src/init.ts`), api (`AomAccessCore`, `packages/api/src/controllers/access/types.ts`). Приложение на ядре может объявить и собственный мета-класс (см. [§«Пример собственного мета-класса»](#пример-собственного-мета-класса)). Полный граф пакетов и порядок сборки — [Архитектура ядра](../architecture.md).

## Публичный API

Точка входа — `packages/core/src/index.ts` → `export * from "./defines"`; каталога констант в `packages/core/src` нет.

### Классы и статические методы

| Экспорт                      | Сигнатура                                                                                                                                           | Назначение                                                                                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AomCore`                    | `class AomCore { _: AomNode<this>; constructor(base, target, property?, origin?) }`                                                                 | Базовый мета-класс; наследуется и получает собственный реестр и фабрики                                                                                                                                                             |
| `AomCore.instance`           | `static instance<T, E>(this: AomClass<T>, target: E, property?: Property): T`                                                                       | Найти или создать мета-инстанс по `target` (+`property`)                                                                                                                                                                            |
| `AomCore.checkExists`        | `static checkExists<T, E>(this: AomClass<T>, target: E, property?: Property): T \| undefined`                                                       | Вернуть существующий инстанс без создания; для свойства без дескриптора может создать синтетический инстанс (см. §«Ограничения»)                                                                                                       |
| `AomCore.resolveFor`         | `static resolveFor<T>(this: AomClass<T>, $: T, context: ClassConstructor): T`                                                                       | Перепривязать инстанс статики родителя к каррированной копии потомка                                                                                                                                                                |
| `AomCore.classDecorator`     | `static classDecorator<T>(handler: ($: T) => void, storeFlag?: ExecutionPhase, inherit?: InheritPlacement): ClassDecorator`                         | Фабрика декоратора класса                                                                                                                                                                                                           |
| `AomCore.methodDecorator`    | `static methodDecorator<T>(handler: ($: T, descriptor: PropertyDescriptor) => void, storeFlag?, inherit?): MethodDecorator`                         | Фабрика декоратора метода (статического или прототипного); обработчик возвращает `void`: возврат всё равно никуда не доходит                                                                                                        |
| `AomCore.propertyDecorator`  | `static propertyDecorator<T>(handler: ($: T) => void, storeFlag?, inherit?): PropertyDecorator`                                                     | Фабрика декоратора поля                                                                                                                                                                                                             |
| `AomCore.parameterDecorator` | `static parameterDecorator<T>(handler: ($: T, parameterIndex: number) => void, storeFlag?, inherit?): ParameterDecorator`                           | Фабрика декоратора параметра; `parameterIndex` передаётся только обработчику                                                                                                                                                        |
| `AomCore.combinedDecorator`  | `static combinedDecorator<T>(handler: ($: T, descriptor?: PropertyDescriptor) => void, storeFlag?, inherit?): CombinedDecorator`                    | Декоратор для класса ИЛИ метода; `descriptor` есть только у метода                                                                                                                                                                  |
| `ClassInstanceMap`           | `class ClassInstanceMap { set<T>(key: ClassConstructor<T>, value: T): this; get<T>(key): T \| undefined; has(key): boolean; delete(key): boolean }` | Типизированная WeakMap «конструктор → экземпляр»; в самом core не используется, нужна router как `RxContext.state`                                                                                                                  |
| `isClass`                    | `function isClass(value: InstanceTarget): boolean`                                                                                                  | Проверка «это class-синтаксис» через `Function.prototype.toString`                                                                                                                                                                  |

Значения по умолчанию у всех пяти фабрик: `storeFlag = ExecutionPhase.FIRST`, `inherit` не задан (`packages/core/src/defines/core.ts`, `classDecorator`, `combinedDecorator`, `methodDecorator`, `propertyDecorator`, `parameterDecorator`).

### Типы и перечисления

| Экспорт             | Сигнатура                                                                                                                  | Назначение                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `ExecutionPhase`    | `enum { INSTANT="instant", FIRST="first", LAST="last", DELAY="delay" }`                                                    | Фаза выполнения ленивого вызова (`packages/core/src/defines/types.ts`)           |
| `InheritPlacement`  | `enum { APPEND="append", PREPEND="prepend", SKIP="skip" }`                                                                 | Размещение вызова при переносе на потомка (`packages/core/src/defines/types.ts`) |
| `ClassConstructor`  | `type ClassConstructor<T = {}> = new (...args: any[]) => T`                                                                | Тип конструктора                                                                 |
| `ClassType`         | `type ClassType = ClassConstructor \| Function`                                                                            | Конструктор или функция                                                          |
| `Property`          | `type Property = string \| symbol`                                                                                         | Ключ свойства                                                                    |
| `InstanceTarget`    | `type InstanceTarget = ClassType \| InstanceType<ClassConstructor>`                                                        | Цель декорирования: класс, функция, прототип или объект                          |
| `CombinedDecorator` | `type CombinedDecorator = <T>(target: ClassType, propertyKey?: Property, descriptor?: TypedPropertyDescriptor<T>) => void` | Сигнатура комбинированного декоратора                                            |

### Не экспортируется

| Символ                                                             | Где                                                                                                              | Почему важен                                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `AomNode`                                                          | `packages/core/src/defines/node.ts`                                                                              | Модель узла; доступна только через `$._` — тип наружу не выведен |
| `AomCallstack`, `AomCallstackQueue`                                | `packages/core/src/defines/callstack.ts`                                                                         | Очереди фаз; доступны через `$._.callstack`                      |
| `LazyCall`, `OriginDescriptor`, `NodeOriginDescriptor`, `AomClass` | `callstack.ts` (`LazyCall`), `node.ts` (`NodeOriginDescriptor`), `internals.ts` (`OriginDescriptor`, `AomClass`) | Внутренние типы ленивого вызова и origin-дескриптора             |

Собственных констант ошибок в пакете нет; router держит свои (`packages/router/src/constants/errors.ts`, `CONSTRUCTOR_TYPE_ERROR`, `CONSTRUCTOR_PROPERTY_TYPE_ERROR`).

## Внутренние модули

| Файл                                                                                                                                                  | Ответственность                                                                                                                                          | Ключевые символы                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/index.ts`                                                                                                                          | Единственная точка входа: `export * from "./defines"`                                                                                                    | —                                                                                                                                                              |
| `packages/core/src/defines/index.ts`                                                                                                                  | Реэкспорт `functions`, `types`, `classes`, `core` (файлы `node.ts`, `callstack.ts`, `internals.ts` наружу не реэкспортируются)                           | —                                                                                                                                                              |
| `packages/core/src/defines/core.ts`                                                                                                                   | Мета-класс: реестр мета-инстансов и пять фабрик декораторов                                                                                              | `AomCore`                                                                                                                                                      |
| `packages/core/src/defines/node.ts`                                                                                                                   | Узел мета-инстанса: origin-дескрипторы, `apply`, `inherit`                                                                                               | `AomNode`, `NodeOriginDescriptor` (не экспортируются наружу)                                                                                                   |
| `packages/core/src/defines/callstack.ts`                                                                                                              | Очередь одной фазы и стек очередей по фазам                                                                                                              | `AomCallstackQueue`, `AomCallstack`, `LazyCall` (не экспортируются наружу)                                                                                     |
| `packages/core/src/defines/internals.ts`                                                                                                              | Внутренние типы, общие для файлов пакета: сигнатуры обработчиков, `AomClass`, origin-дескриптор                                                          | `AomHandler`, `AomCombinedHandler`, `AomMethodHandler`, `AomPropertyHandler`, `AomParameterHandler`, `AomClass`, `OriginDescriptor` (не экспортируются наружу) |
| `packages/core/src/defines/types.ts`                                                                                                                  | Публичные типы и перечисления                                                                                                                            | `ExecutionPhase`, `InheritPlacement`, `ClassConstructor`, `ClassType`, `Property`, `InstanceTarget`, `CombinedDecorator`                                       |
| `packages/core/src/defines/classes.ts`                                                                                                                | Типизированная обёртка над `WeakMap<конструктор, экземпляр>`                                                                                             | `ClassInstanceMap`                                                                                                                                             |
| `packages/core/src/defines/functions.ts`                                                                                                              | Проверка class-синтаксиса регуляркой по `toString`                                                                                                       | `isClass`                                                                                                                                                      |
| `packages/core/package.json`, `packages/core/tsconfig.build.json`, `packages/core/tsconfig.build.mjs.json`, `packages/core/tsconfig.build.types.json` | Генерируются `scripts/prebuild.js` из общей версии корневого `package.json`, `package.src.json` и `scripts/jsons/package.dist.json`; в `.gitignore` (правила `packages/**/package.json` и `packages/**/tsconfig.build*.json`) | —                                                                                                                                                              |

## Ключевые механизмы

### Реестр инстансов и ключи

Реестр каждого мета-класса — `WeakMap`, лежащая на статическом свойстве самого класса под ключом `Symbol.for(\`AOM_MAP_${this.name}\`)`; при первом обращении карта создаётся (`packages/core/src/defines/core.ts`, `AomCore.instancesMap`). Символ глобальный, но читается он с конкретного `this`, поэтому мета-классы с разными именами всегда независимы.

Почему `WeakMap`, а не `reflect-metadata`: мета-инстанс — обычный изменяемый объект, декораторы дописывают его поля на месте, и записывать метаданные заново после каждого изменения не нужно. Ключи — сами классы и функции методов, поэтому реестр не удерживает их от сборщика мусора.

Ключ вычисляет `instanceKey(target, property)` (`packages/core/src/defines/core.ts`, `AomCore.instanceKey`). Конструктор берётся как сам `target`, если это функция, иначе `target.constructor`. Далее:

- `property` не задан либо конструктор не является классом (`isClass`) → ключ = сам `target`;
- `property` задан, дескриптор существует, у него есть `value` и он не `enumerable` (то есть это метод) → ключ = сама функция `descriptor.value`, поэтому `Meta.instance(A, "run")` и `Meta.instance(A.run)` дают один инстанс;
- иначе (поле без дескриптора или `enumerable`-статика) → создаётся синтетический инстанс `new this(this, constructor, property, originDescriptor)`, который кладётся в карту сам на себя (`map.set(instanceKey, instanceKey)`) и в `root._.statics` (если `target === constructor`) либо в `root._.properties` (если `target` — прототип).

| Что декорируется          | Вызов                                    | Ключ в реестре            | Куда попадает                          |
| ------------------------- | ---------------------------------------- | ------------------------- | -------------------------------------- |
| Класс                     | `instance(A)`                            | сам класс `A`             | —                                      |
| Статический метод         | `instance(A, "run")` = `instance(A.run)` | функция `A.run`           | `root._.origins`                       |
| Прототипный метод         | `instance(A.prototype, "run")`           | функция `A.prototype.run` | `root._.origins`                       |
| Поле инстанса             | `instance(A.prototype, "field")`         | синтетический инстанс     | `root._.properties` + `root._.origins` |
| Статическое data-поле     | `instance(A, "config")`                  | синтетический инстанс     | `root._.statics`                       |
| Свойство не-class функции | `instance(fn, "x")`                      | сама `fn`                 | — (карты не задействованы)             |

Последняя строка — следствие условия `property && isClass(constructor)` (`packages/core/src/defines/core.ts`, `AomCore.instanceKey`): для обычной функции или стрелки `property` игнорируется и ключом становится сам `target`, поэтому разные свойства одной функции получат один инстанс.

`instance()` (`packages/core/src/defines/core.ts`, `AomCore.instance`) ищет по ключу, при отсутствии создаёт инстанс и сохраняет. Отдельная ветка `packages/core/src/defines/core.ts` (`AomCore.instance`) чинит порядок обращений: если инстанс уже был создан по значению функции (без `property`), а теперь запрошен по паре «класс + свойство», его узел `_` пересоздаётся с корректными `target`, `property` и `root`.

```ts
class A {
  static handler() {}
}
const viaValue = Meta.instance(A.handler); // сначала по функции
const viaProperty = Meta.instance(A, "handler");
viaProperty === viaValue; // true
viaValue._.target; // A — узел пересоздан с корректными target и property
viaValue._.property; // "handler"
```

### Узел `AomNode`

Узел (`packages/core/src/defines/node.ts`, `AomNode`) — служебная часть мета-инстанса, доступная как `$._`.

| Поле                     | Тип                      | Содержание                                                                                                                                         |
| ------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base`                   | мета-класс               | Класс, чей реестр создал инстанс; через него узел вызывает `instance()`                                                                            |
| `target`                 | `ClassConstructor`       | Конструктор-владелец — всегда конструктор, и для статики, и для полей инстанса                                                                     |
| `property`               | `Property?`              | Ключ свойства; у узла класса не задан                                                                                                              |
| `self`                   | мета-инстанс             | Сам инстанс, которому принадлежит узел                                                                                                             |
| `root`                   | мета-инстанс             | Для узла свойства — мета-инстанс класса, для узла класса — `self`                                                                                  |
| `originInstance`         | `InstanceTarget`         | То, что реально декорировалось: класс (статика) или прототип (свойство инстанса)                                                                   |
| `origins`                | `NodeOriginDescriptor[]` | Узлы декорированных свойств; наполняется только у корневого узла                                                                                   |
| `properties` / `statics` | `Map<Property, T>`       | Синтетические инстансы полей инстанса и статических data-полей                                                                                     |
| `callstack`              | `AomCallstack`           | Очереди фаз собственного узла                                                                                                                      |
| `inherited`              | `WeakSet<ClassType>`     | Родители, чьи вызовы уже перенесены на этот узел; не даёт повторному `inherit(parent)` повторно выполнить его FIRST-очередь                        |

`origins` наполняется только у корневого узла и только когда дескриптор отсутствует либо не `enumerable` (`packages/core/src/defines/node.ts`, `AomNode.origins`): туда попадают методы (статические и прототипные) и поля инстанса, но не `enumerable`-статические data-поля — те живут исключительно в `statics`. Разделение «статика или прототип» восстанавливается сравнением `origin.target === $origin._.target` (`packages/core/src/defines/node.ts`, `AomNode.inherit`); эту же формулу повторяют holder (`packages/holder/src/decorators.ts`, `Apply`) и mapped-types схемера (`packages/schemer/src/defines/mapped-types/partial-type.helper.ts`, `PartialType`).

`apply()` (`packages/core/src/defines/node.ts`, `AomNode.apply`) разбирает отложенные очереди в фиксированном порядке: сначала все узлы из `properties`, затем из `statics`, затем из `origins`, и только потом собственный `callstack` узла.

### Фазы и очереди

Зачем фазы. Legacy-декораторы вычисляются снизу вверх: сначала декораторы полей и методов, последним — декоратор класса. Декоратор метода не знает ни того, что поставят соседние декораторы, ни итогового класса — им может оказаться потомок, который унаследует метод. Поэтому работу, которой нужен собранный класс, декоратор не делает сразу, а кладёт в очередь `LAST`; запускает очередь декоратор-агрегатор класса (`@Controller()`, `@ComponentSchema()`, `@Isolator()`), который вычисляется последним и вызывает `$._.apply()`. То, что можно сделать сразу и нужно повторить на потомке, идёт в `FIRST`; сам агрегатор — в `INSTANT`, чтобы не повторяться при наследовании.

`AomCallstack` создаёт по одной очереди `AomCallstackQueue` на каждое значение `ExecutionPhase` — в `stores` (`packages/core/src/defines/callstack.ts`). Поведение очереди задаётся фазой в конструкторе `AomCallstackQueue` (`packages/core/src/defines/callstack.ts`): `async = true` только у `DELAY`, `deferred = true` у `LAST` и `DELAY`.

| Фаза      | Когда выполняется                | Где сохраняется   | Наследуется                             | Возврат доходит до декоратора |
| --------- | -------------------------------- | ----------------- | --------------------------------------- | ----------------------------- |
| `INSTANT` | в момент декорирования           | нигде             | нет (см. ниже)                          | нет                           |
| `FIRST`   | в момент декорирования           | `fired`           | да, с повторным выполнением на потомке  | нет                           |
| `LAST`    | при `_.apply()` корневого узла   | `queue` → `fired` | да, встаёт в очередь потомка            | нет                           |
| `DELAY`   | в `setTimeout` после `_.apply()` | `queue` → `fired` | да, встаёт в очередь потомка            | нет                           |

`add()` (`packages/core/src/defines/callstack.ts`, `AomCallstackQueue.add`) реализует эту таблицу тремя ветками: `deferred` (`LAST`/`DELAY`) кладёт вызов в `queue` через `push` и ждёт `exec()`; `FIRST` кладёт вызов в `fired` через `push` и тут же выполняет, поэтому он и срабатывает сразу, и остаётся доступным для переноса на потомка; `INSTANT` только выполняет, нигде не сохраняя. Индекс параметра в размещении вызова не участвует: `parameterIndex` попадает только в аргументы обработчика (см. §«Фабрики декораторов»).

INSTANT-вызовы намеренно нигде не сохраняются: `@Controller()`, `@ComponentSchema()`, `@Delay`/`@Apply` holder'а вызывают `$._.inherit()`/`$._.apply()` и объявлены в фазе INSTANT именно затем, чтобы не сохраняться в очереди — иначе `transferTo` повторил бы вызов агрегатора на потомке и увёл бы в рекурсию.

`exec()` (`packages/core/src/defines/callstack.ts`, `AomCallstackQueue.exec`) вычерпывает очередь через `while ((value = this.queue.shift()))` и складывает выполненное в `fired` — повторный `apply()` те же `LAST` не повторяет. `run()` (`packages/core/src/defines/callstack.ts`, `AomCallstackQueue.run`) вызывает обработчик через `Reflect.apply(handler, null, args)`; для `DELAY` — внутри `setTimeout` без аргумента задержки, поэтому возвращаемое значение обработчика теряется, а брошенное исключение никем не перехватывается (см. §«Ограничения»).

`AomCallstack.apply()` (`packages/core/src/defines/callstack.ts`) перебирает фазы в порядке объявления enum — `INSTANT`, `FIRST`, `LAST`, `DELAY` — и для каждой вызывает `exec()` на `stores`. Очереди `INSTANT`/`FIRST` к этому моменту пусты по построению.

Порядок фаз на примере:

```ts
const log: string[] = [];
const Mark = (label: string, phase: ExecutionPhase) =>
  Meta.classDecorator(($) => log.push(label), phase);
// legacy-декораторы применяются снизу вверх: delay, last, first
@Mark("first", ExecutionPhase.FIRST)
@Mark("last", ExecutionPhase.LAST)
@Mark("delay", ExecutionPhase.DELAY)
class D {}
log; // ["first"] — при декорировании сработал только FIRST
Meta.instance(D)._.apply();
log; // ["first", "last"] — DELAY ещё нет, он через setTimeout
await new Promise((r) => setTimeout(r, 0));
log; // ["first", "last", "delay"]
```

### Фабрики декораторов

Все пять фабрик устроены одинаково: захватывают `this` (мета-класс) в `self`, получают мета-инстанс через `self.instance(target, property)` и добавляют ленивый вызов в очередь заданной фазы. Различаются они целью и составом аргументов обработчика (`packages/core/src/defines/core.ts`, `classDecorator`, `combinedDecorator`, `methodDecorator`, `propertyDecorator`, `parameterDecorator`):

| Фабрика              | Инстанс берётся по                                                                                      | Аргументы обработчика                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `classDecorator`     | `instance(target)`                                                                                      | `[$]`                                                                                                |
| `combinedDecorator`  | `instance(target, property)`                                                                            | `[$, descriptor]` — `descriptor` определён только для метода                                         |
| `methodDecorator`    | `instance(target, property)`                                                                            | `[$, descriptor]`                                                                                    |
| `propertyDecorator`  | `instance(target, property)`                                                                            | `[$]`                                                                                                |
| `parameterDecorator` | `instance(target, property)` — для параметров конструктора `property === undefined`, значит узел класса | `[$, parameterIndex]` — `parameterIndex` передаётся только обработчику, позицией в очереди не служит |

Значение, возвращённое обработчиком, **не доходит до TypeScript ни в одной фазе**. `AomCallstackQueue.add()` действительно возвращает результат `run()` в ветках `FIRST`/`INSTANT` (`packages/core/src/defines/callstack.ts`), но ни одна фабрика не возвращает этот результат наружу декоратору — все они вызывают `targetInstance._.callstack.add(...)` (то есть `AomCallstack.add()`, `packages/core/src/defines/callstack.ts`, который сам вызывает `store.add(value)` тоже без `return`) как побочный эффект. Поэтому `AomMethodHandler` возвращает `void` (`packages/core/src/defines/internals.ts`) — тип соответствует фактическому поведению: `methodDecorator` не может подменить дескриптор метода возвращаемым значением ни в `FIRST`, ни в `LAST`.

### Наследование: `inherit`, `transferTo`, каррирование

`AomNode.inherit(parent)` (`packages/core/src/defines/node.ts`) выполняет два шага.

Перед этим — дедупликация: `inherited` — `WeakSet<ClassType>` с уже унаследованными родителями (`packages/core/src/defines/node.ts`, `AomNode.inherited`). Повторный `inherit(того же parent)` просто возвращает `$parent` без повторного переноса (`packages/core/src/defines/node.ts`, `AomNode.inherit`) — без этого каждый вызов заново выполнял бы FIRST-очередь родителя.

Шаг первый — перенос собственных вызовов класса-родителя: `$parent._.callstack.transferTo(this.self)`. `transferTo` (`packages/core/src/defines/callstack.ts`, `AomCallstack.transferTo`, `AomCallstackQueue.transferTo`) для каждой фазы обходит `[...fired, ...queue]` и добавляет вызов в очередь потомка, подменив первый аргумент (`$`) на мета-инстанс потомка. Следствия: `FIRST` в момент `inherit` выполняется повторно — уже в контексте потомка; `LAST`/`DELAY` просто встают в очередь потомка. Размещение задаёт третий элемент ленивого вызова:

| `InheritPlacement`  | Отложенные фазы (`LAST`/`DELAY`)                                                  | `FIRST`                                            |
| ------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------- |
| не задан / `APPEND` | в конец очереди потомка, после его собственных вызовов                            | выполняется на потомке после его собственных       |
| `PREPEND`           | единым блоком в начало очереди потомка, взаимный порядок внутри блока сохраняется | как `APPEND` — порядок уже задан моментом переноса |
| `SKIP`              | не переносится                                                                    | не переносится                                     |

Блок `PREPEND` собирается в отдельный массив и ставится в начало через `prependBatch` (`packages/core/src/defines/callstack.ts`) — поштучный `unshift` развернул бы порядок. Этим механизмом пользуется `@Before` роутера, чтобы родительские pre-middleware оказывались перед собственными (`packages/router/src/decorators/middlewares/index.ts`, `Before`).

Шаг второй — перенос декорированных свойств родителя по `$parent._.origins` (`packages/core/src/defines/node.ts`, `AomNode.inherit`). Перенос выполняется, только если потомок ещё не владеет свойством; проверок две и обе нужны: `Object.hasOwn` закрывает статики и прототипные методы, реестр (`root._.statics` / `root._.properties`) — поля класса, которых физически нет ни на конструкторе, ни на прототипе. При переносе метода `transferDescritorWithDecorators` (`packages/core/src/defines/node.ts`, `AomNode.inherit`) определяет у потомка **собственное** свойство с каррированной обёрткой:

`packages/core/src/defines/node.ts` (`AomNode.inherit`):

```ts
if (descriptor && descriptor.value) {
  // здесь обязательно каррирование, так как иначе будет замена контекста исходного дескриптора изначального родительского класса
  // this пробрасывается вызывающей стороне (не фиксируется на null): для статики это
  // конкретный класс, для прототипного метода — инстанс, на котором его вызвали
  const curriedDescriptor = function (this: any, ...args: any[]) {
    return Reflect.apply(descriptor.value, this, args);
  };
  // определим
  Reflect.defineProperty(target, property, {
    ...descriptor,
    value: curriedDescriptor,
  });
}
```

Копия — другая функция, значит и другой ключ в реестре: у потомка появляется собственный мета-инстанс метода, на который переносятся декораторы родителя. Каррированная копия — обычная `function`, и `this` внутри — тот, с которым вызвали копию (класс-потомок для статики, инстанс — для прототипного метода). Идентичность методов родителя и потомка при этом разная (`Child.run !== Parent.run`), поэтому сравнивать нужно по мета-инстансу.

Порядок вызовов `inherit` по цепочке задаёт вызывающая сторона. `@Controller()` идёт от ближайшего родителя вверх (`packages/router/src/decorators/controllers/index.ts`, `Controller`), поэтому при `PREPEND` блок прародителя оказывается перед блоком родителя.

Декораторы параметров конструктора — особый случай `transferTo`: если у потомка свой конструктор со своими декорированными параметрами, родительские декораторы параметров конструктора не переносятся — иначе они встали бы в очередь после собственных и перезаписали бы их результат (`AomCallstackQueue.hasParameters()` и `skipParameters` в `AomCallstack.transferTo`, `packages/core/src/defines/callstack.ts`; признак — четвёртый элемент ленивого вызова, `parameter?: boolean`, `LazyCall`). Потомок без своего конструктора получает декораторы параметров конструктора родителя; предел распознавания — в §«Ограничения».

Вызовы параметр-декораторов лежат в очереди подряд, без привязки к индексу параметра, поэтому перенос метода с `FIRST`-декоратором не на первом параметре проходит без ошибки:

```ts
const seen: string[] = [];
const Param = () =>
  Meta.parameterDecorator(($, index) => seen.push(`${$._.target.name}:${index}`));
class Parent {
  static run(a: string, @Param() b: string) {}
}
class Child extends Parent {}
Meta.instance(Child)._.inherit(Parent); // не бросает
seen; // ["Parent:1", "Child:1"]
```

### `resolveFor`

`resolveFor($, context)` решает задачу поздней привязки. Ссылка вида `@Before(Self.Method)` вычисляется в момент декорирования, когда `@Controller()` потомка ещё не отработал, и потому фиксирует мета-инстанс статики **родителя**. После `inherit()` у потомка появляется собственная каррированная копия метода со своим мета-инстансом, и ссылку нужно доразрешить.

`packages/core/src/defines/core.ts` (`AomCore.resolveFor`):

```ts
// позднее доразрешение ссылки на статику по контекстному классу: если инстанс `$`
// привязан к родителю контекста, вернуть инстанс каррированной копии потомка
static resolveFor<T extends AomCore>(this: AomClass<T>, $: T, context: ClassConstructor): T {
  const { target, property } = $._;
  // Object.hasOwn обязателен: собственная копия появляется у потомка только при inherit();
  // без неё instance() создал бы пустой инстанс без дескриптора вместо корректного
  if (property && context.prototype instanceof target && Object.hasOwn(context, property)) {
    return this.instance(context, property);
  }
  return $;
}
```

Три условия проверяются вместе: `$` описывает свойство, `context` — потомок владельца `$`, и у `context` уже есть собственная копия свойства. Не выполнено любое — возвращается исходный `$`, поэтому вызов безопасен на произвольной ссылке.

Единственный потребитель — router: `AomCursor` перепривязывает `$` при создании курсора (`packages/router/src/common/cursor.ts`), а `@Before`/`@After`/`@UseMarker`/`@Next` доразрешают ссылки на middleware в контексте класса, объявившего декоратор (`packages/router/src/decorators/middlewares/index.ts`, `Before`, `After`, `UseMarker`, `Next`).

## Инварианты и подводные камни

- Мета-класс — наследник `AomCore` с собственными полями состояния; фабрики вызываются на самом мета-классе (`Meta.methodDecorator(($) => …)`). Деструктурировать фабрику нельзя: `this` внутри — это мета-класс, из него берутся реестр и конструктор инстанса.
- Ссылки на владельца внутри обработчика — только через узел: `$._.target`, `$._.property`, `$._.root`. Прикладные данные класса складываются в `$._.root`, данные свойства — в сам `$`.
- Декораторы-агрегаторы, вызывающие `$._.inherit()` и `$._.apply()`, объявляются в фазе `INSTANT` — иначе перенос на потомка повторит агрегатор и вызовет рекурсию. Так сделаны `@Controller()` (`packages/router/src/decorators/controllers/index.ts`, `Controller`), `@ComponentSchema()` (`packages/schemer/src/defines/decorators.ts`, `ComponentSchema`), `@Delay` (`packages/holder/src/decorators.ts`, `Delay`); `@Apply` объявлен в той же фазе и делает то же самое опосредованно — через `Reflect.decorate([Delay(...)])` (`packages/holder/src/decorators.ts`, `Apply`). Поэтому `INSTANT`-вызовы намеренно нигде не сохраняются и не наследуются (см. §«Ограничения»).
- `LAST`-вызовы свойств разбираются только через `apply()` корневого узла класса: без агрегатора на классе отложенные декораторы методов не выполнятся никогда.
- Порядок применения legacy-декораторов задаёт TypeScript: методы класса декорируются раньше самого класса, а несколько декораторов на одной цели применяются снизу вверх.
- Реестры мета-классов с разными именами независимы (`Symbol.for` читается с конкретного `this`). Слияние возможно только у наследника мета-класса с тем же `name`: символ совпадает, собственного свойства у наследника ещё нет, и он читает карту родителя через цепочку статического наследования.
- Относительные импорты в `src` пишутся без расширений — `tsc` их не подставляет, расширения дописывает `scripts/post-build.js` в `dist`; спецификаторы, уже написанные с расширением (js, json, mjs, cjs), скрипт пропускает как есть, падает он только на неразрешимых путях — копит их в `errors` и завершается с кодом 1 (`scripts/post-build.js` (`SPEC`, `errors`)).
- `strictPropertyInitialization` выключен намеренно: поля узлов и мета-классов заполняют декораторы, а не конструктор (`tsconfig.base.json`).

## Пример собственного мета-класса

Приложение на ядре может объявить собственный мета-класс, например реестр «метод эндпоинта → требуемая роль»:

```ts
class RoleRelay extends AomCore {
  required: { target: ClassConstructor; property: Property; role: string }[] = [];
}

const RequireRole = (role: string) =>
  RoleRelay.methodDecorator(($) => {
    const { target, property } = $._;
    $._.root.required.push({ target, property, role });
    Reflect.decorate([Before(CheckRole) as MethodDecorator], target, property!);
  });
```

Здесь видны сразу три приёма из §«Ключевые механизмы»: владелец и имя метода берутся из узла (`$._.target`, `$._.property`), накопитель кладётся в мета-инстанс **класса** (`$._.root`), а не свойства, и обработчик сам навешивает декораторы роутера через `Reflect.decorate` — то есть мета-класс выступает генератором маршрутных декораторов. В рантайме middleware `CheckRole` берёт мета-инстанс класса-владельца курсора через `RoleRelay.instance(origin._.target)` и находит запись по `origin._.property`.

Косвенно ядро задействовано в каждом классе приложения на ядре: `@Controller()`, `@ComponentSchema()`, `@Isolator()` и все параметр-декораторы маршрутов — это фабрики `AomCore` поверх мета-классов router, schemer и transfer.

## Ограничения

- **`INSTANT` не наследуется.** Вызовы фазы `INSTANT` нигде не сохраняются (`AomCallstackQueue.add`, `packages/core/src/defines/callstack.ts`), поэтому перенос на потомка их не повторяет — так агрегаторы не уходят в рекурсию (см. §«Инварианты и подводные камни»). По той же причине holder сам переносит `$.queue` родительского `AomHolder`-инстанса перед `inherit()`, иначе класс-декораторы из `@Delay` родителя не доезжали бы до потомка при `@Apply` ([`@aom-js/holder`](holder.md)). Как обойти: для наследуемого поведения выбирать `FIRST`.
- **Методы потомка — другие функции.** После `inherit` каррированная копия метода — другая функция с собственным мета-инстансом, поэтому `Child.run !== Parent.run`. Как обойти: сравнивать методы родителя и потомка по мета-инстансу (`AomApi.instance(...)`), а не по ссылке на функцию.
- **`checkExists` со свойством может создать инстанс.** Для свойства без дескриптора `checkExists` идёт по той же ветке `instanceKey`, что и `instance()`, и регистрирует синтетический инстанс (`AomCore.instanceKey`, `AomCore.checkExists`, `packages/core/src/defines/core.ts`). Как обойти: передавать в `checkExists` только класс.
- **Исключение в `DELAY` роняет процесс.** Обработчик `DELAY` выполняется в `setTimeout` без `try/catch` (`AomCallstackQueue.run`), и его ошибка становится необработанным исключением (`uncaughtException`/`unhandledRejection`). Как обойти: не класть в обработчик `DELAY` код, который может бросить исключение.
- **Возврат обработчика теряется.** Значение, возвращённое обработчиком, не доходит до TypeScript ни в одной фазе, поэтому обработчик метода типизирован как `void` и не может подменить дескриптор (см. §«Фабрики декораторов»).
- **Свой конструктор потомка без декорированных параметров не распознаётся.** Родительские декораторы параметров конструктора перенесутся на такого потомка, хотя конструктор у него свой (`AomCallstack.transferTo`); точное распознавание требует чтения `design:paramtypes`. Как обойти: если у потомка свой конструктор, декорировать его параметры явно.

## Сборка и потребление

Сборка пакета — `bun run build:core` в корне ядра (эквивалент `bun --filter @aom-js/core build`, `package.json` (`typescript`)): три прохода `tsc` по сгенерированным конфигам (`tsconfig.build.json` → `dist/cjs`, `tsconfig.build.mjs.json` → `dist/mjs`, `tsconfig.build.types.json` → `dist/types`), затем `node ../../scripts/post-build.js`, который дописывает расширения относительным импортам в собранном коде и кладёт `dist/cjs/package.json` с `{"type":"commonjs"}`. Сам `package.json` и все `tsconfig.build*.json` генерирует `scripts/prebuild.js` и они игнорируются git — править нужно `package.src.json` и шаблоны в `scripts/jsons`.

Потребитель резолвит пакет через `exports` в `dist/mjs` (`dist/cjs` — для `require`). Отсюда инвариант: **правки `src` не видны потребителю без `bun run build`**. Полная схема сборки монорепо и dist-потребления — [Архитектура ядра](../architecture.md).

## Тесты пакета

Из корня ядра: `bunx vitest run packages/core` (все пакеты — `bun run test`).

