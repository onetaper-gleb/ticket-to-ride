# Окружение меню «Билетная касса», round 1

Candidate продолжает `4a281d5690dbc9ded5ca490243530172d99782be` на ветке `design/menu-ticket-office-environment`; исходная база `bea9743c7622a7806a3d9b6824a9d912b0a41b65`. Цель — приблизить массы к выбранному PNG: сократить нижний фасад, показать пол и ближний багаж, округлить котёл, убрать светлый пьедестал под составом и уточнить опоры/интерьер. Камера, свет, итоговый разворот, кассирша и DOM принадлежат другим владельцам. Анимации не подключены.

## Модули

| Файл                  | Содержимое                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `menu-models.ts`      | `buildMenuModels(art?)`, фасад/прилавок, retained parts, рамы и world corners, перрон/фон |
| `menu-train.ts`       | Локомотив, двухцветный вагон, семь осей, точка трубы                                      |
| `menu-props.ts`       | Часы, обычная/компактная лампа, звонок, пустой держатель, параметризуемый чемодан         |
| `menu-model-utils.ts` | Материалы, batching и владение ресурсами                                                  |

Область M01–M04, M08–M15. M05–M07 создаёт bundle кассирши, M16 отложен. Модели не импортируют игровой стол, персонажей, Observation или Engine. Renderer, камера, освещение, DOM и цикл кадров находятся снаружи.

## Пространства и retained parts

+Y вверх, +Z к зрителю. Production scale всех групп положительный единичный; размеры меняются геометрией. `root`, `cashierAnchor`, `counter`, `railwayRoot`, `clock`, `train`, `board`, `dispose` сохранены. Новое `parts` содержит реальные meshes; ссылки не обнуляются после consolidate. Материалы объединены внутри частей, ресурсы остаются у bundle.

| Part                 | Parent           | Neutral position / yaw | Геометрия                                                                                |
| -------------------- | ---------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| `stationRoot`        | environment root | identity               | Фасад, окно, прилавок, рамы, cashierAnchor/контакты, часы, лампы, навес/стойки, интерьер |
| `lowerFacade`        | stationRoot      | `(0,−.9,0)`            | Кремовая стена, цоколь и короткая зелёная панель                                         |
| `stationFloor`       | environment root | `(0,−.9,0)`            | Верх камня local Y=0, швы local Y=.001                                                   |
| `platform`           | railwayRoot      | `(0,0,0)`, yaw=−.65    | Кромка станции, основание пути, шпалы/рельсы                                             |
| `canopy`             | stationRoot      | `(0,2.63,0)`           | Кровля/фестоны справа, балки и рука подвеса первой лампы                                 |
| `supports`           | stationRoot      | `(0,−.9,0)`            | Три объединённые стойки и отдельная внешняя правая                                       |
| `outerCanopySupport` | supports         | `(4.35,0,−.2)`         | Стойка, подошва, кольца, диагональный кронштейн; три meshes                              |
| `interior`           | stationRoot      | `(0,0,−.94)`           | Полки/пачки, боковой светлый проём и опора компактной лампы                              |
| `backdropRoot`       | environment root | identity               | Небо, зелень, дальние станционные массы; четыре meshes                                   |
| `lamps[0]`           | stationRoot      | `(−2.0,2.53,.38)`      | Приподнятая лампа над доской                                                             |
| `lamps[1]`           | stationRoot      | `(0,1.68,−.55)`        | Компактная лампа внутри окна                                                             |
| `luggage[0…3]`       | environment root | См. таблицу ниже       | Четыре ближних чемодана, по четыре meshes с A07                                          |

Фасад разворачивается через `parts.stationRoot.rotation.y`. Вместе с ним поворачиваются cashierAnchor, прилавок и контактные точки. Пол, поезд/путь, багаж и фон остаются под environment root. Поворот всего environment root дополнительно затрагивает их; не дублировать yaw. Подъём пола уже включён в neutral layout, повторное смещение пола/фасада в compositor не требуется.

### Внешняя стойка и фон

