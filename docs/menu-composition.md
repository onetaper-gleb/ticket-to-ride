# Статичная общая сцена меню

Текущая ветка `design/menu-ticket-office-composition` объединяет полные принятые истории environment `e6ba05d28ecf7f372717f89ef122499e0ea25c87` (70→606→aca→e6), cashier `61a19996a12a245b8c724f878db7eb2e4c3fe846` (b7→6f→61a) и art `9e6a6b250135fef2f59cc3a5ba95bfb6a7419ce2` (полная история82→ddc→9e6) от базы `bea9743`. Кассирша b7 отличается от c489 только документацией. Чужие dirty files не используются. Приоритет — desktop и максимальное сходство с `menu-station-2.png`; адаптив отложен прямым указанием владельца. Общая художественная приёмка ещё не достигнута. Анимации остановлены; production App/session/config/manifest/Sites этим владельцем не меняются.

## Загрузка и владение

`createMenuComposition({assetBase, signal})` загружает десять уникальных SRGB texture inputs, binary собственных кистей и optional canonical SVG title. Inputs принадлежат compositor/art loader, model kit владеет отдельными clones, meshes и materials; cashier владеет своей геометрией, кистями и бумагами. Skin binary/source hashes сохранены. Texture loads используют allSettled, успешные inputs при ошибке освобождаются once; Blob URLs отзываются. Title — текст/Shape данные без самостоятельных GPU ресурсов. Его HTTP/parse failure оставляет native fallback; отмена caller signal отклоняет factory и очищает art. Поздний результат после закрытия не прикрепляется к сцене.

Существующие surface slots cream/green/boardPaint/wood/woodDark/leather/stone/paper/sky связаны с собственными файлами принятого art9e6. Stone repeat8×8, sky repeat(1,.7)/offset(0,.4), прочие maps1×1. Wood/paint aliases не создают повторных input loads. Sky использует один kit clone на двух existing meshes: black diffuse/white emissive1, emissiveMap===map, ClampToEdge. Solid scene.background — резерв; whole-scene PNG и новые background planes не используются.

## Камера и контакты

Camera(.04,.52,6.4), FOV34°, stationRoot yaw27°, environment root identity. Вместе поворачиваются facade/window/counter/anchors/cashier/board/clock. Railway сохраняет world(3.5,−.65,−3.1) и identity orientation; train/platform yaw−.65. Камера статична. Outer support local(1.7,0,−.2), backdropRoot.x2, часы10:10. Положение props вычисляется из исходного snapshot; resize не накапливает смещение.

Actual right(.10,0,.15)/left(.35,0,.15) contacts переводятся между настоящими parents/anchor один раз после updateMatrixWorld. Cashier root под cashierAnchor сохраняет identity. Предложение left.x=.43 не принято и не применяется. Holder papers принадлежат cashier, расположены под real ticket-slot с offset(0,.005,0), identity quaternion/scale. Portrait print texture повёрнут на90°, paper/grip не вращаются отдельно. В исторической проверке77 projection бумаги62.911×88.311px, skin/cloth-paper и holder-wall intersections0, lower paper gap≥.00151. Skin/sleeves/cuffs minY≈.002 и12lowest-point counter rays проходят. Эти проверки не заявляют clearance скрытого lower torso и всех mixed-bone/coplanar triangles.

## Native плоскости и объёмный EUROPE

`layout(width,height,boardRect?,settingsRect?,titleRect?)` получает не трансформированные native border boxes. Board/settings x/y — выбранные screen ориентиры, width/height — исходные размеры. Их corners unproject на station-local z=.04 и передаются в board.setLayout. `projectCorners()` возвращает actual physical front quad TL/TR/BR/BL; DOM получает полную homography через menuQuadCssMatrix, текст и hit areas имеют тот же перспективный угол. Settings hangers вне front quad. Отклонение native/physical corners≤.038px в проверенных desktop размерах.

