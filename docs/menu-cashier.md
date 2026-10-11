# Кассирша меню «Билетная касса»

Статичная revision 6 продолжает `61a19996a12a245b8c724f878db7eb2e4c3fe846`. Нос стал уже и рельефнее, основной объём щёк собран, воротник округлён. В тканевых рукавах добавлены неглубокие складки, свободные части левых пальцев стали компактнее. Новая правая поза не включена: проверенные варианты пересекали бумагу, левую кисть или собственную одежду. Исходные правая кисть, кости, grip и бумага сохранены. Общая визуальная приёмка открыта; аниматор остановлен.

## Основа сравнения

Кадры до/после собраны на immutable compositor `1bab208aa1871f93a7af15265ad2053dff6db312`. Checkpoint ZIP:45 962 032bytes, SHA256 `082aa0f920d96753bdb5db517c1bc7739244c2eb664a7bdd92a2644f31e6cdfe`. Scratch harness заменяет cashier builder/type/preload imports и добавляет readonly DOM metrics. Общие камера, свет, maps, DOM, post и окружение сохранены.

Оба кадра: камера `[.04,.52,6.4]`, FOV34°, station yaw27°, viewport1672×941/DPR1. Head bbox183.8455×168.1489px и бумага62.9114×88.3114px прежние. Границы включают невидимые vertices. Whole eye/pupil bbox дельты от нового рельефа не превышают.14px. Материалы и palette не менялись.

## Новая форма

Нос: Gaussian tip amplitude.38→.455, rx.3072→.264192, ry.2387→.205003; центрY−.28 прежний. Bridge и alae используют новую ширину. Main cheek amplitude.115→.125, rx.5208→.45012, ry.40→.35; центры прежние. Это рельеф одного закрытого mesh, без нарисованной фиксированной тени. Глаза, head yaw/profile, размер головы и положение шеи не менялись. Face topology:20 224tri,30 336 welded edges с incidence2, finite unit normals.

Два воротника получили quadratic rounded outline: corner radius≤.07 author units и≤.30 соседнего ребра; depth.06, bevel.04, три bevel segments. Каждый закрытый collar имеет572tri вместо60, zero degenerate triangles. Отражение левой детали baked в geometry. Бант, лацканы и их placement прежние.

`buildSleeve(points,widths,depths=widths,foldCenters=[])` сохраняет прежнюю topology20sections×20sides. Необязательные fold centers должны быть конечными в[0,1]. Gaussian width.06, radial depression до.0045root и≤.12 меньшего радиуса. End rings не меняются. Cloth centers:[.72,.86] на верхних рукавах,[.18,.32] на правом предплечье. Кремовые манжеты не получают складки. После деформации применяется прежний counter floor clamp, затем пересчитываются normals.

Левая кисть сохраняет scale.218, Euler `[π/2,0,−.08]`, thumb curl/opposition.35 и positive X flex index/middle/ring/little `[1.15,1.25,1.15,.8]`. Caller меняет только независимую returned geometry: прежние widening и верхний lift.012 сохранены; distal finger mask сжимает глубину к contactZ+.072, округляет четыре lobes поX, подтягивает внешний край на максимум.020root и уменьшает верхнюю высоту на20%. Деформация плавно включается выше contactY+.004 и достигает полной силы на+.025; нижний contact bandY≤+.003, palm и wrist прежние. Позиции возвращаются в bind coordinates через обратную weighted skin matrix; normals пересчитываются на welded posed surface и преобразуются тем же линейным skin map, что использует shader.

Full left skin bbox67.729×35.412→65.884×35.412px. Это умеренная правка; открытый thumb/index контур и длина lobes ещё отличаются от PNG. Более сильные thumb curls дали новые thumb/index crossings и отклонены. Caller форма рассчитана на текущую статичную позу, последующая анимация требует отдельной проверки.

## Правая кисть и ограничение хвата

Сохранена правая поза61a: scale.16; Euler `[−π/2,−.18,−.18]`; root-space rollZ=−.44×reach; thumb curl/opposition.725; positive X flex `[.85,.10,.15,.20]` с коэффициентами суставов `[.64,1.12,.8]`. `reach=clamp((rightContact.x+.35)/.52,0,1)`. Правый локоть: X=min(contactX−.055,−.34), Y=contactY+.06+.015×reach, Z=contactZ−.21.

Разрешённые wrist/grip изменения проверялись при сохранённых markers и actual counter. У широкой горизонтальной руки возникли293 proper distal пересечения с левой кистью; у другого разворота —70 с собственным предплечьем. Компактный free-finger fold устранил distal cloth crossings, но бумага пересекала кожу. Последние130 вариантов in-plane paper roll и80 index/thumb/opposition configurations не дали квалифицированной новой позы в проверенном диапазоне. Это ограничение конкретных проб, не доказательство невозможности любого хвата через native API.

