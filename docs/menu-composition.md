# Статичная общая сцена меню

Текущая ветка `design/menu-ticket-office-composition` объединяет полные принятые истории environment `e6ba05d28ecf7f372717f89ef122499e0ea25c87` (70→606→aca→e6), cashier `61a19996a12a245b8c724f878db7eb2e4c3fe846` (b7→6f→61a) и art `9e6a6b250135fef2f59cc3a5ba95bfb6a7419ce2` (полная история82→ddc→9e6) от базы `bea9743`. Кассирша b7 отличается от c489 только документацией. Чужие dirty files не используются. Приоритет — desktop и максимальное сходство с `menu-station-2.png`; адаптив отложен прямым указанием владельца. Общая художественная приёмка ещё не достигнута. Анимации остановлены; production App/session/config/manifest/Sites этим владельцем не меняются.

Текущий принятый набор после пятого раунда: environment `a479d99b2e07eb87925826effd43e51cf0b11558`, cashier `dd6673441bf46b279bcc27a0bbe7f6748cc2c421`, art `2f7f03e47c8b56aac8747c32ebbe018bca0420d8`, собственный свет/расстановка `c8bec331d064d3e3ecdccf69655c38522f84a849`. Исторические разделы ниже сохраняют состав своих снимков.

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

## Свет и глубина сохранённых снимков a081/1bab

Неизменяемая технически принятая основа77e709e сохранена в outputs/checkpoints/menu-composition-77e709e-preview.zip, SHA256a39b1a7446fc251918a9211d56400b3e2157adbdc83c00366871ee28dff3108a. Этот собственный light/depth delta использует те же принятые env70/cashb7/art82: в этом сохранённом light/depth снимке новые модели и токены арта ещё не подключены. Сравнение before/after делается при одной камере/геометрии/maps/native sizes.

Платформенный reflected fill освещает underside навеса снизу: canopyFill RectArea#dedbd0/intensity2/size4×2, parent actual parts.canopy, localposition(4.2,−.45,−1), local aiming(4.2,0,−1), up(0,0,1). Ориентация задаётся до parenting, затем наследует station yaw; −Z light axis направлен строго вверх; выбранный up устраняет вырожденность lookAt при вертикальном направлении. Источник не создаёт geometry/map/shadow target, compositor явно снимает его с parent до model cleanup. Shared LTC уже используется существующим RectArea fill. Дневной key теперь(6,7,−3)/2: тени направлены к ближнему полу, угол/градиент у оснований стоек заметнее. Header/face сохраняют прежний localfill и native paint; canopy shade не заменяет отсутствующие foreign depth planes.

Near focal plane5/coefficient.75 мягче показывает ближние чемоданы/скамью; far focal10.5/coefficient.9 и maxradius3 сохранены, ближняя ходовая поезда/лицо/физический title остаются в резком band. AO24/radius.2/min.0003/max.015 и graph/full-depth/half-target sizing не менялись. Смена key shadow frustum влияет на multipass draws; новый RectArea добавляет один light, но не draw mesh/post target. Общая художественная приёмка pending.

## Параметры сохранённого1bab

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

## Сборка принятых моделей в снимке1bab

Полные rootaccepted истории cashierb7→6f2ad2a→61a1999 и environment70→606cd2e→aca3d2d→e6ba05d импортированы обычными Git merge после frozen4780. Ни один dirty foreign checkout не копировался. Изменились head/fringe/eyes/shoulders и caller-local профиль resting fingers; frozen native hands.ts/algorithm/binary/source JSON сохранены. Root identity, left.35/right.10, transform-once цепочка, мировой right grip/mainpaper/holder остаются обязательными условиями. Left.43 не применён.

Статическая квалификация owner/root для61a: paper/distal crossings0;55 default nonpalm proximal/middle pairs закрыты собственной тканью в495samples камеры77. Это не обещание всех ракурсов или анимации. Геометрия cashier +280tri/+20160B; palette/materials прежние. Owner CPU warm37–40ms послеfirst52.62ms не является FPS. Чужая геометрия в этой сборке не исправляется.

Новые accepted environment606 формы полок/заднего проёма/кровли/дальней зелени/багажной фурнитуры/скамьи/поезда оцениваются вместе с art9e6 и новым положением canopy fill. Reference positions сравниваются в master14, полного сходства пока нет. Camera/yaw/native outer frames/print tokens, focal5/.75/far10.5/.9 и contacts остаются из4780.

