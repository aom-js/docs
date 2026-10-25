---
title: "@aom-js/holder"
sidebar:
  label: "@aom-js/holder"
  order: 7
---

Экспериментальный пакет: три декоратора `Hold` / `Delay` / `Apply`, которые откладывают применение сторонних декораторов на предках и применяют их на конечном потомке.
Читать до: [`@aom-js/core`](core.md) (фазы исполнения, узел, `inherit`/`apply`). Читать после: [Архитектура ядра](../architecture.md) §«Состав…» (место пакета в графе).

## Назначение и место в стеке

Пакет решает одну задачу: набор декораторов, объявленных на базовом классе, не должен выполняться на этом базовом классе, а должен выполниться на его конечном потомке. Зачем: и `@aom-js/schemer`, и ORM вроде MikroORM переносят декорированные свойства на потомков своими механизмами. Если общие поля (`id`, `createdAt`, …) объявить на базовом классе обычными декораторами, базовый класс сам станет компонентом схемы и сущностью базы, а перенос на потомков у двух библиотек конфликтует. Холдер откладывает декораторы: на предке они только запоминаются, а выполняются один раз — на конечном потомке. `Hold` копит декораторы свойства в очереди мета-инстанса, `Apply` на потомке эту очередь исполняет через `Reflect.decorate`.

Зависимости — только `@aom-js/core` (мета-класс, фабрики декораторов, наследование метаданных) и `reflect-metadata` (`packages/holder/package.src.json`). Обратных зависимостей нет: ни один пакет ядра `@aom-js/holder` не импортирует; полный граф — в [Архитектура ядра](../architecture.md).

Пакет вводит один собственный термин: **очередь холдера** — поле `queue` мета-инстанса `AomHolder`, в которое складываются ещё не применённые декораторы (`packages/holder/src/init.ts`, `AomHolder.queue`).

## Публичный API

| Экспорт     | Сигнатура                                                        | Назначение                                                                                                              |
| ----------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Hold`      | `Hold(...queue: PropertyDecorator[]): PropertyDecorator`         | Кладёт декораторы свойства в очередь холдера в фазе LAST, не применяя их на текущем классе                              |
| `Delay`     | `Delay(...queue: ClassDecorator[]): ClassDecorator`              | Фаза INSTANT: кладёт классовые декораторы в очередь холдера класса, выполняет `$._.inherit(родитель)` и `$._.apply()`   |
| `Apply`     | `Apply(...queue: ClassDecorator[]): ClassDecorator`              | Фаза INSTANT: `Delay(...)` + применение накопленных очередей к свойствам класса и собственной очереди — к самому классу |
| `AomHolder` | `class AomHolder extends AomCore { queue: CombinedDecorator[] }` | Мета-класс пакета (свой реестр инстансов). **Не экспортируется** из `index.ts`                                          |

`packages/holder/src/index.ts` реэкспортирует только `./decorators`; `AomHolder` доступен исключительно внутри пакета. Побочный импорт `reflect-metadata` — там же (`import "reflect-metadata"` перед реэкспортом).

## Внутренние модули

| Файл                                  | Ответственность                                                  | Ключевые символы         |
| ------------------------------------- | ---------------------------------------------------------------- | ------------------------ |
| `packages/holder/src/index.ts`        | Точка входа: `import "reflect-metadata"` и реэкспорт декораторов | —                        |
| `packages/holder/src/init.ts`         | Мета-класс пакета с единственным прикладным полем `queue`        | `AomHolder`, `queue`     |
| `packages/holder/src/decorators.ts`   | Три декоратора и приведения типов на границе очереди             | `Hold`, `Delay`, `Apply` |
| `packages/holder/package.src.json`    | Источник для генерации `package.json` (`scripts/prebuild.js`)    | —                        |

## Ключевые механизмы

Все три декоратора построены фабриками `AomCore` (`packages/core/src/defines/core.ts`, `classDecorator` — для `Delay`/`Apply`, `propertyDecorator` — для `Hold`) поверх собственного мета-класса, поэтому у холдера свой реестр инстансов, независимый от `AomApi`/`AomSchemas`. Механику фаз, узла и наследования метаданных здесь не пересказываем — см. [`@aom-js/core`](core.md) §«Ключевые механизмы».

### Hold: отложить декораторы свойства (LAST)

`Hold` — property-декоратор фазы LAST. Его обработчик не применяет переданные декораторы, а лишь дописывает их в очередь мета-инстанса свойства:

`packages/holder/src/decorators.ts` (`Hold`)

```ts
export function Hold(...queue: PropertyDecorator[]): PropertyDecorator {
  return AomHolder.propertyDecorator(($) => {
    $.queue.push(...(queue as unknown as CombinedDecorator[]));
    //
  }, ExecutionPhase.LAST);
}
```

LAST — отложенная фаза: вызов ложится в очередь узла и не исполняется, пока кто-то не вызовет `apply()` (`packages/core/src/defines/callstack.ts`, `AomCallstackQueue.add`, `AomCallstackQueue.exec`). На самом базовом классе `apply()` никто не вызывает, поэтому очередь свойства остаётся пустой, а декораторы — неприменёнными. При наследовании отложенный вызов переносится на мета-инстанс одноимённого свойства потомка (`packages/core/src/defines/callstack.ts`, `AomCallstack.transferTo`, `AomCallstackQueue.transferTo`; `packages/core/src/defines/node.ts`, `AomNode.inherit`), и уже там наполняет `queue` потомка.

### Delay: перенос очереди и callstack родителя + apply (INSTANT)

`Delay` — классовый декоратор фазы INSTANT. Он делает три вещи: кладёт свои классовые декораторы в очередь холдера этого класса, переносит `$.queue` прямого родителя (если ещё не переносил), наследует метаданные прямого родителя и разбирает отложенные очереди.

`packages/holder/src/decorators.ts` (`Delay`)

```ts
// защита от повторного переноса очереди родителя в один и тот же $.queue: Apply сам
// вызывает Delay, и на одном target Delay может отработать больше одного раза
const queueInherited = new WeakSet<AomHolder>();

