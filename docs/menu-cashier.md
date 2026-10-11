# Кассирша меню «Билетная касса»

Revision 10 уточняет только `calm-support` поверх принятой `4da0deacdc58b3829d462726294329a8f302c68a` на неизменённой сравнительной композиции `a87c96107baebbc8de180c0add107b08356b4d61`. Старые четыре режима, вся левая кисть, обе опоры, root, holder, native module/API/cache/binary/source JSON сохраняются. Правая skin geometry, все кости, wrist→ticketGrip и движущиеся forearm/cuff также прежние. Аниматор остановлен; художественная и production приёмка открыты.

## Revision 10: форма и конечная пара билетов

Новая форма щёк слегка шире в нижней части головы, с широким мягким и немного асимметричным рельефом. Размер головы, её placement и rotation не меняются. Радиусы белой поверхности глаз уменьшаются до `.181×.172` author units; pupil — `.132×.14`. Улыбка получает более широкие верхний/нижний lip fields `.08/.095`, умеренные peaks `.045/.05` и одну мягкую crease `.008` с радиусом `.04`. Её тонкая цветная линия следует скульптуре с offset `.012` и height `.002`. Face остаётся одной закрытой поверхностью из 20 224 triangles.

Контур чёлки проходит по диагонали лба. Её собственный immutable CPU blueprint не заменяет blueprint прежних режимов. Верхняя часть бордового торса, правое плечо, воротник и бант объёмнее. Левый рукав и манжета не меняются. Palette/материалы, maps/UV, общий свет, camera/grade/post и native controls прежние.

Билеты расширяются только к свободному краю: каждый shared BoxGeometry имеет width `.9`, height `2.55`, thickness `.003` hand units и geometry translation `[.175,1.325,0]`. Его конечные локальные границы — X `[-.275,.625]`, Y `[.05,2.6]`. Primary mesh сохраняет local identity, физический paper scale `.16`; размеры листа `.144×.408×.00048` root units. Подрезка нижних `.05` hand units сохраняет положительный зазор до стойки. Симметричное расширение ранних proposals пересекало thumb/seam и отклонено; эти кадры не являются collision-qualified результатом.

Secondary использует те же owned geometry/material/print map, local position `[.2897741572172491,.032641957203823034,-.0031]` и Z rotation `.25`. Его in-plane pivot остаётся `[0,1.05]` со сдвигом X `.03`. Плоскости, wrist-local grip position/quaternion, normal slot, толщина листов и interleaf gap сохраняются. Никакого отдельного поворота бумаги в composition нет. Обязательные right `[-.155883,0,.161828]` и left `[.35,0,.15]`, допуск `1e−6` и API прежние; новый paired marker/option не нужен.

Фактический opposed pinch расположен примерно на `.3922/.4169` высоты двух новых quad, внутри их конечных площадок и общего normal slot. Старое `.45–.55` утверждение относится только к revision 8. Thumb обращён к внешней back face secondary, index — к внешней front face primary. Положительные зазоры не означают давление, трение или динамическую устойчивость. Полные paper volumes проверяются против обеих posed skin surfaces, новой ткани/тела, holder, реальной стойки и всех retained a87 triangles; конечные patch границы опоры проверяются отдельно.

Стоимость нового `calm-support`: **70 168 drawn triangles / 24 meshes / 21 geometries / 17 materials / 2 skeletons / 7 537 512 bytes geometry buffers** плюс 2 816 bytes bone matrices. К revision 8 добавляется 396 triangles и 28 512 buffer bytes, без новых mesh/material/geometry объектов. Calm fringe blueprint — 147 432 CPU bytes. FPS/GPU/VRAM и performance acceptance не заявлены.

Независимые targeted SOURCE/CPU и PACKAGE reviews, source bindings, реальные before/current/reference crops и полный history replay передаются отдельным immutable пакетом revision 10. Входные кадры браузера имеют JPEG provenance; PNG сравнения получен из их декодированных кропов. Они не доказывают lossless framebuffer или pixel identity с исходным sealed a87 PNG. Проксимальные raw skin/self и skin/cloth crossings не выдаются за ноль; перенос незатронутых данных требует полной equality, видимость проверяется в актуальной сцене. Ни sampled/static доказательства, ни закрытость отдельных деталей не означают universal solid/animation proof.