Принятый optional settingsPaper APIaca подключён собственным materialOverrides.settingsPaper: #F2D5BD/roughness.95. Этот оттенок выбран среди трёх runtime trials под текущим общим светом; полная художественная приёмка цвета/края не заявляется. Он отделяет main physical settings frame и settingsInnerPlane, наследует resolvedpaper и прежнее paper-tile изображение. Secondary strip/clock/labels/прочиеpaper материалы не перекрашены. Clone/material принадлежат kit, compositor не создаёт и не освобождает их отдельно. Нового asset loader/input/dependency нет; расходы отдельной роли измеряются на actual renderer.

Принятый canopyPaint APIe6 подключён собственной physical color linearRGB(1.1,.8,1.45)/roughness.7/metalness.08 к трём mesh каркаса, без перекраски wood ceiling. Цвет выбран совместно с поднятым canopyFill после runtime сравнений: яркие trials делали балки бледными. Материал и clone map принадлежат kit и используют прежнее green-paint изображение. Нового изображения или geometry из-за цвета/света нет. Потолок всё ещё краснее и темнее эталона; полное совпадение цвета, глубины и фона не заявляется. Animator остановлен, адаптив отложен; производство/Sites без изменений.

## Пятый раунд: направленный свет и нейтральный камень

Собственная дельта строится на принятом source/package1bab с art9e6/cashier61a/environmente6. Foreign camera/light/models из dirty scenes не копировались. Camera(.04,.52,6.4)/FOV34, station yaw27°, outer board/settings frames, title target и canonical SVG сохранены. Post graph, shadow resolutions и число shadow lights прежние. Полная художественная приёмка открыта.

Текущий key#ffead0/intensity4 в(8,5,−4), shadowradius10/intensity.95 даёт тёплый свет сзади справа и широкую диагональную тень на полу. Hemisphere intensity.5 и existing RectArea fill3.8 уменьшают равномерное заполнение; windowlamp5 сохраняет чтение кассы. CanopyFill intensity2.5 сохраняет local/up/aim/size1bab. Слишком сильная зелёная roof bounce проба не принята: она окрашивала каркас. Новых light/mesh/map/shadow/post targets нет.

Текущие material overrides: wood linearRGB(.85,1.1,1.45), stone(.38,.44,.6)/roughness.92, cream#c8c8c5/.95, green(1.35,1.45,2.1), canopyPaint(.75,.8,1.75)/.7/.08. Paper#d8d2bc прежний, settingsPaper#d9e1d7/.95. Brass#b79853/.3/.55 усиливает золотой тон физического title и фурнитуры. Inputs/13kit clones/role materials имеют прежних владельцев; borrowed images не меняются. Own native Settings overlay#e4dcc6b3 убирает pink из прошлого1bab; цвет не меняет layout/hit/keyboard contract.

Передний и нижний левые luggage group отодвинуты поZ на.15 до сохранения origins; resize применяет desktop luggageAdvance к этим origins без накопления. Задний luggage остаётся вZ2.1: его retreat перекрывал Settings на1672/1920. Bench group yaw−1.1 вместо−1.2; position/scale прежние. Все worldY vertices/floor contacts сохранены, geometry arrays не меняются. Railway/train/platform оставлены в прежнем общем transform: пробы horizontal retreat уменьшают train width всего на3–5% и не исправляют front proportions. Более сильный bench corner shift слишком урезает левый край относительно PNG; не применён. Camera proposal пока не требуется.

Физический EUROPE остаётся одной3308tri extrusion depth.008/bevel.001. Проба нового shadow у boardlamp стоила56draws/+80648tri без достаточного выигрыша и не применена. Для читаемой gold грани owner получил точную заявку на measured bevel/depth trial. Для потолка нужна отдельная inherited canopyWood роль: общий wood grading помогает арке, но отдельная светлая древесная плоскость пока не отделяется от красноватого base map. Geometry/material API и texture changes выполняют владельцы; compositor ждёт только rootaccepted exact clean full tips.

Rightworld byteequality сохраняется с текущим61a. В round5 оркестратор разрешил cashier owner будущую targeted right wrist/forearm/grip pose вместе с parent paper; для такого принятого tip прежняя world pose не будет hard invariant. Anchors/root identity/holder contacts/transform-once остаются. Старую pose compositor самостоятельно не восстанавливает. До нового принятого tip sampled61a qualification остаётся исторической границей проверки.