export function Delay(...queue: ClassDecorator[]): ClassDecorator {
  return AomHolder.classDecorator(($) => {
    // свои — перед унаследованными: Reflect.decorate идёт с конца,
    // поэтому предки срабатывают первыми, а ближний класс — последним и побеждает
    $.queue.unshift(...queue);

    const parent = Object.getPrototypeOf($._.target);
    const $parent = AomHolder.instance(parent);
    if (!queueInherited.has($)) {
      queueInherited.add($);
      // родитель без Delay (обычный класс или только с Hold) ещё не собрал своих предков —
      // пусть соберёт, тогда он несёт всё, что выше
      if (parent !== Function.prototype && !queueInherited.has($parent)) {
        Reflect.decorate([Delay()], parent);
      }
      // $.queue — не часть callstack AOM, inherit() её не переносит, переносим её сами
      $.queue.push(...$parent.queue);
    }

    // перенесем декораторы со свойствами из родителя
    $._.inherit(parent);

    $._.apply(); // применим перенесенные декораторы
  }, ExecutionPhase.INSTANT);
}
```

`$._.inherit(parent)` переносит на потомка callstack родителя и его декорированные свойства (это `Hold`-очереди свойств, они идут через LAST-фазу ядра); `$._.apply()` прогоняет LAST-очереди свойств, статик и origins узла (`packages/core/src/defines/node.ts`, `AomNode.apply`). Именно этот `apply()` наполняет `queue` свойств потомка вызовами, положенными туда `Hold` на родителе.

`$.queue` (очередь **классовых** декораторов самого `AomHolder`-инстанса) — не часть callstack AOM и `inherit()` её не трогает, поэтому `Delay` переносит её вручную перед `inherit()`: в очереди собственное стоит раньше унаследованного. `Reflect.decorate` идёт с конца массива, поэтому дальний предок срабатывает первым, а ближний класс — последним (см. §«Инварианты и подводные камни»). Если прямой родитель сам не проходил `Delay` (обычный класс или класс только с `Hold`), `Delay` сначала вызывается на нём: родитель собирает всё от своих предков, а потомок берёт готовое только с него. `WeakSet queueInherited` защищает от повторного переноса: `Apply` сам вызывает `Delay` через `Reflect.decorate` (см. §«Apply…» ниже), и на одном `$` `Delay` может отработать больше одного раза.

Сам `Delay` при этом ничего не декорирует непосредственно на классе: `Reflect.decorate` по собственной очереди `$.queue` вызывается только внутри `Apply`. Класс, помеченный только `@Delay(X())` без последующего `@Apply()` в иерархии, декоратор `X()` на себя не получает.

### Apply: применить накопленное на потомке

`Apply` — классовый декоратор фазы INSTANT. Он вызывает `Delay` через `Reflect.decorate`, затем обходит `origins` узла и применяет очередь каждого свойства, и в конце применяет собственную очередь к классу.

`packages/holder/src/decorators.ts` (`Apply`)

```ts
export function Apply(...queue: ClassDecorator[]): ClassDecorator {
  return AomHolder.classDecorator(($) => {
    // применим стандартную процедуру delay для переноса всех свойств
    // console.log("apply delayed decorators", $._.target);
    Reflect.decorate([Delay(...queue)], $._.target);
    // console.log("parent transfered", $._.target);

    // и выполним запуск тех декораторов, которые были перенесены
    $._.origins.forEach((origin) => {
      const $origin = origin.self; // $._.base.instance(origin.descriptor.value);
      const isClassOrigin = origin.target === $origin._.target;

      // применим декораторы из очереди на те свойства, которые были созданы
      Reflect.decorate(
        origin.self.queue as unknown as PropertyDecorator[],
        isClassOrigin ? $._.target : $._.target.prototype,
        origin.property,
      );
    });
    // применим собственные декораторы класса из его очереди
    Reflect.decorate($.queue, $._.target);
    //
  }, ExecutionPhase.INSTANT);
}
```

`origins` — список декорированных свойств, накопленный узлом класса при создании мета-инстансов свойств (`packages/core/src/defines/node.ts`, `AomNode.origins`); после `inherit` он содержит и свойства, перенесённые с родителя. Флаг `isClassOrigin` различает статику (декоратор применяется к конструктору) и свойство инстанса (к прототипу). Последняя строка применяет к классу те классовые декораторы, что были переданы в `Apply` (и попали в `$.queue` через `Delay`, включая перенесённые от родителя).

Рабочий сценарий целиком: `@Hold(Spy("a"))` на поле `HeldBase.field`, `@Apply()` на `HeldChild extends HeldBase` — и `Spy` вызывается ровно один раз, с целью `HeldChild.field`.

### Пример: общие поля сущностей

Общие поля объявлены на предках через `@Hold`, конечная сущность собирает всё через `@Apply`. Предки ни компонентом схемы, ни сущностью базы не становятся.

```ts
@Delay()
export class DefaultEntity {
  @Hold(
    PropertySchema.String({ description: "ID", decorators: [IsUUID()] }),
    PrimaryKey({ type: "uuid", onCreate: () => uuidv7() }),
  )
  id: string = uuidv7();

