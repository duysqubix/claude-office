"""Preset: the manager (that's you). White shirt and red tie, navy trousers, slicked-back
hair, the WORLD'S OKAYEST MANAGER mug raised in the right hand, a touch taller (1.08×).
Assembled from the kit's own parts in the rig's rest pose; one joined mesh for the catalog.
Pivot at the floor between the feet."""
from characters import _kit as kit
from characters import _preset as PR

NAME = "preset_manager"
SPEC = dict(
    head=[("char_head", 0.6), ("char_eye", 0.45), ("char_brow", 1.0), ("char_mouth_smile", 1.0),
          ("hair_slick", 0.75)],
    torso="char_torso_shirt_tie", sleeves="long",
    held={-1: ("held_mug_manager", 0.45)},
    arms={-1: (48.0, 64.0)},
    colors=dict(Skin="#F7C59F", Shirt="#F4F6FA", Pants="#2B2D42", Shoes="#5B3A29",
                Hair="#3B2A20"),
    scale=1.08,
)
META = dict(
    name="Preset: manager", category="preset", priority="P0",
    description="The manager: white shirt, red tie, slick hair, okayest-manager mug",
    tags=["preset", "manager", "character"],
    tintable=["Skin", "Shirt", "Pants", "Shoes", "Hair"],
    anchors_bl={"headTop": (0, 0, (kit.DIM["pelvisY"] + kit.HEAD_Y + kit.R + 0.06) * 1.08)},
)


def build():
    PR.assemble(NAME, SPEC)


def finalize(name):
    return kit.finalize(name, META, lift=(0, 0, 0), ao_res=512, ao_distance=0.1)