`outerCanopySupport` — дочерняя группа supports, origin на полу. Local Y=0 сохраняет подошву на station-local Y=−.9, верх стойки Y=2.58 входит в кровлю на .04. Кровля занимает station-local X=.95…7.15, Z=−2.8….8, низ Y=2.54. При неизменных rotation/scale можно перемещать стойку по X/Z в консервативной области X=1.10…6.60, Z=−2.60….60: верх и связанный кронштейн остаются под кровлей. Если менять canopy, область опоры пересчитать. Перенос кронштейна отдельно от стойки не нужен.

При yaw27° проверен пример `outerCanopySupport.position=(1.7,0,−.2)`: стойка находится слева от состава, контакты с полом/крышей сохранены. Этот transform применяется только в диагностическом harness; production neutral остаётся `(4.35,0,−.2)`. Итоговое расстояние между опорами и длину консольной части выбирает общий дизайнер.

Исходные массы backdrop-local: sky box20×12×.1 в `(3,2,−11)`; группы зелени вокруг X=1.4/3.6/6.1, Z≈−9.1; дальняя кремовая масса7×1.4×.3 в `(4,−.75,−10)` и тёмный верх7.3×.2×.6 в `(4,0,−10)`. В diagnostic yaw27° фон сдвинут на X=2, чтобы убрать зелень из кассового проёма и сохранить её за поездом. Новые рисунки и материалы для этого не создавались.

С stationRoot yaw фон сохраняет своё world размещение автоматически. Для legacy поворота environment root нужный world transform фона переводится через `inverse(backdropRoot.parent.matrixWorld) * desiredWorldMatrix`, затем decomposes в position/quaternion/scale. Это ответственность compositor; одно только отрицательное rotation.y не компенсирует translation и иной parent transform.

## Контакты кассы

Прилавок2.03×.13×.70, верх Y=0, фронт Z=.39. Пол Y=−.90; нижняя панель от −.90 до −.13. Световой проём шириной1.50, центр арки около Y=1.68. Само окно и контакты не сдвигались.

| Узел                       | Position в stationRoot-local |
| -------------------------- | ---------------------------- |
| `cashierAnchor`            | `(0,0,.02)`                  |
| `counter.handRestLeft`     | `(+.35,0,.17)`               |
| `counter.handRestRight`    | `(−.35,0,.17)`               |
| `counter.bellAnchor`       | `(.76,0,.18)`                |
| `counter.ticketTrayAnchor` | `(−.70,0,.12)`               |
| `clock.root`               | `(1.36,1.30,−.03)`           |

Лево/право — анатомические стороны. Перевод после обновления world matrices: `cashierAnchor.worldToLocal(contact.getWorldPosition(vector))`, результат `(±.35,0,.15)` даже при yaw здания/transform предка. Кассирша добавляется с identity под cashierAnchor. Новая поза держащей руки остаётся у владельца кассирши; handRestRight не изменён.

Пустой держатель: внешние .18×.14×.13, основание Y=0….025, полость X=±.070, Z=±.043. Передний/боковой/задний край Y=.105/.125/.140. `ticket-slot` внутри держателя имеет position=(0,.026,0), identity rotation. Нейтральная бумага вверх +Y, нормаль +Z, низ выше основания. Bundle кассирши владеет бумагой после reparent.

Frozen compositor добавляет настоящую стопку под slot с local position=(0,.005,0), identity quaternion/scale. Фактический posed paper bounds в tray-local: X≈±.05523, Y=.02651….19434, Z=−.01525….00125; стопка помещается в полость и выступает вверх. У обеих реальных skin-кистей minY≈.002 в station-local, у билета в хвате minY≈.09483. Эти измерения относятся к frozen cashier08bc3c4, не к его следующей позе.

## Поезд, путь и props

Котёл и передняя круглая часть увеличены локальной геометрией ×1.4: радиус .285→.399. Кабина, кольца, дом/труба согласованы; весь trainRoot не масштабирован. Передняя буферная балка использует плоский burgundy `#7b3536`, map=null; свет фары не усилен.

Train-local bounds X≈±.501111, Y≈0…1.833, Z≈−3.865…1.411. `chimneyAnchor=(0,1.834,.61)`. Train nose+Z, neutral position=(0,0,0), yaw=−.65 под railwayRoot. Neutral railwayRoot=(2.75,−.65,−3.10); frozen desktop compositor ставит X=3.5.