  @Hold(PropertySchema.Date({ description: "Дата создания" }), Property({ type: t.datetime }))
  readonly createdAt: Date = new Date();
}

@Delay()
export class EnabledEntity extends DefaultEntity {
  @Hold(PropertySchema.Boolean({ description: "Признак активности" }), Property({ type: t.boolean }))
  enabled: boolean;
}

@Apply(ComponentSchema({ description: "Контрагенты" }), Entity())
export class Contractors extends EnabledEntity {
  @PropertySchema.String({ maxLength: 128, description: "Название" })
  @Property({ type: t.string, length: 128 })
  name: string;
}
```

Свои декораторы класса (`ComponentSchema`, `Entity`) — в `@Apply` конечного потомка: они срабатывают последними и перекрывают декораторы предков (см. §«Инварианты и подводные камни»). От `Contractors` дальше не наследуют: общий набор держат на буферном классе с `@Delay`, а каждая сущность наследует от него со своим `@Apply`.

## Инварианты и подводные камни

- `@Delay`/`@Apply` объявлены в фазе `INSTANT`: такие вызовы не сохраняются и не наследуются, поэтому при переносе на потомка сами `@Delay`/`@Apply` не повторяются и не уходят в рекурсию.
- `Delay` на классе не применяет к нему свои классовые декораторы: их исполняет только `Reflect.decorate($.queue, $._.target)` в `Apply` (`packages/holder/src/decorators.ts`). `@Delay(X())` без последующего `@Apply()` в иерархии — no-op в части `X()`.
- Классовые декораторы, переданные в `@Delay` предков, применяются к конечному потомку вместе с его собственными (`Apply` → `Reflect.decorate($.queue, $._.target)`, `packages/holder/src/decorators.ts` (`Delay`, `Apply`)). Порядок — от дальнего предка к ближнему классу: для декораторов, которые перезаписывают одно и то же (`ComponentSchema` → `JSONSchema` класса), побеждает ближний класс. `@Delay(ComponentSchema({ description: "База" }))` на предке и `@Apply(ComponentSchema({ description: "Контрагенты" }))` на потомке дают схеме потомка описание «Контрагенты».
- `Apply`/`Delay` наследуют ровно от прямого родителя: `Object.getPrototypeOf($._.target)` внутри `Delay` (`packages/holder/src/decorators.ts`). Прямой родитель уже несёт всё от своих предков: если он сам не помечен `@Delay`/`@Apply` (обычный класс или класс только с `@Hold`), `Delay` потомка сначала вызывает `Delay()` на нём. Поэтому обычный класс посередине цепочки не обрывает перенос — ни очереди класс-декораторов (`$.queue`), ни декораторов свойств (`Hold`, они идут через `callstack`/`inherit`).
- От класса, помеченного `@Apply`, наследовать `@Apply` повторно небезопасно: `transferTo` переносит на потомка и выполненные, и ожидающие вызовы, не очищая источник (`packages/core/src/defines/callstack.ts`, `AomCallstack.transferTo`, `AomCallstackQueue.transferTo`), поэтому `@Apply` на внуке повторно исполнит те же `Hold`-очереди. Ядро защищает только от повторного `inherit(того же parent)` на одном и том же узле — не от этой многоуровневой цепочки. Вместо этого общий набор держат на буферном классе с `@Delay`/`@Hold`, а каждая конечная сущность наследует от него со своим `@Apply` (см. §«Пример: общие поля сущностей»).
- Потребитель исполняет собранный `dist`, поэтому после правки `src` нужен `bun run build` — см. §«Сборка и потребление».

## Ограничения

- Повторное `@Apply` на потомке `@Apply`-класса повторно исполняет те же `Hold`-очереди (см. §«Инварианты и подводные камни»); ошибки при этом нет.
- Порядок применения нескольких декораторов внутри одного `Hold` не зафиксирован — полагаться на него нельзя.

## Сборка и потребление

Сборка стандартна для монорепо: `bun run build:holder` (или `bun --filter @aom-js/holder build`) прогоняет `tsc` трижды — `tsconfig.build.json` (cjs), `tsconfig.build.mjs.json` (mjs), `tsconfig.build.types.json` (типы) — и запускает `scripts/post-build.js`; `package.json` собирает `scripts/prebuild.js` слиянием общей версии из корневого `package.json`, `package.src.json` и `scripts/jsons/package.dist.json` (`scripts/prebuild.js`, `scripts/files.js`), а `tsconfig.build*.json` он просто копирует из `scripts/jsons/` (`scripts/prebuild.js`, `scripts/files.js`) — поэтому зависимости правятся в `package.src.json`, а опции компиляции — в `scripts/jsons/tsconfig.build*.json`. Потребитель читает `dist` через поле `exports`, так что правки `src` ему не видны без пересборки. Полная схема — [Архитектура ядра](../architecture.md) §«Сборка, тесты…» и §«Как приложение потребляет ядро».

## Тесты пакета

```bash
bunx vitest run packages/holder
```

Алиас `@aom-js/holder` в vitest указывает на `packages/holder/src` (`vitest.config.ts`), поэтому тесты идут по исходникам, минуя `dist`.
