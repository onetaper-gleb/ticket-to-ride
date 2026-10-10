from pathlib import Path
from xml.sax.saxutils import escape
import json, subprocess, sys, shutil

ROOT = Path(__file__).resolve().parent
DEST = Path(sys.argv[1])
DEST.mkdir(parents=True, exist_ok=True)
INK, PAPER, BRASS = '#2a3935', '#efe6cd', '#a68d52'
COLORS = dict(red='#b54e3d', blue='#4a80ab', green='#4b805f', gray='#89877a', wild=BRASS)
LABELS = {}
OUTLINES = {}
if (ROOT / 'label-paths.json').exists():
    OUTLINES = {(r['text'], r['size']): r for r in json.loads((ROOT / 'label-paths.json').read_text())}

def tag(name, attrs, inner=''):
    a = ' '.join(f'{k.replace("_", "-")}="{escape(str(v))}"' for k, v in attrs.items())
    return f'<{name} {a}>{inner}</{name}>'

def rect(x,y,w,h,fill=PAPER,stroke=INK,sw=5,r=12):
    return tag('rect',dict(x=x,y=y,width=w,height=h,rx=r,fill=fill,stroke=stroke,stroke_width=sw))

def path(d,fill='none',stroke=INK,sw=5,**a):
    return tag('path',dict(d=d,fill=fill,stroke=stroke,stroke_width=sw,stroke_linecap='round',stroke_linejoin='round',**a))

def line(x1,y1,x2,y2,stroke=INK,sw=5,**a):
    return tag('line',dict(x1=x1,y1=y1,x2=x2,y2=y2,stroke=stroke,stroke_width=sw,stroke_linecap='round',**a))

def circle(x,y,r,fill=PAPER,stroke=INK,sw=5):
    return tag('circle',dict(cx=x,cy=y,r=r,fill=fill,stroke=stroke,stroke_width=sw))

def group(inner,**attrs): return tag('g',attrs,inner)

def text(value,x,y,size=50,anchor='middle',color=INK):
    LABELS[(value,size)] = dict(text=value,size=size)
    if not OUTLINES: return ''
    item = OUTLINES[(value,size)]
    width = item['width']
    dx = width/2 if anchor=='middle' else width if anchor=='end' else 0
    if x-dx < 15 or x-dx+width > 1185: raise ValueError(f'Label out of safe area: {value}')
    return tag('g',dict(data_label=value,transform=f'translate({x-dx:.3f} {y}) scale(1 -1)',fill=color),tag('path',dict(d=item['path'])))

def symbol(color,x,y,s=42,fill=PAPER):
    r=s/2
    if color=='red': return path(f'M{x},{y-r} L{x+r},{y} L{x},{y+r} L{x-r},{y} Z',fill,INK,4)
    if color=='blue': return circle(x,y,r,fill,INK,4)
    if color=='green': return path(f'M{x},{y-r} L{x+r},{y+r} L{x-r},{y+r} Z',fill,INK,4)
    if color=='wild':
        return path(f'M{x},{y-r} Q{x+r*.15},{y-r*.15} {x+r},{y} Q{x+r*.15},{y+r*.15} {x},{y+r} Q{x-r*.15},{y+r*.15} {x-r},{y} Q{x-r*.15},{y-r*.15} {x},{y-r} Z',fill,INK,4)
    return line(x-r*.6,y,x+r*.6,y,INK,4)

def coach(color,x,y,w=88,h=42):
    c=COLORS[color]
    b=rect(x,y,w,h,c,INK,3,5)
    b+=path(f'M{x-3},{y} Q{x+w/2},{y-12} {x+w+3},{y}',PAPER,INK,3)
    b+=rect(x+w*.14,y+h*.18,w*.27,h*.42,PAPER,INK,2,2)+rect(x+w*.56,y+h*.18,w*.27,h*.42,PAPER,INK,2,2)
    for p in (.23,.77): b+=circle(x+w*p,y+h+5,7,INK,INK,2)
    return b

def loco(x,y,w=88):
    b=rect(x+32,y+17,w-35,29,INK,INK,3,5)+rect(x+6,y+3,28,43,COLORS['wild'],INK,3,3)
    b+=rect(x+10,y+8,18,15,PAPER,INK,2,1)+rect(x+63,y+5,10,18,INK,INK,2,1)
    b+=line(x+3,y+2,x+35,y+2,INK,5)+line(x,y+48,x+w,y+48,INK,4)
    for p in (20,48,73): b+=circle(x+p,y+48,9,PAPER,INK,3)
    return b