Семь осей и сцепка сохранены. Локомотив: Y=.24, Z=−.55/−.08/+.39; вагон: Y=.16, Z=−3.34/−3.03/−2.07/−1.76. Wheel pivots bind rotation=0, ось вращения local+X. Узкие контактные полосы добавлены внутри прежнего envelope колёс. Все14 колёс имеют реальный ray contact на gauge X=±.41, ошибка local rail-top Y=0 менее6×10⁻⁹. Боковые тяги статичны.

Рельсы и train имеют общий yaw−.65. Rail top railway-local Y=0, environment Y=−.65, ширина .04. Шпалы Y=−.13…−.07; основание пути Y=−.25…−.13. Нижний край боковой кромки и trackbed environment Y=−.90 касается пола. `railwayRoot` перемещает состав и путь вместе; `train.root` — только состав.

Часы смотрят в+Z; bind стрелок в+Y, rotation=0, pivots Z=.102/.120. Отрицательный rotation.z — по часовой стрелке спереди. Окружение часы не обновляет. Звонок сохраняет bell-button без picking/команд. Обе лампы — emissive, без дополнительных Light. У первой потолочный origin и соединение с рукой навеса, у второй — внутренняя перемычка. `buildMenuLamp(kit,{stemExtension:.20})` удлиняет обычный стержень и опускает абажур/диск/лампочку, сохраняя крепление на Y=0; итоговая высота .693. Default без options остаётся .493, compact — .175. Negative/nonfinite extension и compact с ненулевым extension отклоняются RangeError. В окружении первая лампа имеет extension=.20; её origin не смещён вниз. При переносе lamps согласовать опору: нейтральная геометрия не перестраивает подвес автоматически.

`buildMenuSuitcase(kit,color,stickers?,{size?})` сохраняет старый вызов. Размер size — тело, без ручки/ножек. Фурнитура/закругления и ремни строятся локально, root scale=1. Наклейка .30×ширина тела, квадратная, circle/diamond UV-crops224² из A07. `userData.bodySize/bodyBounds/contact/decalSlots` описывают фактические размеры и зазоры. Невместимые/неположительные/нечисловые размеры отклоняются RangeError.

| Имя / порядок         | Body size      | Position в environment root | Yaw  |
| --------------------- | -------------- | --------------------------- | ---- |
| luggage-left-back /0  | `.90×.50×.34`  | `(−2.15,−.9,1.9)`           | .13  |
| luggage-left-front /1 | `1.00×.55×.38` | `(−1.85,−.9,2.6)`           | −.06 |
| luggage-left-low /2   | `.78×.46×.30`  | `(−1.23,−.9,2.06)`          | .08  |
| luggage-right /3      | `.90×.55×.34`  | `(1.95,−.9,1.2)`            | −.20 |

Подошва каждого prop-local Y=0. A08 на brown/wood чемоданах сохранён; если требуется кожаная фактура из PNG, это отдельная заявка 2D владельцу, новая текстура здесь не нарисована.

## Layout рам и перспектива

`board.bounds/settingsBounds` и аргументы `setLayout` — **stationRoot-local номинальные прямоугольники** для neutral rotation самих рам. При identity stationRoot совпадают с прежним environment-root space. max.z — передняя плоскость, min.z=max.z−.04. `setLayout` принимает конечные Box3 и положительные border в тех же единицах, сохраняет quaternion/rotation рам, обновляет размеры/position и освобождает заменённые geometry. Вызывать при resize/изменении DOM, не каждый кадр. Getters innerPlane/settingsPlane возвращают актуальные meshes.

`getCorners()` возвращает новые world Vector3[] с четырьмя углами, порядок TL/TR/BR/BL: board/settings — внешние front corners, aperture/settingsAperture — inset после border. Front соответствует local Z=0 каждой рамы; учтены transforms всех предков. Это bounding quad закруглённого прямоугольника. После yaw bounds не являются world AABB физической рамы. Старый `compositor.projectFrame(bounds)` для yaw не подходит: native DOM нужно преобразовать по четырём спроецированным world corners.

