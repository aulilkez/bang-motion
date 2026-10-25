"""Generate SVG illustration assets and an After Effects placement manifest.

Each asset is drawn in local coordinates around a pivot. SVGs render at 2x so
they can be imported into After Effects at 50% scale. The generated manifest
contains the layer position and anchor point expected by the Higgsfield bridge.

Usage:
    python svg-assets.py
    node svg2png.cjs aset

The scene below is an editable example. Replace its asset definitions and
palette with the scene described in the project's style brief.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Callable, Iterable

SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SCRIPT_DIR / "aset"
MANIFEST_PATH = SCRIPT_DIR / "manifest.json"
RENDER_SCALE = 2
BOUNDS_PADDING = 6

PALETTE = {
    "sky1": "#CFE6E4", "sky2": "#FBF1DC",
    "oker": "#D9A066", "oker2": "#B97F4A",
    "batu": "#9C9186", "batu2": "#7D736A",
    "rumput": "#9DB874", "rumput2": "#7FA65E",
    "api": "#C8553D", "api2": "#F2C46D",
    "tinta": "#2F4858", "kayu": "#8A6A4A",
    "krem": "#FBF1DC", "air": "#5AABB8", "air2": "#9ED6DD",
    "malam": "#34505E",
}

Manifest = dict[str, list[dict[str, object]]]
DrawFunction = Callable[["ShapeBuilder"], None]
MANIFEST: Manifest = {}


class ShapeBuilder:
    """Build SVG shapes in local coordinates and track their visible bounds."""

    def __init__(self) -> None:
        self.items: list[str] = []
        self.min_x = math.inf
        self.min_y = math.inf
        self.max_x = -math.inf
        self.max_y = -math.inf

    def _include(self, points: Iterable[tuple[float, float]]) -> None:
        for x, y in points:
            self.min_x = min(self.min_x, x)
            self.min_y = min(self.min_y, y)
            self.max_x = max(self.max_x, x)
            self.max_y = max(self.max_y, y)

    def rectangle(
        self,
        x: float,
        y: float,
        width: float,
        height: float,
        color: str,
        radius: float = 0,
        rotation: float = 0,
    ) -> "ShapeBuilder":
        angle = math.radians(rotation)
        cos_angle, sin_angle = math.cos(angle), math.sin(angle)
        corners = [
            (
                x + dx * cos_angle - dy * sin_angle,
                y + dx * sin_angle + dy * cos_angle,
            )
            for dx in (-width / 2, width / 2)
            for dy in (-height / 2, height / 2)
        ]
        self._include(corners)
        fill = PALETTE.get(color, color)
        self.items.append(
            f'<rect x="{-width / 2:.1f}" y="{-height / 2:.1f}" '
            f'width="{width:.1f}" height="{height:.1f}" rx="{radius:.1f}" '
            f'fill="{fill}" transform="translate({x:.1f} {y:.1f}) rotate({rotation})"/>'
        )
        return self

    def ellipse(
        self,
        x: float,
        y: float,
        width: float,
        height: float,
        color: str,
    ) -> "ShapeBuilder":
        self._include(((x - width / 2, y - height / 2), (x + width / 2, y + height / 2)))
        fill = PALETTE.get(color, color)
        self.items.append(
            f'<ellipse cx="{x:.1f}" cy="{y:.1f}" '
            f'rx="{width / 2:.1f}" ry="{height / 2:.1f}" fill="{fill}"/>'
        )
        return self

    def polygon(
        self,
        points: list[tuple[float, float]],
        color: str,
        smooth: float = 0.0,
    ) -> "ShapeBuilder":
        """Draw a closed polygon; smoothing converts corners to Bezier curves."""
        if len(points) < 3:
            raise ValueError("A closed polygon needs at least three points")

        tangents = []
        count = len(points)
        for index in range(count):
            previous = points[(index - 1) % count]
            following = points[(index + 1) % count]
            tangents.append(
                (
                    (following[0] - previous[0]) * smooth / 2,
                    (following[1] - previous[1]) * smooth / 2,
                )
            )

        path_data = f"M{points[0][0]:.1f} {points[0][1]:.1f}"
        for index, start in enumerate(points):
            end = points[(index + 1) % count]
            start_tangent = tangents[index]
            end_tangent = tangents[(index + 1) % count]
            control_1 = (start[0] + start_tangent[0], start[1] + start_tangent[1])
            control_2 = (end[0] - end_tangent[0], end[1] - end_tangent[1])
            path_data += (
                f" C{control_1[0]:.1f} {control_1[1]:.1f} "
                f"{control_2[0]:.1f} {control_2[1]:.1f} "
                f"{end[0]:.1f} {end[1]:.1f}"
            )
            self._include((control_1, control_2, end))

        fill = PALETTE.get(color, color)
        self.items.append(f'<path d="{path_data} Z" fill="{fill}"/>')
        return self


def add_asset(
    scene: str,
    name: str,
    draw: DrawFunction,
    pivot: tuple[float, float] = (0, 0),
) -> None:
    """Draw an asset, save its SVG, and append its placement data to the manifest."""
    shapes = ShapeBuilder()
    draw(shapes)
    if not shapes.items:
        raise ValueError(f"Asset {name!r} in scene {scene!r} has no shapes")

    left = math.floor(shapes.min_x - BOUNDS_PADDING)
    top = math.floor(shapes.min_y - BOUNDS_PADDING)
    width = math.ceil(shapes.max_x + BOUNDS_PADDING) - left
    height = math.ceil(shapes.max_y + BOUNDS_PADDING) - top
    filename = f"{scene.split()[0]}_{name.replace(' ', '-')}.svg"
    view_box = f"{left} {top} {width} {height}"
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{width * RENDER_SCALE}" height="{height * RENDER_SCALE}" '
        f'viewBox="{view_box}">'
        f'{"".join(shapes.items)}</svg>'
    )
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / filename).write_text(svg, encoding="utf-8")

    MANIFEST.setdefault(scene, []).append(
        {
            "name": name,
            "svg": filename,
            "png": filename.removesuffix(".svg") + ".png",
            "w": width * RENDER_SCALE,
            "h": height * RENDER_SCALE,
            "pos": [round(pivot[0], 1), round(pivot[1], 1)],
            "anchor": [-left * RENDER_SCALE, -top * RENDER_SCALE],
            "scale": 100 / RENDER_SCALE,
        }
    )


# Reusable scene elements. Coordinates are composition-space; background pivots
# usually sit at (0, 0).
def draw_hills(shapes: ShapeBuilder, base_y: float, color: str = "rumput") -> None:
    shapes.polygon(
        [
            (-400, base_y + 460), (-400, base_y), (100, base_y - 120),
            (520, base_y - 40), (900, base_y - 190), (1350, base_y - 70),
            (1760, base_y - 160), (2320, base_y - 30), (2320, base_y + 460),
        ],
        color,
        smooth=0.4,
    )


def draw_ground(
    shapes: ShapeBuilder,
    ground_y: float,
    color: str = "oker",
    rim_color: str = "rumput2",
) -> None:
    shapes.rectangle(960, ground_y + 300, 2700, 600, color)
    shapes.rectangle(960, ground_y + 8, 2700, 22, rim_color)


def draw_rock(
    shapes: ShapeBuilder,
    x: float,
    y: float,
    scale: float = 1.0,
    color: str = "batu",
) -> None:
    shapes.polygon(
        [
            (x - 90 * scale, y), (x - 70 * scale, y - 55 * scale),
            (x - 10 * scale, y - 80 * scale), (x + 60 * scale, y - 60 * scale),
            (x + 95 * scale, y),
        ],
        color,
        smooth=0.5,
    )


def draw_tree(shapes: ShapeBuilder, x: float, ground_y: float, scale: float = 1.0) -> None:
    shapes.rectangle(x, ground_y - 90 * scale, 34 * scale, 190 * scale, "kayu", 10 * scale)
    shapes.ellipse(x - 60 * scale, ground_y - 230 * scale, 150 * scale, 130 * scale, "rumput2")
    shapes.ellipse(x + 55 * scale, ground_y - 240 * scale, 140 * scale, 125 * scale, "rumput2")
    shapes.ellipse(x, ground_y - 300 * scale, 170 * scale, 150 * scale, "rumput")


def add_campfire(scene: str, x: float, ground_y: float) -> None:
    """Create separate wood and flame layers for independent animation."""
    add_asset(
        scene,
        "api kayu",
        lambda shapes: shapes.rectangle(-60, 0, 150, 18, "kayu", 8, -12).rectangle(
            60, 0, 150, 18, "kayu", 8, 12
        ),
        (x, ground_y),
    )
    flames = [(-28, 70, 170), (26, 60, 140), (0, 46, 100)]
    for index, (offset_x, width, height) in enumerate(flames, start=1):
        color = "api" if height > 120 else "api2"
        add_asset(
            scene,
            f"api lidah {index}",
            lambda shapes, width=width, height=height, color=color: shapes.ellipse(
                0, -height / 2, width, height, color
            ),
            (x + offset_x, ground_y - 22),
        )


def build_example_scene() -> None:
    """Build the editable example campfire scene."""
    scene = "P01 contoh"
    ground_y = 860
    add_asset(scene, "bukit jauh", lambda shapes: draw_hills(shapes, 700))
    add_asset(scene, "tanah", lambda shapes: draw_ground(shapes, ground_y))
    add_asset(scene, "pohon", lambda shapes: draw_tree(shapes, 0, 0, 1.1), (1500, ground_y))
    add_asset(
        scene,
        "batu duduk",
        lambda shapes: draw_rock(shapes, 0, 0, 0.9, "batu2"),
        (560, ground_y + 20),
    )
    add_campfire(scene, 960, ground_y + 20)
    add_asset(
        scene,
        "cahaya api",
        lambda shapes: shapes.ellipse(0, 0, 900, 520, "api2"),
        (960, ground_y - 60),
    )


def main() -> None:
    build_example_scene()
    with MANIFEST_PATH.open("w", encoding="utf-8") as manifest_file:
        json.dump(MANIFEST, manifest_file, indent=2, ensure_ascii=False)
        manifest_file.write("\n")
    asset_count = sum(len(scene_assets) for scene_assets in MANIFEST.values())
    print(f"Generated {asset_count} assets across {len(MANIFEST)} scenes: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