def card(color,x,y,w=130,h=190,back=False):
    if back:
        b=rect(x,y,w,h,INK,BRASS,4,10)+rect(x+8,y+8,w-16,h-16,'none',PAPER,2,7)
        b+=circle(x+w/2,y+h/2,w*.27,'none',PAPER,3)
        for i in range(4):
            b+=line(x+w*.3,y+h*.32+i*h*.12,x+w*.7,y+h*.32+i*h*.12,PAPER,2)
        return b
    b=rect(x,y,w,h,PAPER,INK,4,10)
    b+=rect(x+4,y+4,w-8,h*.26,COLORS[color],'none',0,7)
    b+=symbol(color,x+w/2,y+h*.155,min(w*.31,44))
    if color=='wild': b+=loco(x+w*.15,y+h*.45,w*.7)
    else: b+=coach(color,x+w*.15,y+h*.47,w*.7,h*.2)
    b+=line(x+w*.15,y+h*.85,x+w*.85,y+h*.85,BRASS,2)
    return group(b,data_card=color)

def cards(colors,x,y,w=130,h=190,gap=25):
    return ''.join(card(c,x+i*(w+gap),y,w,h) for i,c in enumerate(colors))

def arrow(x1,y1,x2,y2,color=INK,sw=6):
    import math
    a=math.atan2(y2-y1,x2-x1); z=18
    xx=x2-z*math.cos(a); yy=y2-z*math.sin(a)
    return line(x1,y1,x2,y2,color,sw)+path(f'M{xx-z*.6*math.sin(a)},{yy+z*.6*math.cos(a)} L{x2},{y2} L{xx+z*.6*math.sin(a)},{yy-z*.6*math.cos(a)}', 'none',color,sw)

def tick(x,y,s=48):
    return path(f'M{x-s*.5},{y} L{x-s*.12},{y+s*.35} L{x+s*.55},{y-s*.42}', 'none',INK,8)

def cross(x,y,s=42):
    return line(x-s*.45,y-s*.45,x+s*.45,y+s*.45,INK,8)+line(x+s*.45,y-s*.45,x-s*.45,y+s*.45,INK,8)

def city(x,y,name=None):
    return circle(x,y,24,PAPER,INK,5)+(text(name,x,y+17,44) if name else '')

def route(colors,x,y,w=150,h=70,gap=20,tunnel=False,endpoints=True):
    span=len(colors)*w+(len(colors)-1)*gap
    b=line(x-60,y+h/2,x+span+60,y+h/2,BRASS,7)
    if endpoints: b+=city(x-60,y+h/2)+city(x+span+60,y+h/2)
    for i,c in enumerate(colors):
        a=x+i*(w+gap)
        if tunnel: b+=rect(a-9,y-9,w+18,h+18,'none',INK,5,18)
        b+=rect(a,y,w,h,COLORS[c],INK,4,8)+symbol(c,a+w/2,y+h/2,40)
    return group(b,data_route=' '.join(colors),data_tunnel=str(tunnel).lower())

def ticket(x,y,w=165,h=170,a='A',b='B',selected=False):
    z=rect(x,y,w,h,PAPER,BRASS,4,8)
    z+=line(x+15,y+25,x+w-15,y+25,BRASS,2)
    z+=text(a,x+w*.23,y+h*.55,46)+arrow(x+w*.4,y+h*.46,x+w*.6,y+h*.46,INK,4)+text(b,x+w*.77,y+h*.55,46)
    z+=rect(x+w*.5-20,y+h-45,40,32,'none',INK,3,3)
    if selected: z+=tick(x+w*.5,y+h-34,26)
    return group(z,data_ticket=f'{a}-{b}',data_selected=str(selected).lower())

def colored():
    b=text('3 места',600,85,58)
    b+=route(['red']*3,345,165,w=150,h=74,gap=30)
    for x in (420,600,780): b+=arrow(x,260,x,340,BRASS,4)
    b+=cards(['red']*3,350,368,w=140,h=202,gap=40)
    b+=text('По одной карте на место',600,666,54)
    return b