Подвесы settings-hangers теперь дочерние settingsRoot, identity position: поворачиваются вместе с табличкой. Они не входят в прямоугольник UI и bounds. Neutral constructor содержит рамы выше нового пола: board Y=−.27…1.936, settings Y=−.75…−.40, обе front Z=.04. Compositor переопределяет layout по actual DOM rect. После dispose setLayout/getCorners бросают ошибку.

## Ресурсы и арт

`buildMenuModels()` работает без картинок. Optional art принимает clockFace/luggageStickers/wood как уже загруженные Texture; builder создаёт собственные clones и не освобождает входы. Геометрии, материалы и texture clones всего environment, включая retained parts, освобождает один idempotent dispose. Кассирша, арт загрузчика и renderer имеют отдельное владение; дополнительный обход environment для dispose не нужен.

A05 clock-face.svg512², A07 luggage-stickers.svg512² и A08 wood-tile.webp256² извлечены из frozen commit. Три RGBA clones с mipmaps ≈3 145 730 bytes. A05 заменяет геометрические риски часов, A07 shared между четырьмя чемоданами, A08 RepeatWrapping на wood. Происхождение — public/menu/art/provenance.md/inventory.json2D ревизии. Новых сторонних моделей/изображений нет.

## Общие кадры и измерения

Перед/после используют compositor **dd43dc0a234e90a1801888ba10319f9126cf271c**, cashier **08bc3c42b0a93e9aecd591c1bf549368c6f7b9a1**, art **97ec1b1ed8dc292529b7367cc1cea275f6c9fa9a**. Использованы только зафиксированные файлы, чужие dirty tips не подключены. DOM snapshot index.html SHA256=`306d519be258b93e92a8ca5b4b4fbd4dd2a19d53fd373abd96f8f842c8b74c6c`. Камера1672×941: `(0.04,.52,6.4)`, FOV34, без roll; свет/shadow неизменны.

Before — environment4a281d5; after — round1. В общем after прилавок околоY604px, основание панели околоY816px, пол перед кассой видим. Raycast actual floor показывает Y−1.45→−.90. Perspective diagnostics дополнительно задают station yaw27°, relative board/settings yaw.04rad и native DOM homography по getCorners. Смещение outer support/фон применяется только в варианте moved-parts. Ошибка actual CSS corner markers ≤.027px. Это проверка API и конкретного harness, не приёмка production compositor/его угла.

Runtime: headless Chromium150 / YaBrowser26.8, macOS, DPR1, WebKit WebGL; аппаратная GPU модель не установлена. ACES exposure1.1, hemisphere+directional, одна shadow1024². Environment с A05/A07/A08: **32 194 tri,75 meshes/geometries,15 материалов,3 texture clones,3 083 364 bytes vertex/index buffers**. Before:26 430 tri,42 meshes,14 материалов,2 530 020 bytes buffers. Текстуры не выросли. Shadow/framebuffer/MSAA/cache и ресурсный объём кассирши в environment оценку не входят.

| Общий кадр                 | CPU build median /p95,25 повторов | Main calls /tri |
| -------------------------- | --------------------------------- | --------------- |
| Before1672×941             | 18.5 /21.7 мс                     | 66 /86 154      |
| After1672×941              | 24.3 /27.2 мс                     | 97 /91 702      |
| Yaw27° moved parts1672×941 | 23.7 /27.3 мс                     | 99 /91 918      |
| After1280×720              | 23.4 /27.6 мс                     | 97 /91 702      |
| After1920×1080             | 23.3 /25.7 мс                     | 97 /91 702      |
| After900×1000              | 22.7 /27.2 мс                     | 75 /80 440      |

CPU timer включает только build моделей с уже загруженным art, без shader/GPU upload/layout. p95 — 24-я отсортированная выборка из25. Main counts включают настоящую кассиршу; shadow pass считается renderer отдельно. Значения не измеряют FPS/GPU frame time. В diagnostic99calls запас до целевого100 мал; новые meshes общей сцены требуют повторного замера.

## Проверки и границы передачи

