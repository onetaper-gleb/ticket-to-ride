# Окружение меню «Билетная касса»: визуальный раунд

Геометрия продолжает round1 `7bfee581e870b274769eb963d5033ebc710a3f51` и ранний surfaces API `c4746fbe35c445cf1d1c9ac9f941e7f31c349c4e`. Исходник — `menu-station-2.png`. Этот этап уточняет арку и интерьер, профиль стоек/кронштейнов, кровлю, путь, состав, кожу багажа и дальний вокзал; добавляет скамью, тележку, семафор и третью лампу. Всё статично; следующий этап движения требует общей приёмки.

Камера, свет, кассирша, DOM и загрузчик графики принадлежат общей сцене. Production чужих владельцев не изменён. Проверка геометрии зафиксирована на полном common snapshot `316f83085e4f1989779c57954f1014213b7fec0b`; следующий lighting snapshot `d43c1673b41a1444c5ebb886ead6a2b40e46ca79` передан общему дизайнеру для объединения exact tips. Это описание геометрического кандидата, а не финальная приёмка общего изображения.

## Текущий раунд 5

Собственная база — `e6ba05d28ecf7f372717f89ef122499e0ea25c87`, одинаковый caller — immutable common `1bab208aa1871f93a7af15265ad2053dff6db312`. Камера, свет, art, кассирша и native print фиксированы по принятому ZIP; эта ветка содержит только собственную геометрию и документацию. Художественная приёмка общей сцены ожидается; анимация остановлена, адаптив отложен.

Шесть деревьев теперь имеют четыре настоящие ветви и смешанный масштаб крон: крупные сферы с согласованной радиальной деформацией и малые икосаэдры с разными пропорциями. Существующий seeded generator задаёт формы и глубину; дополнительных карт, material roles и lights нет. Три корпуса вокзала имеют отдельные скатные кровли, настоящие девять оконных/дверных отверстий, длинные откосы и стекло, утопленное на .318м от лицевой стены. Три независимых навеса имеют стойки, подкосы и опорные балки, пересекающие нижнюю поверхность кровли. У малого корпуса отверстия сужены, чтобы их контуры не пересекались. Независимый reviewer обнаружил шесть наружных подкосов, которые верхним концом не доходили до балки; они удалены. На каждой стойке остаётся внутренний подкос с настоящим соединением.

Передняя задняя арка поднята; два длинных откоса расходятся к отдельному заднему арочному проёму. Трапециевидный пол переходит в каменный двор на прежней высоте Y−.0475 в interior-local. За проходом расположены отдельные здание, окно, sky-плоскость и дерево. В реальном ракурсе светлый двор и зелень видны справа от головы. Два ящика опираются на новый пол: actual underside/floor gap не больше7.46×10⁻⁹. На полках добавлены три корешка разных высот и два свёртка; реальные bottoms совпадают с верхом полок. Материалы/цвета остаются у compositor/art.

У доски появился тёмный наружный профиль полной толщины .04м, ступенчатый кант и угловые пластины под прежними винтами. Всё расположено вне native aperture. У бумаги Settings кромка состоит из коротких неравномерных кривых с уходом внутрь до9мм; физическая толщина .04м прежняя. Два кольцевых люверса соединены с плавными крючками. Outer bounds, getCorners, layout/title API и finite/Float32 numeric guards сохраняются. Затронутые surface probes, геометрия, три layout fixtures и lifecycle приведены в `menu-environment-round5-main-checks.json`; 52266 проверенных triangles без nonfinite, reversed winding и degenerate faces. Это конечные проверки поверхностей, не полная квалификация всех коллизий.

Поезд получил более узкий фронт, выпуклую дверцу, объёмный корпус/линзу фонаря, уточнённую трубу, две соединённые паровые трубки и колесные втулки. Труба сохраняет anchor/верхнюю границу; lens не добавляет light и использует прежний warm/emissive. Exact bbox, семь pivots/zero binds,28 tread/torus primitives и14actual wheel/rail contacts прежние; max world gap5.22×10⁻⁹. Итог28912tri/16meshes/9roles против25744tri базы. `menu-environment-round5-train-checks.json` содержит7784affectedtri,36profile/fitting joins,4pipe groups и30wheel joins, окна и disposal.

