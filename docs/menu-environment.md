# Окружение меню «Билетная касса»: визуальный раунд

Геометрия продолжает round1 `7bfee581e870b274769eb963d5033ebc710a3f51` и ранний surfaces API `c4746fbe35c445cf1d1c9ac9f941e7f31c349c4e`. Исходник — `menu-station-2.png`. Этот этап уточняет арку и интерьер, профиль стоек/кронштейнов, кровлю, путь, состав, кожу багажа и дальний вокзал; добавляет скамью, тележку, семафор и третью лампу. Всё статично; следующий этап движения требует общей приёмки.

Камера, свет, кассирша, DOM и загрузчик графики принадлежат общей сцене. Production чужих владельцев не изменён. Проверка геометрии зафиксирована на полном common snapshot `316f83085e4f1989779c57954f1014213b7fec0b`; следующий lighting snapshot `d43c1673b41a1444c5ebb886ead6a2b40e46ca79` передан общему дизайнеру для объединения exact tips. Это описание геометрического кандидата, а не финальная приёмка общего изображения.

## Модули и пространство

`menu-models.ts` строит независимое окружение, retained части, рамы и world corners; `menu-train.ts` — состав; `menu-props.ts` — предметы; `menu-model-utils.ts` — поверхности, batching и lifecycle. Модели не импортируют игровой стол, персонажей или ядро. Renderer, камера, освещение, DOM и frame loop снаружи.

+Y вверх, +Z к зрителю, положительный единичный scale. Верх прилавка Y=0, пол Y=−.90, rail top Y=−.65. Разворот здания задаётся через `parts.stationRoot.rotation.y`; прилавок, контактные точки и cashierAnchor поворачиваются вместе. Путь, пол, багаж и фон остаются под environment root. Не дублировать yaw на обеих группах.

| Part               | Parent         | Neutral position / yaw    | Реальная геометрия                                              |
| ------------------ | -------------- | ------------------------- | --------------------------------------------------------------- |
| stationRoot        | root           | identity                  | Фасад, прилавок, контакты, рамы, часы, лампы, навес, интерьер   |
| lowerFacade        | stationRoot    | `(0,−.9,0)`               | Штукатурка, цоколь, зелёная панель с профилем                   |
| stationFloor       | root           | `(0,−.9,0)`               | Каменные плиты с узкими физическими швами                       |
| railwayRoot        | root           | `(2.75,−.65,−3.1)`        | Состав и путь                                                   |
| platform           | railwayRoot    | identity, yaw−.65         | Кромка, балласт, шпалы, крепления и рельсы                      |
| canopy             | stationRoot    | `(0,2.63,0)`              | Левая/правая кровля, деревянный низ, балки, фестоны и подвес    |
| supports           | stationRoot    | `(0,−.9,0)`               | Профильные стойки, цоколи/кольца и криволинейные кронштейны     |
| outerCanopySupport | supports       | `(4.35,0,−.2)`            | Отдельная правая стойка с кронштейном                           |
| interior           | stationRoot    | `(0,0,−1.1)`              | Боковые/задняя стены, арочный проём, глубокая ниша, полки/пачки |
| backdropRoot       | root           | identity                  | Небо, четыре дерева, дальний вокзал, фонари, семафор            |
| lamps[0]           | stationRoot    | `(−2,2.53,.38)`           | Обычная лампа со stemExtension .20                              |
| lamps[1]           | stationRoot    | `(.3,1.98,−.75)`          | Плоская compactHeight .045 лампа под потолком кассы             |
| lamps[2]           | stationRoot    | `(5.7,2.495,−2.15)`       | Обычная дальняя лампа под деревянным низом навеса               |
| bench              | root           | `(1.7,−.9,2.8)`, yaw−1.2  | Деревянные планки, металлические ножки/подлокотники             |
| luggageTrolley     | root           | `(2.05,−.9,.55)`, yaw−.18 | Четыре колеса, рама, задняя ручка                               |
| semaphore.root     | backdropRoot   | `(5,−.9,−8.4)`            | Стойка/основание, сигнальный диск и верхний шар                 |
| semaphore.armPivot | semaphore.root | `(0,2.8809684,.1074647)`  | Настоящее red/cream крыло                                       |

Все 20 экспортированных parts (с четырьмя чемоданами и тремя лампами) после consolidate сохраняют собственные meshes: перенос каждой группы перемещает геометрию. Semaphore arm bind+X, rotation.z=0, ось возможного вращения +Z; движения сейчас нет.

