from collections import deque
from pathlib import Path
from typing import Deque, Tuple

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "resources" / "concepts" / "makise-kurisu-chibi-design-v1.png"
OUTPUT = ROOT / "resources" / "animation-prototypes" / "makise-kurisu-chibi" / "idle-front.png"
SOURCE_CROP = (0, 0, 340, 700)
FRAME_SIZE = (384, 512)
TARGET_HEIGHT = 456
FOOT_Y = 496


def is_background(pixel: Tuple[int, int, int, int]) -> bool:
    red, green, blue, _ = pixel
    average = (red + green + blue) // 3
    return 185 <= average <= 238 and max(red, green, blue) - min(red, green, blue) <= 18


def remove_connected_background(image: Image.Image) -> Image.Image:
    pixels = image.load()
    width, height = image.size
    background = bytearray(width * height)
    queue: Deque[Tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if background[index] or not is_background(pixels[x, y]):
            return
        background[index] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    for y in range(height):
        for x in range(width):
            if background[y * width + x]:
                pixels[x, y] = (*pixels[x, y][:3], 0)
    image.putalpha(image.getchannel("A").filter(ImageFilter.MinFilter(3)))
    return image


def main() -> None:
    with Image.open(SOURCE) as source:
        character = remove_connected_background(source.convert("RGBA").crop(SOURCE_CROP))
    bounds = character.getbbox()
    if not bounds:
        raise RuntimeError("No character pixels found in the design sheet")
    character = character.crop(bounds)
    target_width = round(character.width * TARGET_HEIGHT / character.height)
    character = character.resize((target_width, TARGET_HEIGHT), Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", FRAME_SIZE)
    frame.alpha_composite(character, ((FRAME_SIZE[0] - target_width) // 2, FOOT_Y - TARGET_HEIGHT))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frame.save(OUTPUT, optimize=True)


if __name__ == "__main__":
    main()