Багаж сохраняет корпуса, feet, края/концы ручек и A07, но ремни и уголки получили тонкие фаски, застёжки — сквозные рамки, штыри и петли; ручка — центральную накладку. У скамьи добавлены четыре литые втулки в соединениях. Подвесные лампы имеют чашу и завальцованный край при прежних наружных размерах/cap contacts; compact lamp сохраняется. Семафор стал тоньше в поперечнике при прежних floor/top/root/armPivot и placement. Actual props proof подтверждает657strict triangle joins, finite/unit normals/winding и lifecycle; per-case4346tri, bench4452, suspended1832, compact1312, semaphore1140. Суммарный рост четырёх чемоданов/скамьи/двух подвесных ламп1680tri/161280attribute bytes/0meshes. Новых maps/roles/lights/dependencies нет; размещение целых предметов остаётся у общего дизайнера.

Общий вертикальный уровень пути пока прежний: rail head worldY−.65, floor−.9. Связанное предложение railwayRootY−.78 вместе с поездом/путём и новым основанием у пола передано root отдельно; до согласования не применяется. Профиль пути и anchors побайтово прежние. Это остающееся отличие от низкого пути референса, а не объявленное исправление.

## Текущий раунд 4

Основа сравнения — immutable common `77e709e9f35bd11605ecda0a10045de5756a86ec`, собственный baseline `70f4fbb47cf9c95e8d4b4ba3272bff4a2e71ad37`. Общий свет, камера, native UI, кассирша и art остаются ровно из 77; чужие production-файлы не импортируются в эту ветку. Превью 1672×941 использует настоящий caller объёмного заголовка. Анимация остановлена, адаптивный проход отложен до общей художественной приёмки.

P0: шесть крон разной высоты и ширины на трёх глубинах состоят из сглаженных нерегулярных объёмов. Ветви начинаются на реальном стволе; между деревьями видны небо, отдельные вокзальные корпуса и навес. На 490 first-hit rays в skyline 176 видят sky, 278 — foliage; остальные — крыши/станцию. Это геометрическая проверка просветов, не оценка FPS или художественного сходства.

Полки имеют настоящий вырез в задней стене, разную глубину, смещённые короткие разделители, восемь пачек/ящиков и пустые участки. Четыре rays в пустых ячейках попадают на собственные задники local Z −.2175/−.3175/−.1675/−.2675. Задний арочный проход сохраняет передние откосы и порог; за ним появились длинные боковые плоскости, тёплые ящики и утопленная задняя стенка Z −1.4825. Небольшой sky inset расположен отдельно на Z −1.461. Новых источников света и material roles нет.

Кровля сохраняет наружную высоту, деревянный низ и контакты ламп. Толщина верхних плит уменьшена; балки имеют закрытый I-профиль, продольные рёбра связывают нижнюю обшивку с кровлей. В кронштейнах появились реальные отверстия, белая кромка и фестоны стали тоньше. Материалы прежние; отличия цвета/освещения остаются в общей сцене.

Балласт имеет трапециевидное сечение: верх X±.56/Y−.13, основание X±.80/Y−.25 в track-local. Шпалы, feet/plates и rail top/gauge прежние; центральная несущая плоскость не опускается. Боковая платформенная кромка также имеет небольшой откос. Основание по-прежнему на environment floor Y−.9. Это уменьшает прямоугольную массу через форму, без переноса контактов.

Independent P0 reviewer обнаружил зазор 47.5мм под двумя новыми ящиками заднего прохода. Ящики опущены на фактическую верхнюю плоскость нового пола; actual underside/floor rays теперь расходятся не более чем на7.46×10⁻⁹. Передний порог и контакты кассы прежние.

Affected main проверка: 58 416 треугольников интерьера/дальнего плана/кровли/опор/пути без вырожденных faces и обратного winding; finite positions/normals/UV; реальные отверстия кронштейнов, поверхность откоса и основания, rail heights и три lamp supports. 122 ресурса освобождаются ровно один раз при dispose×2, входная texture сохраняется. Код board/layout/title и Float32 guards побайтово прежний. Точный отчёт — `menu-environment-round4-main-checks.json`; стоимость общего renderer фиксируется отдельно на одинаковых входах 77.