def gray():
    b=route(['gray']*3,385,55,w=130,h=62,gap=20)
    b+=text('Один цвет',285,225,54)+text('Смесь цветов',875,225,54)
    b+=cards(['green']*3,115,260,w=94,h=138,gap=20)+tick(500,324,50)
    b+=cards(['green','red','blue'],705,260,w=94,h=138,gap=20)+cross(1090,324,45)
    b+=line(65,442,1135,442,BRASS,3)
    b+=cards(['green','green','wild'],408,482,w=94,h=138,gap=20)+tick(808,552,46)
    b+=text('Локомотив заменяет цвет',600,684,51)
    return b

def locomotive():
    b=text('В оплате — любой цвет',600,62,54)
    b+=cards(['red','red','wild'],198,96,w=100,h=148,gap=20)
    b+=arrow(575,172,650,172)
    b+=route(['red']*3,720,140,w=91,h=54,gap=10,endpoints=False)
    b+=line(50,295,1150,295,BRASS,3)+line(600,330,600,680,BRASS,3)
    b+=text('Открытый',300,361,52)+card('wild',242,390,w=115,h=169)
    b+=text('Весь добор',300,612,52)+text('2-м брать нельзя',300,678,48)
    b+=text('Вслепую',900,361,52)+card('wild',697,390,w=105,h=157,back=True)
    b+=arrow(819,467,865,467,BRASS,5)+card('wild',890,390,w=115,h=169)
    b+=text('1 из 2 карт',900,646,56)
    return b

def tunnel():
    b=text('1. Оплата',255,64,54)+text('2. Открыть 3',865,64,54)
    b+=route(['red']*3,120,96,w=80,h=42,gap=15,tunnel=True,endpoints=False)
    b+=cards(['red']*3,108,169,w=85,h=130,gap=21)
    b+=arrow(459,241,575,241,INK,6)
    b+=cards(['red','blue','wild'],641,137,w=126,h=183,gap=33)
    for x,label in ((704,'+1'),(863,'0'),(1022,'+1')): b+=text(label,x,387,64)
    b+=path('M704,413 L704,442 L1022,442 L1022,413','none',BRASS,4)+arrow(863,444,863,475,BRASS,4)
    b+=text('Доплата 2',265,556,66)+arrow(461,537,562,537)
    b+=cards(['red','wild'],662,487,w=105,h=151,gap=34)
    b+=text('Тем же цветом или локомотивом',600,700,48)
    return b

def ferry():
    b=text('2 значка → минимум 2 локомотива',600,75,54)
    for yy in (128,286): b+=path(f'M110,{yy} Q145,{yy-20} 180,{yy} T250,{yy} T320,{yy} T390,{yy} T460,{yy} T530,{yy} T600,{yy} T670,{yy} T740,{yy} T810,{yy} T880,{yy} T950,{yy} T1020,{yy} T1090,{yy}','none','#4a80ab',3)
    b+=route(['wild','wild','gray','gray'],280,182,w=135,h=70,gap=33)
    for x in (347.5,515.5,683.5,851.5): b+=arrow(x,314,x,371,BRASS,4)
    b+=cards(['wild','wild','blue','blue'],288,399,w=119,h=172,gap=49)
    b+=text('Остальные: один цвет / локомотивы',600,671,48)
    return b

def tickets():
    b=text('Старт: минимум 2 из 4',600,61,56)
    for i,pair in enumerate([('A','B'),('C','D'),('E','F'),('G','H')]): b+=ticket(200+i*205,110,w=170,h=184,a=pair[0],b=pair[1],selected=i<2)
    b+=line(65,342,1135,342,BRASS,3)
    b+=text('Города соединены',300,414,48)+text('Не соединены',900,414,48)
    b+=line(150,483,450,483,INK,6)
    for x in (207,284,361): b+=coach('green',x,461,55,28)
    b+=city(150,483,'A')+city(450,483,'B')
    b+=line(750,483,822,483,INK,6)+line(981,483,1050,483,INK,6)+cross(900,483,35)
    b+=city(750,483,'A')+city(1050,483,'B')
    b+=text('+очки',300,640,78)+text('−очки',900,640,78)
    return b