Dynamic hints/friends/errors/обаRetry/footer24/focus/scroll и доступное h1 сохранены. Проверяются только затронутые desktop/material/light/placement/native contrast/reuse/cleanup и current draw cost; старая broad game/loader QA не повторяется. Анимация остановлена, адаптив отложен. Точные owner заявки и текущие residuals сохраняются в own outputs/master14; root читает локально, reverse messages не нужны.

## Принятый арт пятого раунда

После frozen c8bec импортирована полная rootaccepted история art2f7f03e47c8b56aac8747c32ebbe018bca0420d8 поверх9e6. Пять existing512²maps, sky/dial/continue и provenance подключены в собственной общей сцене через exact Git blobs, dirty foreign files не используются. Environmente6ba/cashier61a остаются прежними; непринятый environmenta479 не импортируется. Камера, light/post/shadows, contacts, исправленный back luggage и весь native layout сохранены.

HDR wood/stone/green/canopy linearRGB текущего c8bec сохраняется: diagnostic hex snapshots из art material-contract не восстанавливают HDR значения. Settings physical#d9e1d7/.95 и overlay#e4dcc6b3 уже дают кремовый тон с новой paper map; proposed legacy tint не применяется автоматически.

Own native print заменяет итоговый rectangular border одним accepted sources/settings-edge-print.svg512×128 на whole settings face. Final pseudo border0/inset0, background100%100%, pointer-events:none; icon/label наz1 выше printz0. Native bounds/padding/fonts/labels/focus/scroll/footer24/actions и обаRetry прежние. SVG содержит только printed line/patina: physical edge/thickness/hooks остаются у environment. Это одна browser decode/paint layer без нового Three texture/material/mesh; actual decode/paint и full draw cost фиксируются отдельно с честными оценками raster memory.

Current accepted inputs/evidence/master14 и новый immutable common checkpoint сохраняются отдельно от frozen c8bec. Полная художественная приёмка открыта, аниматор остановлен, адаптив отложен. Ничего из Arcadia/internalYandex прямо или косвенно; ownproject/ordinaryGit/GitHub/verified publicOSS.

## Общая сборка принятого окружения и исправленной кассирши

После frozen art-only f1ff477 перенесены полные rootaccepted histories environmenta479 и cashierdd667 обычными Git merge. Exact SHA каждого принятого source сохраняется; dirty foreign checkout не копируется. Ревью и ZIP компонентов приняты оркестратором отдельно. Rejected cashier9750 остаётся историческим предком исправленного dd667 и отдельным отклонённым снимком; его состояние не используется как финальная версия.

Environment уточняет кроны, дальние корпуса с настоящими оконными углублениями, светлый двор за кассой, багажную фурнитуру, скамью, фонари и поезд. Физические доски получают ступенчатый кант; край Settings неровный внутрь прежних наружных габаритов. Cashierdd667 уточняет нос/щёки/воротники/складки и свободные части левых пальцев при точном сохранении исходной опоры. Palette/native hand binary/right bones/paper/grip/holder/root/contact anchors прежние. Новый правый хват остаётся отдельной задачей владельца; непринятые anchors не переносятся.

Собственные composition/presets/art loader побайтно равны c8; native harness побайтно равен f1ff477. Камера/FOV/yaw, HDR material grade, восемь lights, shadow/post targets, title3308tri, исправленные luggage origins/benchyaw и CSS Settings SVG print сохраняются. Native четыре/пять действий, hints/friends/обаRetry/scroll/footer24 и focus проверяются только в затронутой общей desktop сцене. Broad game/loader/анимация не повторяются.

Actual scene1672:131meshes/129geometries/41materials/203484tri,2skeletons,20372268Bgeometry arrays. Кf1ff477:+7meshes/geometries/+8798tri/+820032B; environment+7774tri и cashier+1024tri. Map objects14/input10/kitclones13 и actual renderer23textures прежние. Full draw484calls/792095tri, main129/203374; post targets estimate62940768B прежний.12warm non-disjoint GPU queries Chromium151/ANGLE Metal AppleM4Pro: median4.072666ms/p954.663208ms. Это статичный draw с обновлёнными shadow, без DOM/layout/presentation; не FPS и не controlled speedup comparison.

