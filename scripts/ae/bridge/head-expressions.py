"""Create expression and blink variants from transparent cartoon-head PNGs.

The input style should use two solid dark eyes and a simple line mouth. The
script detects those features, redraws the mouth for three expressions, and
creates a blink variant for each expression. No image generation is needed.

Usage:
    python head-expressions.py character/head-person.png character/head-woman.png

Generated files are written beside each input. The shared metadata file is
written beside the first input. Output names retain the existing Indonesian
expression labels used by the cartoon-stage starter.

Dependencies: Pillow, NumPy, and OpenCV (opencv-python).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageDraw

INK = (35, 32, 28, 255)
FALLBACK_SKIN = (200, 140, 100, 255)
DARK_PIXEL_THRESHOLD = 90
ALPHA_THRESHOLD = 180
MIN_COMPONENT_AREA = 60
EXPRESSIONS = ("senang", "cemas", "kaget")


def draw_bezier(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[float, float]],
    color: tuple[int, int, int, int],
    width: int,
) -> None:
    """Draw a cubic Bezier curve using sampled points."""
    p0, p1, p2, p3 = (np.asarray(point, dtype=float) for point in points)
    samples = np.linspace(0.0, 1.0, 50)
    curve = []
    for t in samples:
        point = (
            (1 - t) ** 3 * p0
            + 3 * (1 - t) ** 2 * t * p1
            + 3 * (1 - t) * t**2 * p2
            + t**3 * p3
        )
        curve.append(tuple(point))
    draw.line(curve, fill=color, width=width, joint="curve")


def output_name(image_path: Path) -> str:
    """Remove the optional ``head-`` prefix from an input filename."""
    prefix = "head-"
    return image_path.stem[len(prefix) :] if image_path.stem.startswith(prefix) else image_path.stem


def detect_features(image: Image.Image, name: str) -> dict[str, Any]:
    """Detect the head bounds, two eyes, mouth, and a nearby skin color."""
    pixels = np.asarray(image)
    height, width = pixels.shape[:2]
    alpha = pixels[:, :, 3]

    visible_y, visible_x = np.where(alpha > 10)
    if visible_x.size == 0:
        raise ValueError(f"{name}: image is fully transparent")

    bbox = [
        int(visible_x.min()),
        int(visible_y.min()),
        int(visible_x.max()),
        int(visible_y.max()),
    ]
    dark = (
        (pixels[:, :, :3].max(axis=2) < DARK_PIXEL_THRESHOLD)
        & (alpha > ALPHA_THRESHOLD)
    ).astype(np.uint8)
    count, _, stats, centers = cv2.connectedComponentsWithStats(dark)
    components = [
        (stats[index], centers[index])
        for index in range(1, count)
        if stats[index, cv2.CC_STAT_AREA] > MIN_COMPONENT_AREA
    ]

    eyes = [
        component
        for component in components
        if 12 < component[0][cv2.CC_STAT_WIDTH] < 80
        and 12 < component[0][cv2.CC_STAT_HEIGHT] < 80
        and abs(
            component[0][cv2.CC_STAT_WIDTH]
            - component[0][cv2.CC_STAT_HEIGHT]
        )
        < component[0][cv2.CC_STAT_WIDTH] * 0.5
        and height * 0.35 < component[1][1] < height * 0.75
    ]
    eyes = sorted(
        sorted(eyes, key=lambda item: item[0][cv2.CC_STAT_AREA], reverse=True)[:2],
        key=lambda item: item[1][0],
    )
    if len(eyes) != 2:
        raise ValueError(
            f"{name}: could not detect two pupils; use two solid dark eye dots"
        )

    eye_y = float(np.mean([eye[1][1] for eye in eyes]))
    eye_x = float(np.mean([eye[1][0] for eye in eyes]))
    mouths = [
        component
        for component in components
        if component[1][1] > eye_y + 20
        and component[0][cv2.CC_STAT_WIDTH]
        > component[0][cv2.CC_STAT_HEIGHT] * 1.6
        and component[0][cv2.CC_STAT_WIDTH] < width * 0.4
    ]
    if not mouths:
        raise ValueError(f"{name}: could not detect the mouth")

    mouth_stats, _ = max(mouths, key=lambda item: item[0][cv2.CC_STAT_AREA])
    mouth_x = int(mouth_stats[cv2.CC_STAT_LEFT])
    mouth_y = int(mouth_stats[cv2.CC_STAT_TOP])
    mouth_width = int(mouth_stats[cv2.CC_STAT_WIDTH])
    mouth_height = int(mouth_stats[cv2.CC_STAT_HEIGHT])

    sample_y = int((eye_y + mouth_y) / 2)
    sample_x = int(eye_x)
    skin = tuple(int(channel) for channel in pixels[sample_y, sample_x])
    if skin[3] < 200:
        skin = FALLBACK_SKIN

    return {
        "size": [width, height],
        "bbox": bbox,
        "eyes": [
            [
                float(center[0]),
                float(center[1]),
                int(max(stats[cv2.CC_STAT_WIDTH], stats[cv2.CC_STAT_HEIGHT])),
            ]
            for stats, center in eyes
        ],
        "mouth": [mouth_x, mouth_y, mouth_width, mouth_height],
        "skin": list(skin[:3]),
    }


def redraw_expression(
    image: Image.Image,
    metadata: dict[str, Any],
    expression: str,
    blink: bool,
) -> Image.Image:
    """Return a copy of the input with the requested face variant."""
    result = image.copy()
    draw = ImageDraw.Draw(result)
    skin = (*metadata["skin"], 255)
    mouth_x, mouth_y, mouth_width, mouth_height = metadata["mouth"]

    if blink:
        for eye_x, eye_y, eye_size in metadata["eyes"]:
            radius = eye_size * 0.75
            draw.ellipse(
                (eye_x - radius, eye_y - radius, eye_x + radius, eye_y + radius),
                fill=skin,
            )
            draw_bezier(
                draw,
                [
                    (eye_x - eye_size * 0.9, eye_y),
                    (eye_x - eye_size * 0.35, eye_y + eye_size * 0.45),
                    (eye_x + eye_size * 0.35, eye_y + eye_size * 0.45),
                    (eye_x + eye_size * 0.9, eye_y),
                ],
                INK,
                max(4, int(eye_size * 0.28)),
            )

    if expression != "senang":
        padding = int(mouth_height * 0.9)
        draw.rectangle(
            (
                mouth_x - padding,
                mouth_y - padding,
                mouth_x + mouth_width + padding,
                mouth_y + mouth_height + padding,
            ),
            fill=skin,
        )
        center_x = mouth_x + mouth_width / 2
        center_y = mouth_y + mouth_height / 2
        line_width = max(4, int(mouth_height * 0.9))

        if expression == "cemas":
            draw_bezier(
                draw,
                [
                    (center_x - mouth_width * 0.45, center_y + mouth_height * 0.4),
                    (center_x - mouth_width * 0.15, center_y - mouth_height * 0.9),
                    (center_x + mouth_width * 0.15, center_y - mouth_height * 0.9),
                    (center_x + mouth_width * 0.45, center_y + mouth_height * 0.4),
                ],
                INK,
                line_width,
            )
        else:
            radius = mouth_height * 1.1
            draw.ellipse(
                (
                    center_x - radius * 0.8,
                    center_y - radius,
                    center_x + radius * 0.8,
                    center_y + radius,
                ),
                fill=INK,
            )

    return result


def process_image(image_path: Path) -> tuple[str, dict[str, Any]]:
    """Generate all expression variants for one input image."""
    name = output_name(image_path)
    with Image.open(image_path) as source:
        image = source.convert("RGBA")

    metadata = detect_features(image, name)
    for expression in EXPRESSIONS:
        for blink in (False, True):
            variant = redraw_expression(image, metadata, expression, blink)
            suffix = f"-{expression}{'-kedip' if blink else ''}.png"
            variant.save(image_path.parent / f"{name}{suffix}")

    return name, metadata


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "images",
        nargs="+",
        type=Path,
        help="transparent PNG head images to process",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    metadata_by_name = {}

    for image_path in args.images:
        if not image_path.is_file():
            raise FileNotFoundError(f"Input image does not exist: {image_path}")
        name, metadata = process_image(image_path)
        metadata_by_name[name] = metadata
        pupils = [eye[:2] for eye in metadata["eyes"]]
        print(f"{name}: bbox={metadata['bbox']}, pupils={pupils}")

    metadata_path = args.images[0].parent / "kepala-meta.json"
    existing_metadata = {}
    if metadata_path.exists():
        with metadata_path.open(encoding="utf-8") as metadata_file:
            existing_metadata = json.load(metadata_file)

    existing_metadata.update(metadata_by_name)
    with metadata_path.open("w", encoding="utf-8") as metadata_file:
        json.dump(existing_metadata, metadata_file, indent=2, ensure_ascii=False)
        metadata_file.write("\n")
    print(f"Metadata written to {metadata_path}")


if __name__ == "__main__":
    main()
