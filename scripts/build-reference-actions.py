from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ANIMATION_DIRECTORY = ROOT / "resources" / "skins" / "reference-companion" / "animations"
OUTPUT_DIRECTORY = ROOT / "resources" / "animation-prototypes" / "desktop-pet"
IDLE_SHEET = ANIMATION_DIRECTORY / "idle.png"
FRAME_SIZE = 1024
ANCHOR = (512, 976)


def read_first_idle_frame() -> Image.Image:
    with Image.open(IDLE_SHEET) as sheet:
        return sheet.convert("RGBA").crop((0, 0, FRAME_SIZE, FRAME_SIZE))


def transform_frame(source: Image.Image, angle: float = 0, offset_y: int = 0) -> Image.Image:
    frame = source.rotate(angle, resample=Image.Resampling.BICUBIC, center=ANCHOR)
    if offset_y == 0:
        return frame
    shifted = Image.new("RGBA", source.size)
    shifted.alpha_composite(frame, (0, offset_y))
    return shifted


def write_sheet(name: str, frames: list[Image.Image]) -> None:
    sheet = Image.new("RGBA", (FRAME_SIZE * 4, FRAME_SIZE * 2))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, ((index % 4) * FRAME_SIZE, (index // 4) * FRAME_SIZE))
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT_DIRECTORY / f"{name}-fallback.png", optimize=True)


def main() -> None:
    source = read_first_idle_frame()
    write_sheet(
        "interaction",
        [
            transform_frame(source, angle, offset_y)
            for angle, offset_y in [(0, 0), (-0.8, -3), (-1.3, -6), (-0.6, -3), (0.5, 0), (0.8, -2), (0.3, 0), (0, 0)]
        ],
    )
    write_sheet(
        "speaking",
        [
            transform_frame(source, angle, offset_y)
            for angle, offset_y in [(0, 0), (-0.35, -1), (0.15, -2), (0.35, -1), (0, 0), (-0.2, -1), (0.25, -2), (0, 0)]
        ],
    )
    write_sheet(
        "dragging",
        [
            transform_frame(source, angle, offset_y)
            for angle, offset_y in [(-0.7, -5), (-0.2, -7), (0.45, -6), (0.7, -5), (0.3, -7), (-0.3, -6), (-0.6, -5), (-0.7, -5)]
        ],
    )


if __name__ == "__main__":
    main()