Revision 8 добавляет отдельный статичный профиль `calm-support` к чистой базе `a033d6f104b3da98bfb767b3c0e0b3642e6325f1`. Прежние default/agreed/current-support/left-support сохраняются точно. Новая форма — предложение для визуальной проверки; аниматор остановлен. Production consumer не меняется.

Revision 7 добавляет два статичных предложения хвата к принятой базе `dd6673441bf46b279bcc27a0bbe7f6748cc2c421`. Они включаются через `ticketGripPose` вместе с явной правой опорой. Вызовы без новой опции сохраняют геометрию, позу, бумагу и контакты revision 6. Общая визуальная приёмка открыта; аниматор остановлен.

## API и опоры

`buildMenuCashier({handRestLeft?, handRestRight?, ticketGripPose?})` возвращает identity `root` в координатах cashierAnchor: +Y вверх, +Z к зрителю, плоскость стойки Y=0. Compositor размещает root один раз. Options клонируются; координаты должны быть конечными.

| `ticketGripPose`  | Обязательный `handRestRight` | Фактическая нижняя опора    | Разворот кисти вокруг Y |
| ----------------- | ---------------------------- | --------------------------- | ----------------------- |
| `current-support` | `[.10, 0, .15]`              | `[.10, .002, .15]`          | 2 rad                   |
| `left-support`    | `[-.155883, 0, .161828]`     | `[-.155883, .002, .161828]` | .9 rad                  |

Оба предложения требуют левой опоры `[.35, 0, .15]`. Отсутствующая или несовместимая явная опора вызывает ошибку; допуск координат 1e−6. Новая опора сама по себе не включает новую позу. Production consumer этой веткой не меняется: выбранную позу и её контакт интегратор подключает вместе.

Defaults без `ticketGripPose`: left `[.35, 0, .15]`, right `[-.35, 0, .15]`. Принятая композиция задаёт right `[.10, 0, .15]`. Эти два вызова совпадают с revision 6 по right bone/world matrices, grip, бумаге, holder и фактическим XYZ левой опоры.

Возвращаются `root`, `ticketGrip`, `handRestLeft`, `handRestRight`, `forearmPivot`, `ticketsForHolder`, `ticket`, `hands.left/right`, `dispose()`. Перед первым вызовом нужно завершить `preloadMenuHandSurfaces()`. Holder можно перенести в ticket-slot и задать local `[0, .005, 0]`.

## Предложения хвата

Обе правые кисти используют scale .218, исходный Euler `[−π/2, −.18, −.18]`, wrist `[.9, 0, −1.2]`, thumb curl/opposition .9 и сгиб к ладони по локальной +X: index/middle/ring/little `[1.0175, .9, .9, .9]`. Коэффициенты трёх суставов `[.64, 1.12, .8]`. У `current-support` root roll Z=0; у `left-support` сохранён −.44×reach, где `reach=clamp((contactX+.35)/.52, 0, 1)`.

Caller получает независимый экземпляр frozen rig. После позирования он вычисляет все реальные skin vertices через `getVertexPosition`, выбирает нижнюю опору и переносит кисть по полным XYZ к contact+[0,.002,0]. Это не перенос одного marker. Правая bind geometry и native cache не деформируются. Левая кисть сохраняет revision 6 целиком.

Бумага — один identity BoxGeometry mesh 1.1×2.1×.006 hand units под цепочкой wrist→ticketGrip. Физический scale бумаги .16 сохранён: grip компенсирует новый hand scale множителем .16/.218. SVG печать изображает два билета на одном mesh. Каждый вариант имеет фиксированные wrist-local position/quaternion grip, полученные из реальной пары thumb/index и конечной плоскости бумаги. Отдельного мирового override бумаги нет.

Thumb и index обращены к противоположным сторонам конечного листа, ближайшие точки находятся внутри quad, примерно на .33 его высоты. Между opposing pads около .001298 root units; толщина бумаги .00096. Clearance каждой стороны около .000169 при центральном размещении. Это малый положительный зазор, а не буквальный контакт skin↔paper или физическая симуляция давления. Более тесные проверенные сгибы index ≥1.0185 пересекали бумагу; они не включены.

