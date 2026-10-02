"""Preset: employee B. A neat side part under big headphones, a cosy hoodie, grinning at a
phone in the left hand, blue sneakers. Assembled from the kit's parts in the rig's rest
pose; one joined mesh for the catalog. Pivot at the floor."""
from characters import _kit as kit
from characters import _preset as PR

NAME = "preset_employee_b"
SPEC = dict(
    head=[("char_head", 0.6), ("char_eye", 0.45), ("char_brow", 1.0), ("char_mouth_grin", 1.0),
          ("hair_side_part", 0.62), ("headphones", 0.5)],
    torso="char_torso_hoodie", sleeves="long", torso_keep=0.72,
    held={1: ("held_phone", 0.7)},
    arms={1: (28.0, 100.0)},
    colors=dict(Skin="#9B6640", Shirt="#7A86FF", Pants="#3D3D52", Shoes="#3A86FF",
                Hair="#2B1B10"),
)
META = dict(
    name="Preset: employee B", category="preset", priority="P0",
    description="Side part, headphones, hoodie, grinning at a phone",
    tags=["preset", "employee", "character"],
    tintable=["Skin", "Shirt", "Pants", "Shoes", "Hair", "Accent"],
    anchors_bl={"headTop": (0, 0, kit.DIM["pelvisY"] + kit.HEAD_Y + kit.R + 0.09)},
)


def build():
    PR.assemble(NAME, SPEC)


def finalize(name):
    return kit.finalize(name, META, lift=(0, 0, 0), ao_res=512, ao_distance=0.1)