Багаж получил более тонкие ремни, пластины, заклёпки, ручки и ступенчатые замки. A07, кожа, корпуса, концы ручек и положения четырёх чемоданов прежние. Скамья имеет более тонкие планки/ноги/подлокотники и одну дугу на сторону; верх сиденья Y.447, внешний bbox и напольные плиты сохраняются. Опоры подняты к новой нижней поверхности планок; actual triangle crossings подтверждают сопряжения. Standalone скамья4260tri, каждый обычный чемодан4070tri; четыре cases+bench дают−512tri/−49152attribute bytes при прежнем mesh count. Дополнительные регрессионные размеры багажа проверены отдельно.

Вагон получил округлённый нижний профиль, настоящие отверстия в боковых стенах, полые рамки и два высоких тёплых panes на окно. Крыши кабины/вагона — закрытые тонкие оболочки с внутренней дугой; внешние размеры прежние. Фронт имеет более плоское плечо дверцы, мелкие заклёпки, составные шарниры, втулки и соединённые трубы. Спицы сужаются к ободу, counterweights открывают больший просвет. Train standalone25744tri/16meshes/9roles, без своих textures. Все28 tread/torus primitives побайтно прежние; 7axles/zero binds,14gauge rays, точные bounds и chimneyAnchor сохраняются. Подробные affected proofs предметов/поезда находятся в `menu-environment-round4-props-checks.json` и `menu-environment-round4-train-checks.json`.

Промежуточный общий кадр выявил чрезмерное перекрытие стекла глубокими оконными рамками при текущем ракурсе. Glass centreX вагона/боковых окон кабины теперь±.450; внешние faces±.458/±.459 находятся внутри прежних рам с отступом5/3.5мм. Размеры panes, отверстия кузова, рамки/перемычки и материалы прежние. Actual oblique/axis rays и соединения pane/frame/midbar подтверждены. Независимый reviewer также обнаружил9.5мм зазор крепежа защёлки после уменьшения выпуклости дверцы. Основание удлинено назад при прежнем переднем торце; actual overlap с дверцей5.49996мм, сопряжение с ручкой сохраняется. Updated train fixture:10692affectedtri без вырожденных faces/ошибок winding,50join groups/129closed-solid samples; это конечные выборки, не доказательство всех возможных коллизий.

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
| backdropRoot       | root           | identity                  | Небо, шесть деревьев, дальний вокзал, фонари, семафор           |
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

Чемоданы сохраняют совместимый `buildMenuSuitcase(kit,color,stickers?,{size?})`. Brown/старый wood color теперь выбирает leather, без A08 древесины на корпусе; green остаётся крашеным. Корпус смягчён, U-ручка и тонкие ремни/замки объёмные. Латунные уголки состоят из плоских лицевых пластин, коротких загибов по кромкам и небольших заклёпок. Размер size задаёт тело, не ручку. Square decal=.30×bodyW, A07 circle/diamond UV crops224²; bodySize/bodyBounds/contact/decalSlots описывают actual bounds и положительные зазоры. Невместимые/неположительные/nonfinite размеры отклоняются RangeError.

| Имя                | Body W×H×D   | Neutral position   | Yaw  |
| ------------------ | ------------ | ------------------ | ---- |
| luggage-left-back  | .72×.63×.34  | `(−2.4,−.9,2.1)`   | .13  |
| luggage-left-front | 1.00×.55×.38 | `(−1.85,−.9,2.6)`  | −.06 |
| luggage-left-low   | .63×.39×.30  | `(−1.52,−.9,2.06)` | .08  |
| luggage-right      | .90×.55×.34  | `(2.15,−.9,1.2)`   | −.20 |

Высокий дальний левый корпус и меньший green корпус дают ступенчатую группу. Все6 пары body XZ footprints разделены в neutral. Перекрытие screen silhouettes допускается; физическое пересечение корпусов — нет. Для common narrow layout есть собственное luggageAdvance; его применяет compositor.

## Рамы и lifecycle

`board.bounds/settingsBounds` и `setLayout` — stationRoot-local номинальные прямоугольники, не world AABB после yaw; max.z — плоскость проекции native DOM, min.z=max.z−.04. Рельеф физической окантовки board выступает до max.z+.008, бумажной settings — до max.z+.0025; эти детали не меняют nominal corners. `setLayout` требует finite/Float32-representable Box3, вычисленные размеры/центры и positive borders, сохраняет rotation/quaternion, обновляет размеры/position и освобождает заменённые geometry. Вызывать на resize/layout, не каждый кадр. innerPlane/settingsPlane getters актуальны.