Внешняя стойка имеет origin на полу и верх station-local Y=2.58. Консервативная область X=1.10…6.40, Z=−2.60….60 сохраняет верх/кронштейн под неизменной правой кровлей; после изменения навеса область пересчитать. Общая сцена выбирает внешний transform `(1.7,0,−.2)`, backdropRoot.x=2 и railwayRoot.x=3.5. Остальные neutral положения выше задаёт builder. При переносе лампы надо сохранить реальный потолочный контакт.

## Касса и контакты

Прилавок2.03×.13×.70, верх Y=0, фронт Z=.39. Новые нижние молдинги находятся ниже контактного Y. Передний деревянный проём ≈±.865, задний штукатурный проём ±.90, задний штукатурный проём имеет боковые точки Y1.80 и apex1.93, полностью выше внутреннего края деревянной арки. Деревянная арка шире проёма, apex≈2.105; глубина создаёт видимый внутренний край. Нижняя панель сохраняет зелёную краску на раме/вставке. Интерьер имеет настоящее отверстие в задней стене, глубокий plaster reveal и полки, а не плоскую наклейку.

Constructor contacts не изменены:

| Узел             | Position в stationRoot-local |
| ---------------- | ---------------------------- |
| cashierAnchor    | `(0,0,.02)`                  |
| handRestLeft     | `(.35,0,.17)`                |
| handRestRight    | `(−.35,0,.17)`               |
| bellAnchor       | `(.76,0,.18)`                |
| ticketTrayAnchor | `(−.70,0,.12)`               |
| clock.root       | `(1.36,1.30,−.03)`           |

Лево/право — анатомические стороны. После обновления world matrices переводить контакт через `cashierAnchor.worldToLocal(contact.getWorldPosition(vector))`. Согласованная common pose сначала задаёт retained handRestRight=(.10,0,.17), затем переводит обе точки; right option=(.10,0,.15). Builder не подменяет default. Кассирша identity под cashierAnchor.

Пустой держатель .18×.14×.13, внутренние X±.070/Z±.043, основание Y0….025. `ticket-slot` position=(0,.026,0), bind identity/+Y бумага/normal+Z. Бумагой после reparent владеет cashier bundle. Двухъярусный звонок сохраняет настоящий bell-button.

В frozen common кадре обе skin-кисти minY≈.002; все12 нижних skin vertices имеют ray hits реального прилавка на Y≈−2.38×10⁻⁹. Верхняя область cashier осталась X710.02…885.79/Y289.86…407.38 при1672×941. Новая плоская лампа заканчивается околоY175.35, не касается головы.

## Состав, путь и предметы

Состав train-local X±.510, Y0…1.824, Z−3.865…1.411; chimneyAnchor=(0,1.826,.61). Train nose+Z, neutral yaw−.65. Котёл радиуса .399 сохранён; новая дымовая коробка имеет выпуклую крышку, обод/14 заклёпок/петли и рычаг, буферы — выпуклые чёрные тарелки на штоках, балка — red без карты. Труба полая cream, дом green, окна glassWarm с отдельными рамками, крыши арочные black/iron, добавлены поршни/тяги/трубы и детали колёс. Исправлено направление normals двух front lathe profiles: FrontSide ray видит наружную крышку/буфер.

Семь осей не сдвинуты: driveY.24/Z−.55,−.08,+.39; coachY.16/Z−3.34,−3.03,−2.07,−1.76. Wheel pivots bind0, вращение local+X. Все14 реальных tread rays касаются gaugeX±.41 на rail-localY0, максимальная ошибка5.37×10⁻⁹. Радиусы сохраняют интервалы между осями. Боковые тяги статичны.

Путь и train имеют общий yaw−.65. Rail head width.04/topY0; добавлены feet/plates, шпалы и низкий ballast. Trackbed и боковая кромка касаются environment floorY−.9; высокой светлой подставки нет.

Часы смотрят+Z, стрелки bind+Y, pivotsZ.102/.120. Отрицательная rotation.z идёт по часовой стрелке спереди. Три лампы emissive без дополнительных Light. `buildMenuLamp(kit,{stemExtension?;compact?;compactHeight?})`: defaultH.493, compactH.175, extension.20 даёт H.693 и оставляет потолочный origin. Negative/nonfinite extension и compact с ненулевым extension отклоняются RangeError. Optional compactHeight требует compact и finite positive глубину; default .175 сохранён. Environment задаёт .045, меняя физическую геометрию, не root scale; cap/contactY0 сохранены.