Проверены Prettier, TypeScript, fixed-base suite и production build; отдельный preview build включает окружение и frozen настоящую кассиршу, основной App пока его не импортирует. Contract harness проверяет15 retained parts с настоящими перемещаемыми meshes, отдельную правую стойку, floor/support alignment,14 wheel/gauge контактов, worldToLocal рук, порядок/fresh world corners, сохранение rotation при layout,20 rebuilds с освобождением заменённых geometry, finite inputs, bounds без подвесов, dispose×2 для91 текущего ресурса, сохранность caller Texture и независимость bundles. Исходная texture в этом contract harness общая для трёх art slots; поэтому количество отличается от bundle с тремя разными input textures.

Независимый read-only reviewer подтвердил retained геометрию, рельсы/колёса/пол и ресурсное владение. Найденные случаи исправлены: settings-hangers не следовали yaw таблички, компактная лампа не имела физической опоры, neutral settings frame пересекал поднятый пол, два левых корпуса чемоданов пересекались. Проверка SAT подтверждает разделённые XZ footprints всех шести пар чемоданов. Итоговый verdict указан в handoff с точным SHA.

Основная приёмка — desktop1672×941. Проверки1280/1920/900 ограничены отсутствием ошибок и доступностью native actions в preview. Новые 2D v3, final transforms, safe zones и shader/GPU frame time остаются задачами общей интеграции. Новый зафиксированный cashier f3c5383 проверен отдельно ниже. Доработанная лампа над доской проверена также в новом зафиксированном перспективном кадре: абажур виден над доской, верх крепления/стержня находится за верхним crop. Общая сцена выбирает final transforms, не подхватывает диагностические варианты автоматически. Lifecycle menu→game/20 циклов и игровой баланс этим статичным harness не проверялись. Следующий этап движения автоматически не начинается.

## Проверка нового зафиксированного общего ракурса

Дополнительный harness использует compositor **0457437310e7ca0ba9212cf4e17d3ec10c4b46d6**, cashier **f3c5383f3ce136f23256772b836001defdc9d899**, прежний art97ec1b1. HTML/preview source извлечены из опубликованного portable archive; HTML SHA256=`0fb7210afcf607fec7d62a6ecc59805bc64d2d3e4df71494f789a4e43d2ea641`. Source compositor/cashier извлечён по точным Git commits. Это дополнительная проверка стыка; исходное before/after на dd43 сохранено. Production foreign файлы не изменены.

Временный harness после frozen layout переносит yaw27° с environment root на stationRoot, восстанавливает world railway=(3.5,−.65,−3.1)/identity, задаёт outer support=(1.7,0,−.2) и backdropRoot.x=2. Физические board/settings остаются на рассчитанной frozen planeZ=.04; frozen projectCorners/native CSS работают с настоящими meshes. Эти адаптации надо выполнить в owned compositor при интеграции, их нет в environment builder.

**Согласованный handRestRight=(.10,0,.15) cashier-local допустим для прилавка**, соответствует station-local=(.10,0,.17). Default environment anchor остаётся (−.35,0,.17). В harness proposal anchor временно получает station-local (.10,0,.17), затем оба options переводятся через настоящий worldToLocal; constructor default не меняется. Проверены оба варианта с новым cashier. В proposal обе skin-кисти minY≈.002, по шесть нижних skin points имеют реальные ray hits прилавка на Y≈0. Билет в station-local X=.10863….28597, Y=.07217….32805, Z=.05607….14252. Holder расположен слева (его внешний правый край X=−.61), левый край bell base X=.653, зазор до билета ≥.367. Кисть/бумага помещаются над поверхностью X=±1.015, Z=−.31….39; holder и bell не мешают предложенной точке. Исходные skin/cuff/paper invariants новой позы проверены владельцем cashier и не изменялись в этом harness.

На1672×941 билет proposal проецируется X861.96–896.74,Y516.46–578.60, вместо default X744.66–786.38,Y511.58–577.14. Стем лампы над доской удлинён на .20; видимая область fixture X272–413,Y0–78 близка к исходному ориентиру. Компактная лампа над окном заканчивается околоY255.91, верх увеличенной головы Y289.86: видимый зазор ≈33.95px, силуэты разделены; compact minY1.505 выше максимума головы1.26633 на .23867. Верхние вершины cashier для этого замера отобраны по station-local Y≥.8; полный bundle головы не пересобирался.