`getCorners()` возвращает новые world Vector3[] в порядке TL/TR/BR/BL: внешние board/settings и inset aperture/settingsAperture. Учтены transforms всех предков. Native DOM преобразуется по этим projected world corners. Settings-hangers дочерние settingsRoot, следуют её rotation и не входят в UI bounds. После dispose обе функции бросают ошибку.

Kit владеет geometry/material/Texture clones, включая retained части и временные batch pieces. Все входные Texture остаются у caller. Pending/merged geometry регистрируется до возможной ошибки Texture.clone; catch в buildMenuModels вызывает kit.dispose и сохраняет исходную ошибку. Circular Texture.userData failure проверен отдельно: project-created buffers освобождены, caller Texture не dispose. Успешный dispose idempotent; surfaces map очищается. Кассирша, загрузчик art и renderer имеют отдельный lifecycle.

## Визуальный раунд 3 и проверка

Раунд 3 использует committed common `e9c95c287cdb25f5e1521b977c3e9b30a404f4aa`: art slots v4, новые cashier materials и общий lamp/rail fill. Immutable accepted compositor ZIP SHA256f0bb4fd3d113d3f01ef6b69d111ed6bc4ce63e134d33c9b7a6a4982bc50a533f проверен. Копии supplied compositor HTML и post harness имеют SHA256 в own source-manifest; production imports извлечены Git archive точного common tip. Before — environment `25cc620f5c7b7a7053de3c7eb55934867063bfb9`. HTML, art, cashier, camera(.04,.52,6.4), FOV34, station yaw27°, свет, AO/DOF и `network=1` одинаковы до/после. Dirty foreign production не подключается.

Доработки: шесть разной высоты крон с разветвлёнными стволами, асимметричными скоплениями и нерегулярными вытянутыми объёмами листвы; промежутки неба; три станции с разными скатными крышами, утопленными оконными проёмами и дверью, отдельный навес с колоннами. Поднятая brass окантовка board и увеличенные аккуратные крепления находятся внутри nominal XY. Settings имеет мягкий слегка неровный бумажный край и физическую рамку. Скамья — тоньше, woodDark планки, изогнутые arms/frame. Багаж сохраняет позиции/ступеньку и имеет plate fittings. Steel role отделяет front door/обода/колёса/тяги от green body paint и iron buffers/roof/chassis. World lights не добавляются.

`steel` fallback: color #817c73, roughness .47, metalness .58; no emissive/map. Он доступен compositor через surfaces/materialOverrides на общих условиях. Точная цветопередача зависит от его света; fallback не задаёт конечный grading сцены.

Contract checks:20 retained parts с actual meshes,14 wheel/gauge rays,3 lamp/ceiling rays,6 luggage body SAT pairs, floor contact, transformed anchors/quads,20layout rebuilds и освобождение replaced geometry, fresh corner vectors, finite validation, dispose×2/input0, independent bundles и exception cleanup. Native browser checks ждут actual dialog close/focus restore перед Tab. Проверяются page/console/HTTP failures, projected actual mesh hull зазоры8px до board/settings и неизменный hand/counter contact. Точные counts и результаты нового exact candidate находятся в `outputs/menu-environment-round3-*.json` и handoff; прежние числа относятся к предыдущим раундам.

Runtime — официальный open-source Chromium snapshot Mac_Arm1716370 (BSD3 и documented open-source third-party notices), Playwright Apache2, Three MIT, TypeScript Apache2, Node MIT. Browser provenance сохранён с результатами; новых production dependencies нет. Ничего из Аркадии/внутренней инфраструктуры Яндекса не используется, в том числе через agents.