def station():
    b=text('1 чужой участок для билетов',600,72,54)
    b+=path('M553,193 L600,150 L647,193 Z',BRASS,INK,5)+rect(563,194,74,60,PAPER,INK,5,3)
    b+=rect(590,222,20,32,INK,INK,2,1)+rect(575,203,14,17,'none',INK,2,1)+rect(611,203,14,17,'none',INK,2,1)
    b+=line(600,254,600,280,INK,5)+line(165,317,1035,317,BRASS,7)
    for x in (231,340,449): b+=coach('green',x,291,78,44)
    for x in (666,775,884): b+=coach('blue',x,291,78,44)
    b+=city(165,317,'A')+city(600,317,'B')+city(1035,317,'C')
    b+=text('Ваш',380,411,50)+text('Чужой',825,411,50)
    b+=arrow(618,447,1031,447,BRASS,5)+line(618,452,1031,452,BRASS,3,stroke_dasharray='10 14')
    b+=ticket(386,489,w=346,h=113,a='A',b='C',selected=True)+tick(794,543,53)
    b+=text('Владелец линии не меняется',600,685,51)
    return b

def double():
    b=text('2–3 игрока',295,79,60)+text('4–5 игроков',905,79,60)+line(600,115,600,620,BRASS,3)
    for offset in (0,610):
        for yy in (245,405): b+=line(135+offset,yy,455+offset,yy,BRASS,7)
        for x in (155,255,355): b+=coach('green',x+offset,217,80,48)
        if offset:
            for x in (155,255,355): b+=coach('blue',x+offset,378,80,48)
        else:
            for x in (155,255,355): b+=rect(x,379,80,48,'none',BRASS,4,5)
            b+=cross(295,405,68)
        b+=city(107+offset,325)+city(483+offset,325)
        b+=line(107+offset,299,135+offset,245,BRASS,5)+line(107+offset,351,135+offset,405,BRASS,5)
        b+=line(483+offset,299,455+offset,245,BRASS,5)+line(483+offset,351,455+offset,405,BRASS,5)
        b+=rect(267+offset,132,56,52,PAPER,INK,4,4)+text('1',295+offset,173,43)
        if offset: b+=circle(905,494,28,PAPER,INK,4)+text('2',905,510,43)
    b+=text('Одна линия пары',295,577,48)+text('Разные игроки',905,577,48)
    b+=text('Один игрок не занимает обе',600,689,54)
    return b

SPEC = {
 'colored-route': ('Цветной маршрут','Три красных места и три красные карты: по одной на каждое место.',colored),
 'gray-route': ('Серый маршрут','Три карты одного цвета допустимы, смесь разных цветов недопустима. Локомотив заменяет карту цвета.',gray),
 'locomotive': ('Локомотив','Локомотив заменяет цвет в оплате. Открытый занимает весь добор, вторым его брать нельзя. Вслепую считается одной из двух карт.',locomotive),
 'tunnel': ('Тоннель','После трёх красных базовых карт открыты ровно три: красная, синяя и локомотив. Доплата две карты красного цвета или локомотивы; показаны красная и локомотив.',tunnel),
 'ferry': ('Паром','Четыре места, два значка локомотивов. Оплата: минимум два локомотива, остальные карты одного цвета. Показаны два локомотива и две синие карты.',ferry),
 'tickets': ('Билеты','На старте выбраны два билета из четырёх. Соединённые города добавляют очки билета, несоединённые вычитают.',tickets),
 'station': ('Станция','Станция у города B соединяет собственный участок A–B с одним чужим B–C для билета A–C. Владелец чужой линии сохраняется.',station),
 'double-route': ('Двойной маршрут','При двух или трёх игроках используется одна линия пары. При четырёх или пяти линии занимают разные игроки. Один игрок не занимает обе.',double)
}

def build():
    for id,(title,desc,fn) in SPEC.items():
        content = fn()
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720" role="img" aria-labelledby="title desc"><title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc>'+group(content,id=id)+'</svg>\n'
        (DEST / f'{id}.svg').write_text(svg)

if not OUTLINES:
    for _,_,fn in SPEC.values(): fn()
    (ROOT / 'labels.json').write_text(json.dumps(list(LABELS.values()), ensure_ascii=False))
    subprocess.run([str(ROOT / 'outline-labels'),str(ROOT / 'labels.json'),str(ROOT / 'label-paths.json')],check=True)
    OUTLINES = {(r['text'], r['size']): r for r in json.loads((ROOT / 'label-paths.json').read_text())}
build()
print(f'Wrote {len(SPEC)} diagrams; {len(LABELS)} outlined labels.')
