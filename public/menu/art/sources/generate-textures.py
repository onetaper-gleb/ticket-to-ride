"""Original periodic colour tiles and a P2 alpha mask; no input images."""
from pathlib import Path
from PIL import Image
import math

ROOT = Path(__file__).resolve().parents[1]

def rgb(hex_code):
    return tuple(int(hex_code[i:i + 2], 16) for i in (0, 2, 4))

def tile(name, base, amplitude, wood=False):
    size = 256
    image = Image.new('RGB', (size, size))
    colour = rgb(base)
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            u, v = 2 * math.pi * x / size, 2 * math.pi * y / size
            if wood:
                wave = (math.sin(12*v + 0.62*math.sin(u) + .22*math.sin(3*u)) + .28*math.sin(27*v + .4*math.sin(2*u))) / 1.28
            else:
                wave = (.42*math.sin(23*u+17*v) + .32*math.sin(31*u-29*v) + .26*math.sin(11*u+37*v))
            pixels[x, y] = tuple(max(0, min(255, round(c + amplitude*wave))) for c in colour)
    image.save(ROOT / (name + '.png'))
    image.save(ROOT / (name + '.webp'), quality=88, method=6)

tile('board-paint', '223A33', 3)
tile('wood-tile', '765039', 8, wood=True)

size = 128
steam = Image.new('RGBA', (size, size))
for y in range(size):
    for x in range(size):
        u, v = (x+0.5)/size, (y+0.5)/size
        density = 0
        for cx, cy, rx, ry, amount in [(0.52,.60,.15,.21,.68),(.42,.43,.21,.17,.48),(.58,.26,.18,.15,.38)]:
            density += amount * math.exp(-3 * (((u-cx)/rx)**2 + ((v-cy)/ry)**2))
        edge = min(1,u*12,(1-u)*12,v*12,(1-v)*12)
        alpha = round(255 * min(.72,density) * max(0,edge))
        steam.putpixel((x,y),(255,255,255,alpha))
steam.save(ROOT / 'steam-mask-p2.png')
