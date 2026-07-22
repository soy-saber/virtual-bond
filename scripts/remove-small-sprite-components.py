import argparse
from collections import deque
from pathlib import Path
from typing import Deque, List, Set, Tuple

from PIL import Image


Point = Tuple[int, int]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Remove isolated alpha components from sprite frames")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--rows", type=int, default=2)
    parser.add_argument("--min-area", type=int, default=64)
    parser.add_argument("--alpha-threshold", type=int, default=16)
    return parser.parse_args()


def find_component(alpha: Image.Image, start: Point, visited: Set[Point], threshold: int) -> List[Point]:
    width, height = alpha.size
    pixels = alpha.load()
    queue: Deque[Point] = deque([start])
    visited.add(start)
    component: List[Point] = []
    while queue:
        x, y = queue.popleft()
        component.append((x, y))
        for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            nx, ny = neighbor
            if not (0 <= nx < width and 0 <= ny < height) or neighbor in visited:
                continue
            if pixels[nx, ny] >= threshold:
                visited.add(neighbor)
                queue.append(neighbor)
    return component


def clean_frame(frame: Image.Image, min_area: int, threshold: int) -> Tuple[Image.Image, int]:
    alpha = frame.getchannel("A")
    pixels = alpha.load()
    visited: Set[Point] = set()
    removed = 0
    for y in range(alpha.height):
        for x in range(alpha.width):
            point = (x, y)
            if point in visited or pixels[x, y] < threshold:
                continue
            component = find_component(alpha, point, visited, threshold)
            if len(component) >= min_area:
                continue
            for component_x, component_y in component:
                pixels[component_x, component_y] = 0
            removed += len(component)
    frame.putalpha(alpha)
    return frame, removed


def main() -> None:
    args = parse_args()
    with Image.open(args.input) as source:
        sheet = source.convert("RGBA")
    if sheet.width % args.columns or sheet.height % args.rows:
        raise ValueError("Sheet dimensions must divide evenly by the sprite grid")
    frame_width = sheet.width // args.columns
    frame_height = sheet.height // args.rows
    output = Image.new("RGBA", sheet.size)
    removed_total = 0
    for index in range(args.columns * args.rows):
        x = (index % args.columns) * frame_width
        y = (index // args.columns) * frame_height
        frame = sheet.crop((x, y, x + frame_width, y + frame_height))
        frame, removed = clean_frame(frame, args.min_area, args.alpha_threshold)
        removed_total += removed
        output.alpha_composite(frame, (x, y))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.save(args.output, optimize=True)
    print("removed_pixels={0} wrote={1}".format(removed_total, args.output))


if __name__ == "__main__":
    main()