Правый локоть остаётся на своей стороне: X=min(contactX−.055,−.34), Y=contactY+.06+.015×reach, Z=contactZ−.21. Forearm следует к вычисленному wrist. У новой правой манжеты terminal radius .026 вместо .049; topology и материал прежние. Её конец закрыт кожей, но видимые линии стыка ладони с манжетой и стенками предплечья остаются. Они проверяются заново для каждой позы; старые hidden-pair результаты к ним не относятся.

В кадре `current-support` показывает кисть сбоку и длинное предплечье поперёк тела. `left-support` разворачивает ладонь к зрителю и переносит хват левее. В обоих вариантах кисть выше и уже спокойной широкой ладони PNG; контакт ниже середины билетов. Эти различия сохраняют визуальную приёмку открытой.

## Принятая форма revision 6

Нос и щёки — Gaussian relief одного закрытого face mesh; нос уже и рельефнее базы 61a, объём щёк собран. Face topology 20 224 triangles. Глаза, размеры и placement головы, шеи и волос прежние.

Оба воротника имеют округлённый outline, depth .06, bevel .04 и три bevel segments: по 572 triangles. Бант, лацканы, palette и материалы прежние. `buildSleeve(points,widths,depths=widths,foldCenters=[])` сохраняет 20 sections×20 sides. Cloth folds имеют Gaussian width .06 и depression до .0045 root units; кремовые манжеты без складок.

Левая кисть сохраняет scale .218, Euler `[π/2,0,−.08]`, thumb curl/opposition .35 и сгиб `[1.15,1.25,1.15,.8]`. Caller округляет только её независимую geometry. Деформация включается выше contactY+.004; нижние 100 vertices при Y≤.003 и 142 при Y≤.004 сохраняют все XYZ базы dd667. Она рассчитана на эту статичную позу; анимация потребует отдельной проверки.

## Проверки и стоимость

Обе опоры проверяются по полностью clipped posed skin patches при Y≤.003 и Y≤.004 над union конечных треугольников реальной стойки, включая границы polygon и retained counter raycasts. Проверка одного minY или неподвижного marker недостаточна. Root identity, transform-once, left full skin XYZ и holder сохранены.

Конечный paper volume не пересекает правую/левую кожу, одежду и retained environment в выполненных SAT probes. Proper distal skin↔skin, right↔left и distal skin↔cloth crossings не обнаружены. Проксимальные skin folds и clothing joins учитываются отдельно, включая mixed seams и пары с общим vertex. Full self-intersection count не равен нулю; точные пары, видимость и атрибуция к базе передаются в независимом отчёте. Proper tests с конечными допусками не доказывают отсутствие любых tangent/coplanar/solid intersections.

Проверены native module/binary/source JSON hashes, ранее созданный и новый native cache, независимость buffers/materials/skeletons и exactly-once disposal. `dispose()` идемпотентен, освобождает также holder после reparent. Внешние textures освобождает их владелец. Builder не содержит rAF, timers или mixer.

Стоимость прежних четырёх режимов revision 7: **68 384 triangles / 23 meshes / 21 geometries / 17 materials / 2 skeletons / 7 409 928 bytes geometry buffers**. Новая поза не добавляет topology. Warm CPU assembly с preloaded native и тёплым blueprint измеряется отдельно для каждого варианта; это не cold extraction, GPU или FPS benchmark.

Кадры собраны на immutable compositor `1bab208aa1871f93a7af15265ad2053dff6db312`: camera `[.04,.52,6.4]`, FOV 34°, station yaw 27°, viewport 1672×941, DPR 1. Camera, lights, maps, DOM, post и окружение сохранены в scratch harness. Голова имеет прежний projected bbox 183.8455×168.1489 px. Проверки, source hashes, exact clean tip, portable preview и одинаковые before/after/reference crops передаются в отдельном пакете revision 7.

## Происхождение и политика

Геометрия использует собственные helpers проекта; frozen hands сохраняют собственный алгоритм и CPU binary preload. Новых моделей, ассетов и зависимостей нет. Существующий Three.js использует публичную MIT-лицензию. Map/UV/provenance печати `public/menu/art/ticket-print.svg` принадлежат 2D дизайнеру и здесь не меняются.

Запрещены код, зависимости, репозитории, tools, skills, документация, сервисы, API и credentials Аркадии/внутренней инфраструктуры Яндекса, включая read/search/copy/adapt/execute и косвенное использование через агентов. Разрешены собственный проект, ordinary Git/GitHub и public open-source с проверенной открытой лицензией. Native `menu-character-hands.ts`, algorithm/API/shared cache, binary и source JSON остаются read-only.

