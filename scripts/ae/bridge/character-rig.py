"""Generate native After Effects shape layers for a simple jointed character.

The script prints a JSON operation list for the Higgsfield bridge. Create the
shape layers at their composition-space positions, set each joint anchor, and
then apply the parent relationships to preserve the pose.

Usage:
    python character-rig.py "Composition Name" hero 960 860 1.0 [main|crew1|crew2|crew3]

The existing variant names (``utama`` and ``anggota1``–``anggota3``) remain
accepted for compatibility with saved bridge commands.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

CHARACTER_VARIANTS = {
    "main": {
        "skin": "#C98B5E", "skin_shadow": "#B07650",
        "tunic": "#A9724A", "tunic_shadow": "#8C5A36",
        "hair": "#3B2A20", "beard": True,
    },
    "crew1": {
        "skin": "#D39A6A", "skin_shadow": "#B9835A",
        "tunic": "#7F8F5A", "tunic_shadow": "#66744A",
        "hair": "#2F2620", "beard": False,
    },
    "crew2": {
        "skin": "#B8784E", "skin_shadow": "#9E6644",
        "tunic": "#C8553D", "tunic_shadow": "#A84634",
        "hair": "#4A3325", "beard": False,
    },
    "crew3": {
        "skin": "#C48A5C", "skin_shadow": "#AA744E",
        "tunic": "#9C9186", "tunic_shadow": "#7D736A",
        "hair": "#2B2B2B", "beard": True,
    },
}
LEGACY_VARIANTS = {
    "utama": "main",
    "anggota1": "crew1",
    "anggota2": "crew2",
    "anggota3": "crew3",
}


def rgb_object(hex_color: str) -> dict[str, float]:
    """Convert a hex color into the normalized RGB object expected by AE."""
    color = hex_color.removeprefix("#")
    return {
        channel: round(int(color[index : index + 2], 16) / 255, 3)
        for channel, index in (("r", 0), ("g", 2), ("b", 4))
    }


def build_character_rig(
    composition: str,
    prefix: str,
    x: float,
    ground_y: float,
    scale: float,
    variant_name: str = "main",
) -> list[dict[str, Any]]:
    """Build the ordered AE operation list for one character rig."""
    variant_name = LEGACY_VARIANTS.get(variant_name, variant_name)
    if variant_name not in CHARACTER_VARIANTS:
        raise ValueError(f"Unknown character variant: {variant_name}")
    colors = CHARACTER_VARIANTS[variant_name]
    operations: list[dict[str, Any]] = []

    def x_at(offset: float) -> float:
        return x + offset * scale

    def y_at(offset: float) -> float:
        """Negative offsets move upward from the character's feet."""
        return ground_y + offset * scale

    def add_layer(
        name: str,
        shape: str,
        center_x: float,
        center_y: float,
        width: float,
        height: float,
        color: str,
        roundness: float = 0,
    ) -> None:
        layer = {
            "compositionName": composition,
            "name": f"{prefix} {name}",
            "shapeType": shape,
            "size": [round(width * scale, 1), round(height * scale, 1)],
            "position": [round(center_x, 1), round(center_y, 1)],
            "fillColor": rgb_object(color),
        }
        if shape == "rectangle" and roundness:
            layer["roundness"] = round(roundness * scale, 1)
        operations.append({"tool": "add_shape_layer", "input": layer})

    def set_joint(name: str, anchor_x: float, anchor_y: float, joint_x: float, joint_y: float) -> None:
        """Set the layer anchor relative to its shape and its comp position."""
        operations.append(
            {
                "tool": "modify_layer",
                "input": {
                    "compositionName": composition,
                    "layerName": f"{prefix} {name}",
                    "anchorPoint": [round(anchor_x * scale, 1), round(anchor_y * scale, 1)],
                    "position": [round(joint_x, 1), round(joint_y, 1)],
                },
            }
        )

    def parent_layer(child: str, parent: str) -> None:
        operations.append(
            {
                "tool": "modify_layer",
                "input": {
                    "compositionName": composition,
                    "layerName": f"{prefix} {child}",
                    "parentLayerName": f"{prefix} {parent}",
                },
            }
        )

    pelvis = (x_at(0), y_at(-214))
    operations.extend(
        [
            {"tool": "add_null_layer", "input": {"compositionName": composition, "name": f"{prefix} ROOT"}},
            {
                "tool": "modify_layer",
                "input": {
                    "compositionName": composition,
                    "layerName": f"{prefix} ROOT",
                    "anchorPoint": [50, 50],
                    "position": [round(pelvis[0], 1), round(pelvis[1], 1)],
                },
            },
        ]
    )

    parenting: list[tuple[str, str]] = []

    # Build the rear leg first so the front leg remains visually on top.
    for side, offset_x, shade in (("R", 24, "skin_shadow"), ("L", -24, "skin")):
        hip = (x_at(offset_x), y_at(-214))
        knee = (x_at(offset_x), y_at(-112))
        ankle = (x_at(offset_x), y_at(-16))

        add_layer(f"kaki-{side}", "rectangle", ankle[0] + 12 * scale, ankle[1] + 6 * scale, 64, 26, "#5A3E2B", 12)
        set_joint(f"kaki-{side}", -12, -6, ankle[0], ankle[1])
        add_layer(f"betis-{side}", "rectangle", knee[0], knee[1] + 50 * scale, 38, 110, colors[shade], 18)
        set_joint(f"betis-{side}", 0, -50, knee[0], knee[1])
        add_layer(f"paha-{side}", "rectangle", hip[0], hip[1] + 52 * scale, 46, 118, colors[shade], 22)
        set_joint(f"paha-{side}", 0, -52, hip[0], hip[1])
        parenting.extend(
            [(f"kaki-{side}", f"betis-{side}"), (f"betis-{side}", f"paha-{side}"), (f"paha-{side}", "ROOT")]
        )

    # Rear arm.
    shoulder = (x_at(52), y_at(-340))
    elbow = (x_at(52), y_at(-262))
    wrist = (x_at(52), y_at(-190))
    add_layer("tangan-R", "ellipse", wrist[0], wrist[1] + 8 * scale, 34, 40, colors["skin_shadow"])
    set_joint("tangan-R", 0, -8, wrist[0], wrist[1])
    add_layer("lenganbawah-R", "rectangle", elbow[0], elbow[1] + 36 * scale, 30, 86, colors["skin_shadow"], 15)
    set_joint("lenganbawah-R", 0, -36, elbow[0], elbow[1])
    add_layer("lengan-R", "rectangle", shoulder[0], shoulder[1] + 38 * scale, 34, 96, colors["skin_shadow"], 17)
    set_joint("lengan-R", 0, -38, shoulder[0], shoulder[1])

    # Torso and head.
    add_layer("torso", "rectangle", x_at(0), y_at(-290), 136, 190, colors["tunic"], 48)
    set_joint("torso", 0, 76, x_at(0), y_at(-214))
    add_layer("tunik-rumbai", "rectangle", x_at(0), y_at(-205), 150, 40, colors["tunic_shadow"], 18)
    set_joint("tunik-rumbai", 0, 0, x_at(0), y_at(-205))
    add_layer("leher", "rectangle", x_at(0), y_at(-388), 34, 40, colors["skin"], 12)
    set_joint("leher", 0, 0, x_at(0), y_at(-388))

    neck = (x_at(0), y_at(-398))
    add_layer("kepala", "ellipse", x_at(0), y_at(-470), 150, 162, colors["skin"])
    set_joint("kepala", 0, 72, neck[0], neck[1])
    add_layer("telinga", "ellipse", x_at(-70), y_at(-468), 30, 40, colors["skin_shadow"])
    set_joint("telinga", 0, 0, x_at(-70), y_at(-468))

    hair_positions = [(-48, -540, 80, 70), (0, -556, 96, 74), (48, -540, 80, 70), (-66, -505, 40, 60), (66, -505, 40, 60)]
    for index, (offset_x, offset_y, width, height) in enumerate(hair_positions, start=1):
        layer_name = f"rambut-{index}"
        add_layer(layer_name, "ellipse", x_at(offset_x), y_at(offset_y), width, height, colors["hair"])
        set_joint(layer_name, 0, 0, x_at(offset_x), y_at(offset_y))

    if colors["beard"]:
        add_layer("janggut", "ellipse", x_at(0), y_at(-408), 118, 70, colors["hair"])
        set_joint("janggut", 0, 0, x_at(0), y_at(-408))

    for side, offset_x in (("L", -28), ("R", 28)):
        add_layer(f"mata-{side}", "ellipse", x_at(offset_x), y_at(-472), 16, 20, "#23201C")
        set_joint(f"mata-{side}", 0, 0, x_at(offset_x), y_at(-472))
        add_layer(f"alis-{side}", "rectangle", x_at(offset_x), y_at(-500), 30, 8, colors["hair"], 4)
        set_joint(f"alis-{side}", 0, 0, x_at(offset_x), y_at(-500))

    add_layer("hidung", "ellipse", x_at(4), y_at(-450), 26, 22, colors["skin_shadow"])
    set_joint("hidung", 0, 0, x_at(4), y_at(-450))
    add_layer("mulut", "rectangle", x_at(2), y_at(-422), 34, 9, "#5A2E24", 5)
    set_joint("mulut", 0, 0, x_at(2), y_at(-422))

    # Front arm.
    shoulder = (x_at(-52), y_at(-340))
    elbow = (x_at(-52), y_at(-262))
    wrist = (x_at(-52), y_at(-190))
    add_layer("tangan-L", "ellipse", wrist[0], wrist[1] + 8 * scale, 34, 40, colors["skin"])
    set_joint("tangan-L", 0, -8, wrist[0], wrist[1])
    add_layer("lenganbawah-L", "rectangle", elbow[0], elbow[1] + 36 * scale, 30, 86, colors["skin"], 15)
    set_joint("lenganbawah-L", 0, -36, elbow[0], elbow[1])
    add_layer("lengan-L", "rectangle", shoulder[0], shoulder[1] + 38 * scale, 34, 96, colors["tunic"], 17)
    set_joint("lengan-L", 0, -38, shoulder[0], shoulder[1])

    parenting.extend(
        [
            ("tangan-R", "lenganbawah-R"), ("lenganbawah-R", "lengan-R"), ("lengan-R", "torso"),
            ("tangan-L", "lenganbawah-L"), ("lenganbawah-L", "lengan-L"), ("lengan-L", "torso"),
            ("tunik-rumbai", "torso"), ("leher", "torso"), ("kepala", "torso"),
            ("telinga", "kepala"), ("hidung", "kepala"), ("mulut", "kepala"),
        ]
    )
    parenting.extend((f"rambut-{index}", "kepala") for index in range(1, 6))
    parenting.extend((f"mata-{side}", "kepala") for side in "LR")
    parenting.extend((f"alis-{side}", "kepala") for side in "LR")
    if colors["beard"]:
        parenting.append(("janggut", "kepala"))
    parenting.append(("torso", "ROOT"))

    for child, parent in parenting:
        parent_layer(child, parent)
    return operations


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("composition", help="After Effects composition name")
    parser.add_argument("prefix", help="prefix used for all generated layer names")
    parser.add_argument("x", type=float, help="character center in composition pixels")
    parser.add_argument("ground_y", type=float, help="ground position in composition pixels")
    parser.add_argument("scale", type=float, help="character scale, where 1.0 is 100%%")
    parser.add_argument(
        "variant",
        nargs="?",
        default="main",
        choices=tuple(CHARACTER_VARIANTS) + tuple(LEGACY_VARIANTS),
        help="character color variant (default: main)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    operations = build_character_rig(
        args.composition,
        args.prefix,
        args.x,
        args.ground_y,
        args.scale,
        args.variant,
    )
    print(json.dumps(operations, separators=(",", ":")))
    print(f"{len(operations)} operations", file=sys.stderr)


if __name__ == "__main__":
    main()