`buildMenuBench(kit)` и `buildMenuLuggageTrolley(kit)` возвращают группы с фактическим footY0; contact metadata содержит реальные bounds. `buildMenuSemaphore(kit,{height?,armLength?})` возвращает `{root,armPivot}`, defaults3.4/.9; finite positive размеры обязательны. Custom height меняет фактическую геометрию и pivot, root scale остаётся1.

Чемоданы сохраняют совместимый `buildMenuSuitcase(kit,color,stickers?,{size?})`. Brown/старый wood color теперь выбирает leather, без A08 древесины на корпусе; green остаётся крашеным. Корпус смягчён, U-ручка и тонкие ремни/замки/угловая brass фурнитура объёмные. Размер size задаёт тело, не ручку. Square decal=.30×bodyW, A07 circle/diamond UV crops224²; bodySize/bodyBounds/contact/decalSlots описывают actual bounds и положительные зазоры. Невместимые/неположительные/nonfinite размеры отклоняются RangeError.

| Имя                | Body W×H×D   | Neutral position   | Yaw  |
| ------------------ | ------------ | ------------------ | ---- |
| luggage-left-back  | .72×.63×.34  | `(−2.4,−.9,2.1)`   | .13  |
| luggage-left-front | 1.00×.55×.38 | `(−1.85,−.9,2.6)`  | −.06 |
| luggage-left-low   | .63×.39×.30  | `(−1.52,−.9,2.06)` | .08  |
| luggage-right      | .90×.55×.34  | `(2.15,−.9,1.2)`   | −.20 |

Высокий дальний левый корпус и меньший green корпус дают ступенчатую группу. Все6 пары body XZ footprints разделены в neutral. Перекрытие screen silhouettes допускается; физическое пересечение корпусов — нет. Для common narrow layout есть собственное luggageAdvance; его применяет compositor.

## Рамы и lifecycle

`board.bounds/settingsBounds` и `setLayout` — stationRoot-local номинальные прямоугольники, не world AABB после yaw; max.z передняя плоскость, min.z=max.z−.04. `setLayout` требует finite Box3/positive borders, сохраняет rotation/quaternion, обновляет размеры/position и освобождает заменённые geometry. Вызывать на resize/layout, не каждый кадр. innerPlane/settingsPlane getters актуальны.

`getCorners()` возвращает новые world Vector3[] в порядке TL/TR/BR/BL: внешние board/settings и inset aperture/settingsAperture. Учтены transforms всех предков. Native DOM преобразуется по этим projected world corners. Settings-hangers дочерние settingsRoot, следуют её rotation и не входят в UI bounds. После dispose обе функции бросают ошибку.

Kit владеет geometry/material/Texture clones, включая retained части и временные batch pieces. Все входные Texture остаются у caller. Pending/merged geometry регистрируется до возможной ошибки Texture.clone; catch в buildMenuModels вызывает kit.dispose и сохраняет исходную ошибку. Circular Texture.userData failure проверен отдельно: project-created buffers освобождены, caller Texture не dispose. Успешный dispose idempotent; surfaces map очищается. Кассирша, загрузчик art и renderer имеют отдельный lifecycle.

## Проверки и измерения

Frozen HTML SHA256 `95dcb28e9675406b5aff16da4d6c4de7f8b4be031ff4a237060c373d8b153e0c`. Harness заменяет только builder окружения; camera(.04,.52,6.4), FOV34, station yaw27°, свет/poses/native DOM — exact common316. Before использует round1. Dirty foreign files не подключены.

Runtime — официальный open-source Chromium snapshot Mac_Arm1716370 (BSD3 и documented open-source third-party notices), Playwright Apache2, Three MIT, TypeScript Apache2, Node MIT. Происхождение браузера: https://www.chromium.org/getting-involved/download-chromium/ ; лицензия: https://chromium.googlesource.com/chromium/src/+/main/LICENSE . Новых production dependencies нет. Проект не использует ничего из Аркадии/внутренней инфраструктуры Яндекса, в том числе через agents.

С тремя разными prepared art textures: **113018tri,93meshes/93geometries,20materials,3owned map clones,116resources**. Это color-print legacy inputs, новые8tiles сюда не входят. Shared-input contract fixture объединяет A05/A07 в один print и содержит114 current resources; no-art independent fixture106. Всё освобождается ровно один раз, входы0. Три legacy RGBA карты с mipmaps ≈3.15MB; размер новыхtiles определяет art owner.