В новом общем harness: environment32194tri/75meshes, desktop99main calls/91918tri, narrow93calls/87716tri. Ошибка native corner probes ≤.047px на1672/1280/1920/900. HTTP failures0,page/console errors0. Реальные clicks по «Правилам», Escape, Tab на настройки, Enter открытия native формы и возврат focus после Escape прошли на всех четырёх размерах. Ни один диалог не запускает игровую сессию. Подробные данные — menu-round-1-current-composition-checks.json в handoff.

Оркестратор согласовал (.10,0,.15) для конфигурации общей сцены, левую точку оставил (.35,0,.15). Builder defaults сохраняются. Текущий cashier tip **5cd16df3901b8101c462b354395db073696e5e45** отличается от проверенного f3c5383 только docs/menu-cashier.md; геометрия и поза побайтно прежние. В compositor сначала задать retained counter.handRestRight.position=(.10,0,.17) в station-local, затем получить оба options через актуальные localToWorld/worldToLocal относительно cashierAnchor. Не передавать hardcoded world координаты. Имена файлов current-proposed сохраняют название этапа проверки; точка уже согласована для общей композиции.

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

Согласованные color slots: `cream` — штукатурка; `green` — крашеные стойки/фасад/состав; `wood` — арка, столешница, скамья; `woodDark` — интерьер/полки/путь; `leather` — brown luggage в следующем geometry pass; `stone` — пол/платформа; `boardPaint` — физическая `boardInnerPlane`; `paper` — физическая `settingsPlane` и другие paper детали окружения. Это единый surfaces API, отдельных top-level leather/boardPaint/paper полей нет. Другие palette kinds также типизированы, но 2D сейчас производит только эти реально нужные карты.

Приоритет карты: `surfaces[kind]`, затем legacy `wood` только для kind wood, затем одноцветный материал. Все карты SRGB base-color. `Texture.clone()` сохраняет источник изображения и transform/repeat/offset/rotation/centre; клону задаётся RepeatWrapping по U/V, исходная Texture не изменяется. Default repeat `(1,1)`. Новые карты умножаются на white color, если нет `materialOverrides[kind].color`; explicit color умножает карту. Legacy A08 wood без surfaces.wood имеет muted varnish tint `#ae9479`. Без карты используется palette color с optional override. Numeric roughness/metalness требуют finite `[0,1]`, emissiveIntensity finite `>=0`. Normal/roughness maps пока не входят в этот color-only контракт.

UV не являются world tri-planar mapping: Box/RoundedBox используют стандартный `(0..1)` на каждой грани; Extrude использует стандартные Shape XY coordinates и edge/depth mapping, фасад/арка сохраняют model-local метры. Для verticalWood UV меняются `(u,v)→(1-v,u)`. Batch/consolidate сохраняют UV. Art owner должен дать мелкий бесшовный tile без нарисованных объектов, текста и baked света; composer может задать repeat на входной карте перед construction, клон сохранит его. Отдельный woodDark slot не наследует legacy wood.

`models.surfaces: ReadonlyMap<MenuMaterial, THREE.MeshStandardMaterial>` возвращает реально созданные shared owned surfaces. Stable name `menu-surface/<kind>`, userData.menuSurface=kind. Значения материала mutable для настройки общим дизайнером; map structure read-only на уровне TypeScript. Texture prints A05/A07 остаются отдельными mapped clones, поэтому смена color paper не перекрашивает печать. Scene owner не должен dispose эти материалы или входить в kit lifecycle. Idempotent `models.dispose()` освобождает все owned geometry/material/map clones ровно один раз, входные art textures сохраняются. После dispose surfaces map пуст.

Этот API commit фиксирует только surfaces/overrides и palette. Геометрия визуального раунда и её новое измерение передаются отдельно; старые значения resource/performance выше относятся к round1 и не считаются проверкой новых карт. Камера, default contacts, stationRoot ownership, retained parts и board corners не изменены.
