"""Regenerate committed native icons from the original geometric canvas mark.

Developer-only dependency: Pillow. No fonts, downloads or borrowed assets.
The same geometry is retained in src-tauri/icons/mark.svg.
"""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / "src-tauri" / "icons"
scale = 4
canvas = Image.new("RGBA", (256 * scale, 256 * scale))
draw = ImageDraw.Draw(canvas)
draw.rounded_rectangle(
    tuple(value * scale for value in (8, 8, 248, 248)),
    radius=52 * scale, fill="#202320",
)
mark = Image.new("RGBA", canvas.size)
draw = ImageDraw.Draw(mark)
for x, y in ((55, 49), (137, 79), (67, 139)):
    draw.rounded_rectangle(
        (x * scale, y * scale, (x + 64) * scale, (y + 64) * scale),
        radius=13 * scale, outline="#c4a16b", width=11 * scale,
    )
canvas.alpha_composite(mark.rotate(8, resample=Image.Resampling.BICUBIC))
icon = canvas.resize((256, 256), Image.Resampling.LANCZOS)
icon.save(root / "icon.png")
icon.save(root / "icon.ico", sizes=[(size, size) for size in (16, 24, 32, 48, 64, 128, 256)])
print("Generated original PNG and Windows ICO resources")