Путь пока сохраняет headY−.65: согласованное опускание railway/train/presets до−.78 выполняется только после rootaccepted исправленного профиля основания. CanopyWood и новая gold bevel также ждут отдельных принятых owner tips. Художественная приёмка OPEN; общий кадр/master14 и новый immutable ZIP сохраняются отдельно от прежних. Аниматор STOPPED, адаптив отложен. Ничего из Arcadia/internalYandex прямо или косвенно; ownproject/ordinaryGit/GitHub/verified public licensedOSS.

## Шестой раунд: связанный путь и отдельный потолок

После frozen accepted29cff5e перенесена полная rootaccepted environment912 history: ground17b→canopyWooda5→docs912 поверхa479. Собственный preset задаёт railwayY−.78 во всех ветвях; путь/поезд/платформа остаются одной retained группой. Actual floor−.90/backing−.902, basebottomlocal−.122, ballasttop−.095 и sleeper−.095…−.07 уже согласованы владельцем геометрии. Старый consumer−.65 с новой основой оставил бы её висеть примерно128–130mm; builder constant не заменяет layout preset. Camera/FOV/yaw/X/Z/native outerframes/anchors прежние.

Optional canopyWood активирован отдельным собственным override: первоначально наследует resolved wood, затем его оттенок выбирается в общем кадре. Он касается только216tri двух прежних liner plates, использует существующую wood map и owned clone. Другие wood/canopyPaint материалы, foreign UV/geometry и caller inputs не меняются. Нового loader/input/dependency нет.

Узкая диагностика frozen29 resize1672/1920→1280 закрыта без sourcefix: old persistent world-corner wait счётчик не сбрасывался, поэтому мог принять previous layout до resize event. Current settled native DOM/physicalframes совпадают сcold1280, backgap127.3623px; source/ZIP29 неизменны. Отдельный read-only report сохранён вне frozen package.

Новый свет/material/post grade подбирается по actual1672frame/crops рядом с original, с отдельно сохранённым ground-only кадром. Тёплый пол/потолок, мягкие тени и foliage/brass grade принадлежат compositor; crown/title/sky/rightgrip owner tips пока не приняты и не подключаются. Художественная приёмка OPEN, animatorSTOPPED/adaptivedeferred. Ничего internalYandex/Arcadia прямо или косвенно; ownproject/ordinaryGit/GitHub/verified public licensedOSS.

### Раунд 6: песочный пол и мягкий свет

На принятых моделях912 и прежних art2f7/cashierdd667 выбран вариант `gentle-fill`. Камера, FOV34, station yaw27, native frames, карты, UV, опоры и цепочки рук сохранены. Ground consumer использует−.78 во всех presets. Постобработка прежняя.

Свет: key3.2, PCF radius24/intensity.65, hemisphere.8, front area4.5, canopy area1.8, rail spot110. Положения, targets, восемь источников, две shadow maps2048/1024 и размеры area lights прежние. Это снижает контраст диагональной тени; PCF фильтрует её край, но не воспроизводит физический источник большой площади.

Linear grades: stone(.85,.74,.6), plasterShade(.24,.21,.175), canopyWood(1.12,1.15,1.12), foliage(.65,.72,.3), foliageLight(.9,.94,.45), foliageDark(.37,.47,.2). Ceiling roughness.92; foliage roughness.95. Brass#a18e70/roughness.55/metalness.4 уменьшает жёлтый блеск поезда и багажа; общий title использует ту же роль.

Изолированные actual crops на одном AO kernel показывают причину ярких линий пола: реальные3mm зазоры открывают unmapped backing/plasterShade, тогда как mapped stone был холодным(.38,.44,.6). Линии сохранялись при отключённых AO и key shadow; согласованный grade подложки устранял яркий контраст. Зазоры остаются геометрическими швами. Изменены только supported material overrides, а не чужие поверхности.

CanopyWood назначен двум существующим liner plates216tri. Новый mapped role добавляет один материал и один принадлежащий kit Texture wrapper, разделяющий image/Source с wood. Caller Texture fields/version/dispose не меняются; общий Source.version может увеличиться при стандартном Three.clone/needsUpdate. Финальные actual resource/lifecycle/контактные и native checks приложены к отдельному checkpoint раунда6. Результат является текущим кандидатом: общая художественная приёмка открыта, формы крон, хват и небо остаются в работе их владельцев; адаптив отложен.

### Общая сборка раунда 6

