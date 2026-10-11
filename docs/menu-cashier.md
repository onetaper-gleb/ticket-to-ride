# Кассирша меню «Билетная касса»

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

Стоимость каждой позы: **68 384 triangles / 23 meshes / 21 geometries / 17 materials / 2 skeletons / 7 409 928 bytes geometry buffers**. Новая поза не добавляет topology. Warm CPU assembly с preloaded native и тёплым blueprint измеряется отдельно для каждого варианта; это не cold extraction, GPU или FPS benchmark.

Кадры собраны на immutable compositor `1bab208aa1871f93a7af15265ad2053dff6db312`: camera `[.04,.52,6.4]`, FOV 34°, station yaw 27°, viewport 1672×941, DPR 1. Camera, lights, maps, DOM, post и окружение сохранены в scratch harness. Голова имеет прежний projected bbox 183.8455×168.1489 px. Проверки, source hashes, exact clean tip, portable preview и одинаковые before/after/reference crops передаются в отдельном пакете revision 7.

## Происхождение и политика

Геометрия использует собственные helpers проекта; frozen hands сохраняют собственный алгоритм и CPU binary preload. Новых моделей, ассетов и зависимостей нет. Существующий Three.js использует публичную MIT-лицензию. Map/UV/provenance печати `public/menu/art/ticket-print.svg` принадлежат 2D дизайнеру и здесь не меняются.

Запрещены код, зависимости, репозитории, tools, skills, документация, сервисы, API и credentials Аркадии/внутренней инфраструктуры Яндекса, включая read/search/copy/adapt/execute и косвенное использование через агентов. Разрешены собственный проект, ordinary Git/GitHub и public open-source с проверенной открытой лицензией. Native `menu-character-hands.ts`, algorithm/API/shared cache, binary и source JSON остаются read-only.