Одного minY=.002 и неизменённого marker недостаточно для сохранения physical contactX/Z. В отклонённых offset-пробах расстояние marker→actual near-plane support выросло с.023951 до.250611–.390521root. Они не включены. Следующее предложение: искать иной native pinch при тех же anchors и выводить translation из фактической опоры, затем проверить конечную стойку и весь posed skin/cloth/paper bundle. Если для PNG нужна другая опора, требуется отдельное конкретное предложение с actual support probes; left anchor.43 автоматически не применяется.

## API и placement

`buildMenuCashier({handRestLeft?,handRestRight?})` возвращает identity `root` в cashierAnchor coordinates: +Y вверх,+Z к зрителю, counter planeY0. Options клонируются; нечисловые координаты отвергаются. Defaults left `[.35,0,.15]`, right `[−.35,0,.15]`. Согласованная композиция задаёт right `[.10,0,.15]`. Root placement выполняет compositor один раз; root, anchors и реальные контакты не переносятся этой ревизией.

Возвращаемые поля: `root`, `ticketGrip`, `handRestLeft`, `handRestRight`, `forearmPivot`, `ticketsForHolder`, `ticket`, `hands.left/right`, `dispose()`. Main paper — один BoxGeometry mesh1.1×2.1×.006hand units под wrist→ticketGrip. SVG печать изображает два билета на этой одной плоскости. Mesh identity, геометрия, локальные/world transforms и цепочка владения бумагой прежние. Правые bone/world matrices и bind attributes совпадают с61a; holder тоже прежний.

Перед первым builder call вызвать `await preloadMenuHandSurfaces()`. `ticketsForHolder` можно reparent к ticket-slot, затем задать local `[0,.005,0]`. Preview placement находится в cashier-local coordinates. Frozen `setHandPose` presets после сборки сбросят адаптированный щипок. Builder не содержит rAF, timers или mixer; `frustumCulled=false` обеих кистей сохранён.

`dispose()` идемпотентен: освобождает уникальные geometry/material/skeleton ровно один раз, включая holder после reparent. CPU blueprint/cache сохраняется, GPU arrays и ресурсы экземпляров не разделяются. Внешние textures, назначенные интегратором, освобождает их владелец.

## Проверки и стоимость

Default/agreed: actual skin/cloth triangles clear paper volume; proper distal finger↔finger, hand↔hand и crossbody cloth↔left skin crossings0; holder skin crossings0. Actual retained counter raycasts дают обеим кистям gap≈.002; все пальцы одновременно на стойке не лежат. Проксимальная кожа входит в собственное закрытие манжет/рукавов; эти пересечения учитываются отдельно. Proper tests исключают tangent/coplanar, same-finger и mixed dominant-bone seams, поэтому не доказывают отсутствие любых solid intersections.

Проверены root/contacts/right bones/paper/holder, finite buffers, left skin indices/weights, cache и независимость ресурсов. Ранее созданная и новая native кисть побайтно прежние. Native module, algorithm/API, binary и source JSON readonly. Binary SHA256 `b32c68c067a91f3a245fbb4588d187734cf434cc4558ff5a20805d7568f95ccc`; остальные hashes и fresh closure proof передаются в handoff.

Стоимость: **68 384tri /23meshes /21geometry /17materials /2skeletons /7 409 928bytes geometry buffers**. Дельта к61a:+1024tri/+73 728bytes у двух воротников. Left warp и folds не добавляют topology. Warm CPU assembly с preloaded native и тёплым fringe cache:40.96–46.74ms в одном локальном ряду. Cold extraction/shader compile, GPU и FPS не измерялись; shadow/post draw triangles в браузере не являются bundle triangles или FPS.

Strict targeted TypeScript, focused Prettier, diff check, portable Vite build и парный browser capture прошли. Независимое ревью и exact-source/proof/capture binding передаются в handoff. Широкая gameplay QA не повторяется: игровые правила, session и UI flow не менялись. Голова, волосы, носовая тень и обе кисти ещё отличаются от PNG. Статичная визуальная приёмка и последующая анимация остаются отдельными этапами.

## Происхождение и политика

Геометрия адаптирует собственные helpers из `src/scene/characters.ts` на `bea9743c7622a7806a3d9b6824a9d912b0a41b65`; frozen hands сохраняют собственный алгоритм `src/scene/cartoon-hands.ts` того же commit и CPU binary preload. Runtime imports игровых characters/table builders отсутствуют. Новых моделей, изображений, шрифтов или зависимостей нет. Существующий Three.js использует публичную MIT-лицензию. Печать `public/menu/art/ticket-print.svg` принадлежит 2D дизайнеру; её map/UV/provenance и общие материалы этой веткой не меняются.

По прямому требованию владельца запрещены код, зависимости, repos, tools, skills, документация, сервисы, API и credentials Аркадии/внутренней инфраструктуры Яндекса, включая read/search/copy/adapt/execute и косвенное использование через детей. Только ordinary Git/GitHub, собственный проект и публичный open-source с проверенной открытой лицензией. Запрет передан всем проверяющим.
