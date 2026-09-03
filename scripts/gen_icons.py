#!/usr/bin/env python3
"""Generate ApplyPilot extension icons (emerald rounded square + white bolt)."""
from PIL import Image, ImageDraw
import os

OUT = "/home/z/my-project/extension/icons"
os.makedirs(OUT, exist_ok=True)

SIZE = 512
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# Rounded-square gradient background (emerald -> teal)
grad = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
gd = ImageDraw.Draw(grad)
c1 = (16, 185, 129)
c2 = (13, 148, 136)
for y in range(SIZE):
    t = y / SIZE
    r = int(c1[0] + (c2[0] - c1[0]) * t)
    g = int(c1[1] + (c2[1] - c1[1]) * t)
    b = int(c1[2] + (c2[2] - c1[2]) * t)
    gd.line([(0, y), (SIZE, y)], fill=(r, g, b, 255))

mask = Image.new("L", (SIZE, SIZE), 0)
md = ImageDraw.Draw(mask)
radius = int(SIZE * 0.22)
md.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=radius, fill=255)
img.paste(grad, (0, 0), mask)

# Lightning bolt
draw = ImageDraw.Draw(img)
bolt = [
    (292, 78), (150, 290), (238, 290), (208, 434), (368, 222), (272, 222), (322, 78),
]
draw.polygon(bolt, fill=(255, 255, 255, 255))

for size in (16, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(f"{OUT}/icon{size}.png")

print("icons written:", sorted(os.listdir(OUT)))