Optional titleRect задан относительно верхнего левого угла native board border box, в CSS pixels. Compositor переводит его доли board width/height в actual board.bounds size, центрирует X и меняет направление Y. Source — только `art/sources/europe-shape-source.svg`: full viewBox600×120,6paths/3holes, SHA25639b05d8b8863db9f61a6a9c31646f0fa5f9a5429e567f7c4e2d93cbae6340aed. Public Three SVGLoader применяет source translate(62,22) один раз. Decorative europe-mark.svg с тремя use не экструдируется.

В историческом снимке77 при1672 native title box(78,58,370,74), world board size1.733867382×1.964398496, local target min(−.601753974,.547131125)/max(.656149813,.791032951). Environment retained titleRoot/setTitleShapes создаёт одну3308-triangle extrusion: rear−.001/front+.009/depth.008/bevel.001. Shapes/boxes caller-owned и не мутируются. Ordinary resize меняет положительный finite root transform и сохраняет geometry; invalid Float32 dimensions/scale отклоняются до allocations/mutations. Environment numeric closure70 проверена отдельно root.

`titleVisible` читает фактическую видимость titleRoot и false после dispose. Native caller скрывает visible decorative SVG через visibility:hidden и делает board/header paint прозрачным только после successful layout. DOM размер, доступное h1 и actions сохраняются; rows имеют свой paint. Отсутствующий title rect, clear или failed hook возвращают единственный SVG и native paint. Preview fixture setVolumeTitleEnabled и ?flat-title проверяют этот переход; production wiring принадлежит интегратору. HTTP503 title source оставляет обычное меню работоспособным.

## Четвёртый раунд света и глубины

Неизменяемая технически принятая основа77e709e сохранена в outputs/checkpoints/menu-composition-77e709e-preview.zip, SHA256a39b1a7446fc251918a9211d56400b3e2157adbdc83c00366871ee28dff3108a. Этот собственный light/depth delta использует те же принятые env70/cashb7/art82: в этом сохранённом light/depth снимке новые модели и токены арта ещё не подключены. Сравнение before/after делается при одной камере/геометрии/maps/native sizes.

Платформенный reflected fill освещает underside навеса снизу: canopyFill RectArea#dedbd0/intensity2/size4×2, parent actual parts.canopy, localposition(4.2,−.45,−1), local aiming(4.2,0,−1), up(0,0,1). Ориентация задаётся до parenting, затем наследует station yaw; −Z light axis направлен строго вверх; выбранный up устраняет вырожденность lookAt при вертикальном направлении. Источник не создаёт geometry/map/shadow target, compositor явно снимает его с parent до model cleanup. Shared LTC уже используется существующим RectArea fill. Дневной key теперь(6,7,−3)/2: тени направлены к ближнему полу, угол/градиент у оснований стоек заметнее. Header/face сохраняют прежний localfill и native paint; canopy shade не заменяет отсутствующие foreign depth planes.

Near focal plane5/coefficient.75 мягче показывает ближние чемоданы/скамью; far focal10.5/coefficient.9 и maxradius3 сохранены, ближняя ходовая поезда/лицо/физический title остаются в резком band. AO24/radius.2/min.0003/max.015 и graph/full-depth/half-target sizing не менялись. Смена key shadow frustum влияет на multipass draws; новый RectArea добавляет один light, но не draw mesh/post target. Общая художественная приёмка pending.

## Текущие параметры

Сохраняются existing shadow/post targets. Hemisphere#bed0e2/#918675 intensity1.1; key#fff2df intensity2 в(6,7,−3), shadow2048²/radius8/intensity.8. RectArea fill#fff1dd intensity6,size5×4 в(2,3,4), lookAt(0,.5,0). Train Spot#ffe2b1 intensity200/distance12/angle.3/penumbra.9/decay2 направлен на actual boiler local(0,.95,.55), без shadow.

Lamp sources находятся на.02 ниже actual contact.height. Board2/distance5/angle.9, window4/3/1.1, distant4/3.5/.8; color#ffcf83/decay2. Window penumbra1/target localZ−.25 мягко заполняет интерьер; прочие penumbra.75. Только window castShadow1024²/radius2. Изменённый shadow frustum может менять multipass calls; это не новые lights или targets.