Optional объёмный EUROPE: `board.titleRoot`, `setTitleShapes(readonly THREE.Shape[],sourceBoundsBox2,titleBoundsBox2)` и `clearTitleShapes()` согласованы с compositor. Canonical source — `/menu/art/sources/europe-shape-source.svg`, committed art `fdf0e6787c18ac321470e517a1c0a27a011689e8`, SHA256 `39b05d8b8863db9f61a6a9c31646f0fa5f9a5429e567f7c4e2d93cbae6340aed`: шесть оригинальных paths один раз. Full SVG viewBox(0,0)–(600,120), с уже применённым авторским translate(62,22). Декоративный `europe-mark.svg` содержит слои depth/highlight/front и целиком не используется для extrusion. Default shape code отсутствует: caller парсит own SVG через установленный Three SVGLoader. На1672 target XY min(−.601753974,.547131125)/max(.656149813,.791032951) соответствует native SVG x78/y58/w370/h74 внутри borderbox510×596. GetCorners и UI areas прежние.

Все shapes/bounds принадлежат caller и не мутируются. Shape контуры/holes семплируются16раз на curve в собственные XY outlines с разворотом SVG Y, затем строится одна merged ExtrudeGeometry: depth.008, bevel.001, front+.009/rear−.001 относительно board plane. Материал — owned shared brass из kit. Положительные titleRoot scales; Z scale1. Memo по значениям sourceBounds и контуров, titleBounds меняет root position/XY scale, не создаёт новый mesh. Bevel XY масштабируется вместе с resize; world depth остаётся постоянной. Layout сохраняет extrusion и временно скрывает root до передачи нового rect; rotations/quads сохраняются.

Finite positive bounds, finite/nondegenerate contours/holes, принадлежность sourceBounds и целевой rect внутри aperture проверяются до allocations. Новые buffers готовятся отдельно; ошибка attachment освобождает pending geometry, прежний title остаётся. Replacement/clear освобождают old geometry ровно once, clear повторно без изменений. Shared brass живёт до model.dispose и не создаёт материал на каждый replacement. После dispose методы отвергают вызовы, как остальные board API.

Numeric resize guard выбирает rejection без автоматического rebake. Target XY dimensions, target/source XY dimensions и вычисленный reuse scale должны оставаться конечными и строго положительными после `Math.fround`. Underflow до нуля и overflow до Infinity отклоняются до изменения geometry/root transforms и до owned geometry allocations. Например, после допустимой первой ширины1e−40 возврат к обычной ширине отвергается из-за scale1e40; caller может явно clear и снова задать обычный rect. Invalid rect сохраняет прежний title, включая visibility/position/scale; ошибка pending attachment освобождает только новый buffer. Обычные agreed1672 rect и последовательные resize сохраняют прежнюю extrusion.

Caller loader/abort/late-load/native fallback/resize остаются compositor. Он скрывает только декоративный SVG и делает board/header paint прозрачным после успешного hook, сохраняя native sr-only h1 `Ticket to Ride: Europe` и размеры. При clear/failure возвращает SVG/фон. Own title-preview показывает именно этот caller контракт; production DOM/compositor не менялись. Общий кадр зафиксирован на e9c95c2; дополнительный canonical shape source взят из accepted art fdf0e67 без подмены общего света/неба. Новых fonts/deps/lights нет.

Сходство раунда3 ограничивали крупная художественная фактура листвы, небо/облака, общий свет и crop foreground справа. Силуэты/ветви/просветы дорабатываются в текущем раунде4 на общей основе77; art отвечает за карты и 2D proposal по конкретной заявке, compositor — за свет и placement. Эти границы не скрываются успешной сборкой. Game/App/session/menu→game lifecycle и FPS этим static harness не проверяются. Финальный статичный кадр ожидает визуальной приёмки; анимации не подключены.

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

Согласованные color slots: `cream` — штукатурка; `green` — крашеные стойки/фасад/состав; `wood` — арка, столешница; `woodDark` — интерьер/полки/путь и планки скамьи; `leather` — brown luggage; `stone` — пол/платформа; `boardPaint` — физическая `boardInnerPlane`; `paper` — физическая `settingsPlane` и другие paper детали окружения. Это единый surfaces API, отдельных top-level leather/boardPaint/paper полей нет. Другие palette kinds также типизированы, но 2D сейчас производит только эти реально нужные карты.

