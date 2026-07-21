from __future__ import annotations

import argparse
from pathlib import Path
from statistics import median

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Align sprite frames to a shared center and foot baseline")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--rows", type=int, default=2)
    parser.add_argument("--foot-y", type=int, default=None)
    parser.add_argument("--center-x", type=int, default=None)
    parser.add_argument("--padding", type=int, default=12)
    return parser.parse_args()


def alpha_bbox(frame: Image.Image) -> tuple[int, int, int, int]:
    bbox = frame.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("sprite frame contains no visible pixels")
    return bbox


def main() -> None:
    args = parse_args()
    source = Image.open(args.input).convert("RGBA")
    if source.width % args.columns or source.height % args.rows:
        raise ValueError("sheet dimensions must be divisible by rows and columns")

    frame_width = source.width // args.columns
    frame_height = source.height // args.rows
    center_x = args.center_x if args.center_x is not None else frame_width // 2
    foot_y = args.foot_y if args.foot_y is not None else frame_height - args.padding
    frames: list[Image.Image] = []
    boxes: list[tuple[int, int, int, int]] = []

    for index in range(args.columns * args.rows):
        column = index % args.columns
        row = index // args.columns
        frame = source.crop(
            (
                column * frame_width,
                row * frame_height,
                (column + 1) * frame_width,
                (row + 1) * frame_height,
            )
        )
        frames.append(frame)
        boxes.append(alpha_bbox(frame))

    target_height = int(round(median(bottom - top for _, top, _, bottom in boxes)))
    output = Image.new("RGBA", source.size, (0, 0, 0, 0))
    for index, (frame, bbox) in enumerate(zip(frames, boxes, strict=True)):
        left, top, right, bottom = bbox
        sprite = frame.crop(bbox)
        if sprite.height != target_height:
            scale = target_height / sprite.height
            sprite = sprite.resize(
                (max(1, round(sprite.width * scale)), target_height), Image.Resampling.LANCZOS
            )
        x = center_x - sprite.width // 2
        y = foot_y - sprite.height
        aligned = Image.new("RGBA", (frame_width, frame_height), (0, 0, 0, 0))
        aligned.alpha_composite(sprite, (x, y))
        column = index % args.columns
        row = index // args.columns
        output.alpha_composite(aligned, (column * frame_width, row * frame_height))
        print(
            f"frame={index} source_bbox={left},{top},{right},{bottom} "
            f"aligned_center={center_x} aligned_foot={foot_y}"
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.save(args.output)
    print(f"wrote={args.output} frame={frame_width}x{frame_height}")


if __name__ == "__main__":
    main()