Cream#c6cbd1/roughness.95, woodDark#887660, stone#c0b9ae/.92, boardPaint#abb8b0/.88, paper#d8d2bc/.95, leather roughness.9. Iron#3d454a/.6/metalness.25; actual named steel#3d454a/.6/.45. Mapped green уже содержит base color: текущая линейная channel grading(1.4,1.05,1.8) делает beams/facade менее насыщенно зелёными. Raw art не меняется. Свет header спокойнее, floor теплее, котёл темнее; material pass остаётся художественным промежуточным решением, полного сходства это не доказывает.

## Preview и проверка

Own standalone harness: ACES/exposure1/DPR1/PCF/static shadow refresh; RenderPass→MenuAO→две depth Gaussian→Output→FXAA. Normal/depth full physical resolution; AO/blur half. Shared actual depthTexture устанавливается после ShaderPass uniform clone. Focal radius clamp(max(5−depth,0)×.75+max(depth−10.5,0)×.9,0,3);9taps/axis до±6px. Rear axle depth10.396 даёт r0. Viewport/DPR memo исключает лишнюю переаллокацию targets; сам graph сохранён; в четвёртом раунде изменён только near coefficient/band.

Native optional friends callback даёт «Играть с друзьями» без hint после new и до tutorial. Его присутствие моделируется ?network=1, событием и requests counter; реальные комнаты не относятся к harness. В историческом harness77 actions-frame338/416/458px сохранял внешний размер; при overflow nav314/392/434 плюс noninteractive footer24: «Ещё действия↓», «↕ Прокрутите меню», «↑ Действия выше». Без overflow footer/aria-describedby сняты. Ниже viewport остаются tutorial/rules, доступные обычной прокруткой/Tab. Все пять одновременно видимыми в initial frame не заявляются.

Историческая проверка77 покрывала six save/error states, Retry/aria/Tab/ShiftTab/Enter/focusreturn/desktop resize и actualcontacts. Root accepted fresh initial full Start label/icon proof; причина старого диагностического raster clipping не установлена. Independent affected review: title target error≤.000023px,20redraw/3resize samegeometry, clear/injectedfailure/HTTP503 recovery, one visible title/h1/nativefocus;10inputs/11clones и все проверенные title geometries освобождены once. Abort/late title response после pagehide не создаёт orphan. Bench/trolley/luggage/hands hull safe zones≥8px, минимум9.892px.

Scene/calls/GPU samples/CPU arrays/map estimates и exact source/harness provenance сохраняются в текущем outputs manifest и JSON. GPU queries измеряют статичный draw с shadow refresh, не FPS/DOM/layout/presentation. Post buffers≈60MiB приDPR1, вне shadows/LTC/bones/default framebuffer/driver. Старые952/e9/914 measurements остаются историческими и не подменяют новый замер. Основные существующие chunky-build warnings сохранены. Main/gameplay/menu→game/animation/release acceptance этим статичным harness не заявляются.

## Обязательная политика

Ничего из Аркадии или внутренней инфраструктуры Яндекса: code/deps/repos/components/build systems/services/API/docs/credentials/tools/skills, прямо или черезagents. Только собственный проект, ordinary Git/GitHub и public open-source с проверенным происхождением и лицензией. Three MIT/Playwright Apache2/Vite MIT уже применялись; новых dependencies/fonts в этом раунде нет. Canonical title и texture art авторские. Foreign geometry changes возвращаются владельцам через локальные outputs, которые читает оркестратор. Обратные сообщения не требуются; отклонённую отправку не повторять.

## Принятая печать четвёртого раунда

После отдельной приёмки root импортирована полная чистая история art82→ddc4e38→9e6a6b2. Четыре SVG изменяют печать и значки, остальные прежние изображения и canonical title сохранены. Принятая спецификация public/menu/art/sources/desktop-fit-round4.json задаёт один ориентир1672×941; её диагностические unconditional CSS overrides не импортируются как общий stylesheet. Own presets/harness получают отдельные desktopPrint tokens и интерполяцию трёх десктопных узлов.

На1672 header122/gap6/font46/continued32/icon56/column98, headerpadding14/copy[6,16,6,20]/leftboardextra19. Label line1.05/scaleX.89, title display.90×1.10, settings font30/icon48/scaleX.92. Mark layout370 и canonical source600×120 сохранены; измеренный native display rect(94,54.3,333,81.4) задаёт прежнему compositor единственный physical title. Native fallback/h1 сохраняются.

