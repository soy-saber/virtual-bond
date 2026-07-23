from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "resources/skins/reference-companion/animations/interaction-v3.png"
DESTINATION = (
    ROOT / "resources/skins/reference-companion/animations/interaction-v4-local.png"
)
FRAME_WIDTH = 1024
FRAME_HEIGHT = 1024
COLUMNS = 4
ROWS = 2

# Frame 2 in the generated v3 sheet contains duplicated hands. Reuse only the
# clean poses and order them as idle -> prepare -> respond -> hold -> recover.
FRAME_ORDER = (0, 5, 2, 3, 4, 5, 6, 7)


def extract_frame(sheet: Image.Image, index: int) -> Image.Image:
    x = (index % COLUMNS) * FRAME_WIDTH
    y = (index // COLUMNS) * FRAME_HEIGHT
    return sheet.crop((x, y, x + FRAME_WIDTH, y + FRAME_HEIGHT))


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    expected_size = (FRAME_WIDTH * COLUMNS, FRAME_HEIGHT * ROWS)
    if source.size != expected_size:
        raise ValueError(f"Expected {expected_size}, received {source.size}")

    output = Image.new("RGBA", expected_size, (0, 0, 0, 0))
    for output_index, source_index in enumerate(FRAME_ORDER):
        frame = extract_frame(source, source_index)
        x = (output_index % COLUMNS) * FRAME_WIDTH
        y = (output_index // COLUMNS) * FRAME_HEIGHT
        output.alpha_composite(frame, (x, y))

    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    output.save(DESTINATION, optimize=True)
    print(DESTINATION)


if __name__ == "__main__":
    main()