Root принял exacta90 SOURCE+PACKAGE. Поверх него полными histories подключены environment50cb (Medium title471386 + layered crowns50cb), sky9b201fe и cashier a033d6f (два opt-in предложения). Чужие mutable checkout и последующие непринятые titleBrass/new grip tips не копировались. Own grade a90, camera/FOV34/yaw27/railwayY−.78/native frames/maps UV/post сохранены.

Для разрешённого root сравнения API `createMenuComposition` получил optional `ticketGripPose: 'left-support'`. Он передаёт accepted profile и coupled right marker(−.155883,0,.161828); actual skin support(−.155883,.002,.161828). Left marker остаётся(.35,0,.15), whole left skin XYZ/root/holder/hand binary/source module сохраняются. Бумага следует wrist→grip, отдельного world move нет. Без option композиция использует прежний agreed cashier profile/right marker(.1,0,.15). Default builder cash a033 unchanged относительноdd; это не утверждение неизменности нового общего кадра, где title/crowns/sky другие.

Own preview вызывает новый profile явно. `?agreed-grip` показывает agreed pose на тех же current environment/sky/light/native frames; main/Sites consumer не менялся. Current default preview — сравнительная left-support trial, а не финальная художественная holding acceptance. Её кисть ещё длиннее/уже PNG, pinch ниже середины билета; новые proximal cloth/skin joins и self-surface ограничения accepted owner scope сохраняются. Owner продолжает новый профиль отдельно; dirty изменения не подключены.

Новый checkpoint содержит fresh common1672/14crops/master14, контакты/native readability/sky42rays/cost/lifecycle/sourcepackage и independent affected review. Shared brass всё ещё бежево-матовый; будущая titleBrass роль не применяется до отдельного accepted exact tip. Художественная приёмка OPEN, animatorSTOPPED/adaptivedeferred. Ничего internalYandex/Arcadia прямо или косвенно; только ownproject/ordinaryGit/GitHub/verified public licensedOSS.

### Раунд 7: золотой заголовок, солнечная полоса и глубина

Поверх принятой общей a783 подключена полная accepted история environment760c631: отдельная роль titleBrass. Только заголовок получает #e8b66c/roughness.35/metalness.42. Латунь поезда и багажа сохраняет a90 grade. Geometry, maps, UV, camera/FOV/yaw, contacts, railway−.78, native frames и comparative left-support profile прежние. Default без option сохраняет agreed хват. Новые interior/train/calmhand dirty изменения не подключены.

Daylight: key4.8, hemisphere.5, front area3.3 размером3×2.4 в(0,1.35,3) направлена к(0,.9,0), canopy bounce1.1, rail95. Подсветка лица/доски сохраняется, равномерная засветка пола/фасада уменьшается. Window lamp10, board3.2, distant5 создают локальные тёплые акценты. Направление солнца(8,5,−4) прежнее; диагональная полоса образуется настоящей геометрической тенью навеса.

Renderer использует exported menuCompositionRenderSettings.shadowMapType (VSM). Key2048/radius28/blurSamples12/intensity.9/normalBias.001; вторая shadow map1024 теперь у board lamp, camera near.05/radius2/blurSamples12/intensity.85/normalBias.001. Ближняя граница .05 включает буквы на расстоянии .236… .400 от shadow camera; прежняя .5 отсекала их. Window lamp не отбрасывает shadow. Тень носа мягче; буквы получают контактную тень от их лампы. VSM фильтрует moments, не моделирует источник большой площади. Softness/light bleeding требуют художественной оценки. Источников8, shadow lights2. Renderer hook обязателен для выбранного вида.

Exported createMenuDepthPasses(depthTexture, perspectiveCamera) возвращает два owned ShaderPass без собственных render targets. Они стоят после AO и перед OutputPass, в линейном color buffer. Full-resolution depth texture заимствуется из AO normal target. setSize обновляет resolution; near/far фиксируются при создании для камеры(.1…80). Focus band4.85…7.45 оставляет доску/лицо/часы резкими; near slope2.2/far1.15/cap3px при941px physical height смягчают ближнюю скамью и дальний поезд/листву. Девять Gaussian taps на ось отбрасываются при depth jump>max(.2,depth×.025), чтобы дальний цвет не проходил через ближние силуэты. Это separable depth blur; физическая lens/bokeh simulation не заявлена. Native DOM печать остаётся резкой.