Common main render1672:115calls/172632tri,1920:116calls/172634tri,1280:113calls/172628tri; before1672:99calls/91918tri. Shadow pass отдельно. Старый ориентир100calls превышен на15–16 после добавления retained предметов/материалов; это реальный бюджет для общей сцены, не утверждение о FPS. CPU build с prepared8²textures,26builds: cold113.76ms, median25warm73.74ms, p95(24-я sorted)86.98ms; без загрузки/renderer/shader upload/GPU timing.

Contract:20 actual retained parts,14 wheel contacts, floor/prop alignment, physical support всех3lamps (maxgap1.91×10⁻⁸),6luggage SATpairs, transformed hand anchors/world quads,20layout rebuilds, fresh vectors, invalid inputs, independent bundles, dispose×2/input0 и exception cleanup. Browser1672×941/1280×720/1920×1080: HTTP/page/console errors0, clickRules/Escape, TabSettings/Enter/Escape/focus-return прошли; native corner error≤.038px. Проверка ждёт реальный close-event диалогов перед Tab, чтобы не гоняться с восстановлением фокуса браузером.

Силуэты props проверяются по projected convex hull всех actual mesh vertices против world quads board/settings, с запасом8px для focus. Минимальный зазор до settings: 1672→9.87px, 1280→64.99px, 1920→11.36px. Точные величины и source checks — в handoff JSON. Tests/check/build и независимый read-only verdict привязаны к exact candidate в handoff.

Новые base-color tiles, окончательная UV плотность, тёплый свет, мягкость теней/фон и combined screenshot остаются общей интеграцией art/compositor. Листва сейчас объёмная из irregular небольших lobes, каменный пол регулярный; это заметные отличия от художественной фактуры reference. Игра/mainApp/lifecycle menu→game и баланс этим static harness не проверялись. Приёмка финального статичного кадра ещё нужна; анимации не подключены.

## Именованные поверхности — контракт визуального раунда

`MenuEnvironmentArt` совместимо сохраняет `wood`, `clockFace`, `luggageStickers`. Новые optional поля:

```ts
surfaces?: Partial<Record<MenuMaterial, THREE.Texture>>;
materialOverrides?: Partial<Record<MenuMaterial, {
  color?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
}>>;
```

Согласованные color slots: `cream` — штукатурка; `green` — крашеные стойки/фасад/состав; `wood` — арка, столешница, скамья; `woodDark` — интерьер/полки/путь; `leather` — brown luggage; `stone` — пол/платформа; `boardPaint` — физическая `boardInnerPlane`; `paper` — физическая `settingsPlane` и другие paper детали окружения. Это единый surfaces API, отдельных top-level leather/boardPaint/paper полей нет. Другие palette kinds также типизированы, но 2D сейчас производит только эти реально нужные карты.

Приоритет карты: `surfaces[kind]`, затем legacy `wood` только для kind wood, затем одноцветный материал. Все карты SRGB base-color. `Texture.clone()` сохраняет источник изображения и transform/repeat/offset/rotation/centre; клону задаётся RepeatWrapping по U/V, исходная Texture не изменяется. Default repeat `(1,1)`. Новые карты умножаются на white color, если нет `materialOverrides[kind].color`; explicit color умножает карту. Legacy A08 wood без surfaces.wood имеет muted varnish tint `#ae9479`. Без карты используется palette color с optional override. Numeric roughness/metalness требуют finite `[0,1]`, emissiveIntensity finite `>=0`. Normal/roughness maps пока не входят в этот color-only контракт.

UV не являются world tri-planar mapping: Box/RoundedBox используют стандартный `(0..1)` на каждой грани; Extrude использует стандартные Shape XY coordinates и edge/depth mapping, фасад/арка сохраняют model-local метры. Для verticalWood UV меняются `(u,v)→(1-v,u)`. Batch/consolidate сохраняют UV. Art owner должен дать мелкий бесшовный tile без нарисованных объектов, текста и baked света; composer может задать repeat на входной карте перед construction, клон сохранит его. Отдельный woodDark slot не наследует legacy wood.

`models.surfaces: ReadonlyMap<MenuMaterial, THREE.MeshStandardMaterial>` возвращает реально созданные shared owned surfaces. Stable name `menu-surface/<kind>`, userData.menuSurface=kind. Значения материала mutable для настройки общим дизайнером; map structure read-only на уровне TypeScript. Texture prints A05/A07 остаются отдельными mapped clones, поэтому смена color paper не перекрашивает печать. Scene owner не должен dispose эти материалы или входить в kit lifecycle. Idempotent `models.dispose()` освобождает все owned geometry/material/map clones ровно один раз, входные art textures сохраняются. После dispose surfaces map пуст.