Приоритет карты: `surfaces[kind]`, затем legacy `wood` только для kind wood, затем одноцветный материал. Все карты SRGB base-color. `Texture.clone()` сохраняет источник изображения и transform/repeat/offset/rotation/centre; клону задаётся RepeatWrapping по U/V, исходная Texture не изменяется. Default repeat `(1,1)`. Новые карты умножаются на white color, если нет `materialOverrides[kind].color`; explicit color умножает карту. Legacy A08 wood без surfaces.wood имеет muted varnish tint `#ae9479`. Без карты используется palette color с optional override. Numeric roughness/metalness требуют finite `[0,1]`, emissiveIntensity finite `>=0`. Normal/roughness maps пока не входят в этот color-only контракт.

Optional `settingsPaper` отделяет только основную extrusion рамки Settings и `settingsInnerPlane`. Без `surfaces.settingsPaper` и `materialOverrides.settingsPaper` (в том числе при explicit `undefined`) они по-прежнему используют тот же shared `paper`; материал, карта и batch не добавляются. При переданном map или override, включая `{}`, kit создаёт один отдельный материал. Он наследует уже разрешённые color/roughness/metalness/emissive/emissiveIntensity материала `paper`, затем применяет только defined поля собственного override. Карта берётся из `surfaces.settingsPaper`, иначе из `surfaces.paper`; при её наличии создаётся один отдельный owned SRGB/RepeatWrapping clone. Собственный map сохраняет унаследованный resolved paper color: white только если таким был `paper`, а не автоматически. Secondary strip и hangers, clock/tickets/labels и остальные paper детали остаются на прежних ролях. Входные textures immutable и принадлежат caller; повторный `models.dispose()` безопасен. Геометрия, UV, contacts/layout/corners и numeric guards этим API не меняются.

`#F2D5BD`/roughness `.95` — начальное предложение для общего физического света, не принятый color match. Переиспользование изображения paper tile не означает нулевую GPU cost: отдельный clone/material может дать дополнительный upload и draw; расходы измеряются на actual renderer. Новый loader, файл, font или dependency не требуется. Геометрический пакет раунда4 на606cd2e остаётся отдельной неизменяемой основой; этот API передаётся следующим отдельным commit.

Optional `canopyPaint` отделяет прежние green части только в `buildCanopy`: верхние плиты, I-балки/переднюю балку и `station-supports`/`canopy-right-support` (стойки, кольца, кронштейны). Без обоих собственных inputs, включая explicit `undefined`, используется тот же resolved `green` с его caller overrides/maps и прежним sharing/resource count. При собственном map или override (включая `{}`) kit создаёт один owned материал, наследует resolved green options, применяет defined canopy overrides; карта имеет приоритет `surfaces.canopyPaint`, затем `surfaces.green`, с одним owned clone при наличии. Этот fallback уточняет прежнее предложение, где green map не наследовался. Lower facade, board, train, far station и wood/cream/iron сохраняют прежние роли. Geometry/UV/transforms/contacts/layout/corners не меняются. Чужие caller/loader/light/camera/asset файлы не меняются; compositor подключает optional роль отдельно. Пробные `#4b5963`/roughness `.66`/metalness `.08` не являются принятым color match. Actual material/map/draw/upload delta передаётся отдельным отчётом, без заявления FPS или полного GPU budget.

UV не являются world tri-planar mapping: Box/RoundedBox используют стандартный `(0..1)` на каждой грани; Extrude использует стандартные Shape XY coordinates и edge/depth mapping, фасад/арка сохраняют model-local метры. Для verticalWood UV меняются `(u,v)→(1-v,u)`. Batch/consolidate сохраняют UV. Art owner должен дать мелкий бесшовный tile без нарисованных объектов, текста и baked света; composer может задать repeat на входной карте перед construction, клон сохранит его. Отдельный woodDark slot не наследует legacy wood.

`models.surfaces: ReadonlyMap<MenuMaterial, THREE.MeshStandardMaterial>` возвращает реально созданные shared owned surfaces. Stable name `menu-surface/<kind>`, userData.menuSurface=kind. Значения материала mutable для настройки общим дизайнером; map structure read-only на уровне TypeScript. Texture prints A05/A07 остаются отдельными mapped clones, поэтому смена color paper не перекрашивает печать. Scene owner не должен dispose эти материалы или входить в kit lifecycle. Idempotent `models.dispose()` освобождает все owned geometry/material/map clones ровно один раз, входные art textures сохраняются. После dispose surfaces map пуст.
