"""Rebuild the reference idle sheet from the checked-in 4K character master.

This is a local image-processing step. It never calls an image-generation API.
Requires Pillow and NumPy.
"""

from math import cos, pi
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
MASTER_PATH = (
    ROOT / "resources" / "skins" / "reference-companion" / "references" / "character-front-4k.png"
)
OUTPUT_PATH = (
    ROOT / "resources" / "skins" / "reference-companion" / "animations" / "idle.png"
)

FRAME_SIZE = 1024
FRAME_COLUMNS = 4
FRAME_ROWS = 2
CHARACTER_HEIGHT = 960
FOOT_Y = 976
TORSO_BREATH_START_Y = 170
TORSO_BREATH_PEAK_Y = 275
TORSO_BREATH_END_Y = 500
HEAD_BLEND_START_Y = 150
HEAD_BLEND_END_Y = 255
TORSO_BREATH_AMPLITUDE = 5.0
HEAD_BREATH_RATIO = 0.25
MIN_VISIBLE_HEAD_AMPLITUDE = 3.0
HEAD_LAG_FRAMES = 0.75
FRAME_COUNT = FRAME_COLUMNS * FRAME_ROWS


def resize_premultiplied(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Resize RGBA without allowing hidden edge colors to bleed into transparent pixels."""

    pixels = np.asarray(image, dtype=np.float32) / 255.0
    alpha = pixels[:, :, 3]
    premultiplied_channels = []

    for channel in range(3):
        premultiplied = Image.fromarray(pixels[:, :, channel] * alpha, mode="F")
        resized = premultiplied.resize(size, Image.Resampling.LANCZOS)
        premultiplied_channels.append(np.asarray(resized, dtype=np.float32))

    resized_alpha = Image.fromarray(alpha, mode="F").resize(size, Image.Resampling.LANCZOS)
    output_alpha = np.clip(np.asarray(resized_alpha, dtype=np.float32), 0.0, 1.0)
    output_rgb = np.stack(premultiplied_channels, axis=2)
    output_rgb = np.divide(
        output_rgb,
        output_alpha[:, :, None],
        out=np.zeros_like(output_rgb),
        where=output_alpha[:, :, None] > 1 / 255,
    )
    output = np.rint(
        np.dstack((np.clip(output_rgb, 0.0, 1.0), output_alpha)) * 255
    ).astype(np.uint8)

    # Color-key removal can leave a faint green value in antialiased edge pixels. Keep
    # legitimate opaque colors intact, but neutralize green-only excess in translucent edges.
    translucent = (output[:, :, 3] > 0) & (output[:, :, 3] < 250)
    green_ceiling = np.maximum(output[:, :, 0], output[:, :, 2]).astype(np.int16) + 4
    green_fringe = translucent & (output[:, :, 1] > green_ceiling)
    output[:, :, 1] = np.where(
        green_fringe,
        np.minimum(green_ceiling, 255),
        output[:, :, 1],
    ).astype(np.uint8)
    return Image.fromarray(output, "RGBA")


def build_base_frame(master: Image.Image) -> Image.Image:
    bounds = master.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("4K character master has no visible pixels")

    character = master.crop(bounds)
    character_width = round(character.width * CHARACTER_HEIGHT / character.height)
    character = resize_premultiplied(character, (character_width, CHARACTER_HEIGHT))

    frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE))
    frame.alpha_composite(
        character,
        ((FRAME_SIZE - character_width) // 2, FOOT_Y - CHARACTER_HEIGHT),
    )
    return frame


def breathing_level(frame_index: int, lag_frames: float = 0.0) -> float:
    phase = 2 * pi * (frame_index - lag_frames) / FRAME_COUNT
    return (1.0 - cos(phase)) / 2.0


def apply_quiet_breath(
    frame: Image.Image,
    torso_amplitude: float,
    head_amplitude: float,
) -> Image.Image:
    """Apply primary chest motion plus smaller delayed head-and-neck movement."""

    pixels = np.asarray(frame, dtype=np.float32)
    source_height = pixels.shape[0]
    y_positions = np.arange(source_height, dtype=np.float32)
    torso_weight = np.zeros(source_height, dtype=np.float32)
    torso_rise = (y_positions >= TORSO_BREATH_START_Y) & (
        y_positions <= TORSO_BREATH_PEAK_Y
    )
    rise_phase = (y_positions[torso_rise] - TORSO_BREATH_START_Y) / (
        TORSO_BREATH_PEAK_Y - TORSO_BREATH_START_Y
    )
    torso_weight[torso_rise] = (1.0 - np.cos(np.pi * rise_phase)) / 2.0

    torso_fall = (y_positions > TORSO_BREATH_PEAK_Y) & (
        y_positions <= TORSO_BREATH_END_Y
    )
    fall_phase = (y_positions[torso_fall] - TORSO_BREATH_PEAK_Y) / (
        TORSO_BREATH_END_Y - TORSO_BREATH_PEAK_Y
    )
    torso_weight[torso_fall] = (1.0 + np.cos(np.pi * fall_phase)) / 2.0

    head_weight = np.ones(source_height, dtype=np.float32)
    head_weight[y_positions >= HEAD_BLEND_END_Y] = 0.0
    head_blend = (y_positions > HEAD_BLEND_START_Y) & (y_positions < HEAD_BLEND_END_Y)
    head_phase = (y_positions[head_blend] - HEAD_BLEND_START_Y) / (
        HEAD_BLEND_END_Y - HEAD_BLEND_START_Y
    )
    head_weight[head_blend] = (1.0 + np.cos(np.pi * head_phase)) / 2.0

    displacement = torso_amplitude * torso_weight + head_amplitude * head_weight
    source_y = np.clip(y_positions + displacement, 0, source_height - 1)
    lower_row = np.floor(source_y).astype(np.int32)
    upper_row = np.minimum(lower_row + 1, source_height - 1)
    blend = (source_y - lower_row)[:, None, None]
    output = pixels[lower_row, :, :] * (1.0 - blend) + pixels[upper_row, :, :] * blend
    return Image.fromarray(np.rint(np.clip(output, 0, 255)).astype(np.uint8), "RGBA")


def main() -> None:
    master = Image.open(MASTER_PATH).convert("RGBA")
    base_frame = build_base_frame(master)
    sheet = Image.new(
        "RGBA",
        (FRAME_SIZE * FRAME_COLUMNS, FRAME_SIZE * FRAME_ROWS),
    )

    for index in range(FRAME_COUNT):
        torso_amplitude = TORSO_BREATH_AMPLITUDE * breathing_level(index)
        head_peak_amplitude = max(
            TORSO_BREATH_AMPLITUDE * HEAD_BREATH_RATIO,
            MIN_VISIBLE_HEAD_AMPLITUDE,
        )
        head_amplitude = head_peak_amplitude * breathing_level(index, HEAD_LAG_FRAMES)
        frame = apply_quiet_breath(base_frame, torso_amplitude, head_amplitude)
        sheet.alpha_composite(
            frame,
            ((index % FRAME_COLUMNS) * FRAME_SIZE, (index // FRAME_COLUMNS) * FRAME_SIZE),
        )

    sheet.save(OUTPUT_PATH, optimize=True)
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
