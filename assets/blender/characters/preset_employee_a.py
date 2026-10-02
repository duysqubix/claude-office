"""Preset: employee A. A chestnut bob, round glasses, a green tee with the office lanyard,
jeans and red sneakers, a clipboard in the left hand. Assembled from the kit's parts in
the rig's rest pose; one joined mesh for the catalog. Pivot at the floor."""
from characters import _kit as kit
from characters import _preset as PR

NAME = "preset_employee_a"
SPEC = dict(
    head=[("char_head", 0.6), ("char_eye", 0.45), ("char_brow", 1.0), ("char_mouth_smile", 1.0),
          ("hair_bob", 0.62), ("glasses_round", 0.6)],
    torso="char_torso_tee", extras=[("lanyard_badge", 0.6)],
    held={1: ("held_clipboard", 0.5)},
    arms={1: (8.0, 72.0)},
    colors=dict(Skin="#E7A977", Shirt="#6BCB77", Pants="#2F3E66", Shoes="#E63946",
                Hair="#A0522D"),
)
META = dict(
    name="Preset: employee A", category="preset", priority="P0",
    description="Bob, round glasses, green tee, lanyard and a clipboard",
    tags=["preset", "employee", "character"],
    tintable=["Skin", "Shirt", "Pants", "Shoes", "Hair", "Accent"],
    anchors_bl={"headTop": (0, 0, kit.DIM["pelvisY"] + kit.HEAD_Y + kit.R + 0.05)},
)


def build():
    PR.assemble(NAME, SPEC)


def finalize(name):
    return kit.finalize(name, META, lift=(0, 0, 0), ao_res=512, ao_distance=0.1)