На1280/1672/1920 own derived header86/122/148, rowfonts36.8/46/50.6, icons45.82/56/61.09 и columns75.38/98/109.31. Эти размеры согласуют крупную печать с шириной узла; mobile/narrow tokens не меняются. Внешние board/settings rects сохранены через исходную формулу physical frame; освобождённая высота header добавляется fixed action viewport:348/430/474. На1280 даже четыре строки с dynamic hints используют прокрутку; на1672/1920 четыре обычные строки помещаются. Пять строк и длинные ошибки прокручиваются, footer остаётся24px/pointer-none/tabIndex−1, focusin переносит активную кнопку в viewport.

Own native affected QA проверяет actual три размера, four/five actions, friends callback без hint, New/Rules hits, keyboard Tab/Shift+Tab с пропуском disabled, Settings Enter/Escape с возвратом, обе длинные ошибки/Retry и physical↔native fallback. На1672 row top-left(109.03154,211.39032) совпадает с прототипом art9e6. Source outerframes совпадают с a081, native/physical corners≤.038px. Production game/storage/network и широкий старый titleloader/lifecycle suite не повторяются.

В снимке4780 settingsPaper API/цвет ещё не подключён и compositor clone не имитируется. Cashier geometry/руки, env builders, production App/styles/session/config/manifest/Sites не меняются. Свет, постобработка, камера и контакты сохранены из a081. Художественная приёмка остаётся открытой; аниматор остановлен, адаптив отложен.

## Сборка принятых моделей четвёртого раунда

Полные rootaccepted истории cashierb7→6f2ad2a→61a1999 и environment70→606cd2e→aca3d2d→e6ba05d импортированы обычными Git merge после frozen4780. Ни один dirty foreign checkout не копировался. Изменились head/fringe/eyes/shoulders и caller-local профиль resting fingers; frozen native hands.ts/algorithm/binary/source JSON сохранены. Root identity, left.35/right.10, transform-once цепочка, мировой right grip/mainpaper/holder остаются обязательными условиями. Left.43 не применён.

Статическая квалификация owner/root для61a: paper/distal crossings0;55 default nonpalm proximal/middle pairs закрыты собственной тканью в495samples камеры77. Это не обещание всех ракурсов или анимации. Геометрия cashier +280tri/+20160B; palette/materials прежние. Owner CPU warm37–40ms послеfirst52.62ms не является FPS. Чужая геометрия в этой сборке не исправляется.

Новые accepted environment606 формы полок/заднего проёма/кровли/дальней зелени/багажной фурнитуры/скамьи/поезда оцениваются вместе с art9e6 и новым положением canopy fill. Reference positions сравниваются в master14, полного сходства пока нет. Camera/yaw/native outer frames/print tokens, focal5/.75/far10.5/.9 и contacts остаются из4780.

Принятый optional settingsPaper APIaca подключён собственным materialOverrides.settingsPaper: #F2D5BD/roughness.95. Этот оттенок выбран среди трёх runtime trials под текущим общим светом; полная художественная приёмка цвета/края не заявляется. Он отделяет main physical settings frame и settingsInnerPlane, наследует resolvedpaper и прежнее paper-tile изображение. Secondary strip/clock/labels/прочиеpaper материалы не перекрашены. Clone/material принадлежат kit, compositor не создаёт и не освобождает их отдельно. Нового asset loader/input/dependency нет; расходы отдельной роли измеряются на actual renderer.

Принятый canopyPaint APIe6 подключён собственной physical color linearRGB(1.1,.8,1.45)/roughness.7/metalness.08 к трём mesh каркаса, без перекраски wood ceiling. Цвет выбран совместно с поднятым canopyFill после runtime сравнений: яркие trials делали балки бледными. Материал и clone map принадлежат kit и используют прежнее green-paint изображение. Нового изображения или geometry из-за цвета/света нет. Потолок всё ещё краснее и темнее эталона; полное совпадение цвета, глубины и фона не заявляется. Animator остановлен, адаптив отложен; производство/Sites без изменений.