## Revision 8: профиль calm-support

Требует явную right `[-.155883,0,.161828]` и сохранённую left `[.35,0,.15]`. Нижняя опора всей posed surface переносится по XYZ к right+[0,.002,0]. Root identity и holder прежние.

Новая кисть использует собственный экземпляр frozen rig. Wrist возвращён к `[0,0,0]`; index/middle/ring/little сгибаются по +X с коэффициентами `[1.0175,1.1,1.1,1.1]`. У thumb локальная base position добавляет `[0,.1,.4]`, base Euler `[.4,.6,.4]`, следующие суставы X `[.48,.43]`. Пальцы направлены вправо и на .15 rad вверх в принятом общем ракурсе. Начальная форма расширена по native X/Y в 1.05/1.15 раза и запечена в независимо принадлежащие экземпляру positions/normals. Итоговый hand scale снова равномерный .218, чтобы wrist→grip→paper сохранял прямоугольный лист без сдвига отдельных мировых координат.

Подушечка thumb округлена локальным плавным смещением .0168 root units с радиусом .025 около проверенной пары opposing pads. Indices, skin weights и native cache не меняются. Нормали пересчитаны по площади совпадающих surface vertices в posed coordinates и возвращены через skin transform. Форма рассчитана на эту статичную позу.

Primary лист identity 0.55×2.1×.003 hand units, физический scale .16. Grip имеет фиксированные wrist-local position/quaternion. Два листа толщиной .00048 root units каждый размещены рядом между opposing pads: index обращён к внешней front face primary, thumb — к внешней back face secondary. Зазоры к этим сторонам около .000174; opposing points находятся внутри конечных quad на .45–.55 высоты. Это положительные зазоры, а не симуляция давления. Оба полных paper volumes проверяются отдельно.

Forearm и cuff построены к фактическому shaped wrist. Moving sleeve widths `[.088,.065,.052]`, depths `[.088,.06,.045]`; cuff widths `[.055,.025]`, depths `[.045,.022]`. Cuff занимает участок .79–1 длины локального forearm. Старые hidden-pair результаты не переносятся на этот профиль: нужна новая независимая проверка всей опоры, шва и finite papers на принятом compositor `a783ca33f67a3af3106bc4debb61adf2deb90bfe`.

В `calm-support` второй owned mesh использует те же geometry/material/print map и следует тому же grip. Local position `[.4388892594240831,.08288595629697071,-.0031]`, Z rotation .4 rad образуют веер вокруг середины листа со сдвигом X .03 hand units. Primary `ticket` сохраняет local identity. Плоскости параллельны и разнесены по local Z на .0031 hand units; между конечными volumes остаётся .000016 root units. Paper↔paper SAT и skin/cloth SAT проверяются для обоих листов. Старые четыре режима имеют один лист как прежде. Веер добавляет один mesh и 12 отрисовываемых triangles, но не новую geometry или material; общие ресурсы освобождаются один раз.

## Revision 8: отдельная правка лица, волос и ткани

После фиксации кисти и веера новый профиль получает более овальный рельеф носа: наклонённый elliptical field с поворотом .28 rad, радиусами .29/.205 author units и высотой .405. Bridge/alae/columella мягче, край улыбки чуть длиннее и асимметричнее. Все формы остаются на одном закрытом face mesh; новый отдельный нос не добавлен. Placement головы, глаз, бровей и шеи сохраняется.

Край чёлки имеет bevel .018 и depth .12 author units; её нижний левый контур немного ниже. Для новой чёлки используется отдельный immutable CPU blueprint: вызовы нового профиля не заменяют cache старых режимов. Cloth roughness .96, hair .9, face .92; palette, внешний свет, camera, print maps/UV и compositor grading не меняются. Эти правки применяются только к `calm-support` и записаны отдельным коммитом. Полное сходство с PNG и визуальная приёмка остаются открытыми.

Стоимость calm-support: **69 772 drawn triangles / 24 meshes / 21 geometries / 17 materials / 2 skeletons / 7 509 000 bytes geometry buffers** плюс 2 816 bytes bone matrices. Отдельный calm fringe CPU blueprint занимает 140 304 bytes. Локальный warm CPU assembly с preloaded native измерен отдельно; FPS/GPU и performance acceptance не заявлены.