Caller освобождает каждый pass с composer; depth target остаётся у AO. post.setSize/setPixelRatio передают физические размеры. При смене near/far consumer обновляет uniforms или пересоздаёт passes. Own preview подключает hooks; main/Sites/чужой Diorama не изменены. Интегратору нужны renderer/depth hooks в src/scene/Diorama.tsx; точный запрос и пример находятся в новом output package. Старые immutable checkpoints сохранены.

Fresh same1672 before/after,14crops/master,current title/native/safezones/contacts/resource/cost/targeted independent review выпускаются отдельным checkpoint. В новом master actual art9b201fe;2f7 остаётся print baseline. Художественная приёмка OPEN, animatorSTOPPED/adaptivedeferred. Только ownproject/ordinaryGit/verified public licensedOSS; ничего Arcadia/internalYandex прямо или косвенно.

### Раунд 9: сборка принятого интерьера, поезда и спокойного хвата

Поверх принятой 998 подключены полные histories environment ec996512/3e5b773 и cashier4da0dea. Первый assembly-only commit сохраняет весь свет/grade/VSM/depth из998. Foreign source/art равны принятым exact tips; dirty train material hooks не подключены. Camera/FOV34/yaw27/rail−.78, native frames, title3308tri/15mm, holder/root/wholeleft и native hand module/cache/bin/source JSON прежние.

Supported composition option теперь принимает calm-support вместе с coupled right marker(−.155883,0,.161828), как left-support. Без option сохраняется agreed. Root выбрал calm-support только для текущего сравнения: own preview явно включает его; ?agreed-grip пропускает option, ?left-support-grip сохраняет прежний comparison. Оба calm holding meshes используют общий owned paper material и print; paper placement остаётся в native wrist→ticketGrip chain. Production профиль окончательно не выбран.

Свежий assembly-only1672 кадр сохранён отдельно рядом с исходником и baseline998, до собственного следующего светового прохода. Master14 указывает новые currentInputs и actual art9b. Геометрия проёма/поезда/лица и рука принадлежат их владельцам; compositor меняет только supported grade/light и сообщает конкретные остатки. Художественная приёмка OPEN, animatorSTOPPED/adaptivedeferred; main/Diorama/network/Sites не изменяются. Никаких Arcadia/internalYandex источников или инструментов прямо либо косвенно.

В отдельном own grade/light commit wood получает linear(.82,1,1.17)/roughness.95 и небольшую постоянную emissive #775439/.09; woodDark #786651/.92/emissive#684229/.035. Это supported grade снижает видимый контраст повторяющейся карты, не меняя её pixels/UV/clone contract. Brass #b59056/.42/.4 теплее на раструбе и остальных существующих brass деталях; isolated titleBrass остаётся #e8b66c/.35/.42. Global iron/steel/warm прежние, будущие train hooks здесь не используются.

Существующая window lamp6.5/#ffdaab направлена правее и глубже: target localX.8/Z−.65 при прежней Y/fixture/light position. Новый проём получает тёплый градиент без дополнительного источника или shadow map. Остальные семь источников, VSM/depth factories/focus band и солнечная полоса998 сохраняются. Emissive offset — художественный grade, не физическая симуляция bounce. Геометрия всех принятых частей unchanged относительно assembly-only1c6d48a.

### Раунд 9: отдельные материалы поезда

После фиксации a87c961 подключена полная принятая история environment652b54a поверх3e5b773. Первый assembly-only1c6d48a и архив a87c961 сохраняются без изменений. Композиция задаёт два поддерживаемых override: trainIron #1c272c, roughness.62, metalness.3; trainHeadlamp #ffe5ad, roughness.28, metalness.05, emissive #ffc567, intensity1.5. Корпус и передняя дверца становятся темнее, линза получает тёплое свечение.

TrainIron назначен только60 железным деталям поезда, trainHeadlamp — только передней линзе240tri. Общие iron/steel/warm, латунь, заголовок, свет, карты и UV прежние. Две роли добавляют два owned материала; дополнительных источников света и render targets нет. Emissive линзы меняет её вид и не освещает окружение. Камера, контакты, native menu, agreed по умолчанию и явный calm-support comparison сохраняются. Свежие кадры, master14, native/lifecycle и целевая независимая проверка относятся к отдельному следующему checkpoint. Художественная приёмка открыта, аниматор остановлен, адаптив отложен; подключение в основное меню остаётся за интегратором. Только собственный проект, обычный Git/GitHub и проверенные публичные OSS; ничего из Аркадии или внутренней инфраструктуры Яндекса прямо либо косвенно.
