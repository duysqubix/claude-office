"""Preset: the intern. Small (0.7×), a backwards cap, an orange tee, wide-eyed "oh!", and a
tiny laptop held out in both hands. Assembled from the kit's parts in the rig's rest pose;
one joined mesh for the catalog. Pivot at the floor."""
from mathutils import Vector

from characters import _kit as kit
from characters import _preset as PR

NAME = "preset_intern"
ARMS = {1: (34.0, 62.0), -1: (34.0, 62.0)}
J = PR.joints(arms=ARMS)
MID = (J[("handCentre", 1)] + J[("handCentre", -1)]) / 2
SPEC = dict(
    head=[("char_head", 0.6), ("char_eye", 0.45), ("char_brow", 1.0), ("char_mouth_o", 1.0),
          ("hat_cap_backwards", 0.65)],
    torso="char_torso_tee",
    held={1: ("held_laptop", 0.8)},
    held_at={1: MID + Vector((0, 0.0, 0.05))},
    arms=ARMS,
    colors=dict(Skin="#FFDDBB", Shirt="#FF9F45", Pants="#4B3F72", Shoes="#3A86FF",
                Hair="#E8C07D"),
    scale=0.7,
)
META = dict(
    name="Preset: intern", category="preset", priority="P0",
    description="Mini intern: backwards cap, orange tee, tiny laptop held out",
    tags=["preset", "intern", "character"],
    tintable=["Skin", "Shirt", "Pants", "Shoes", "Hair", "Accent"],
    anchors_bl={"headTop": (0, 0, (kit.DIM["pelvisY"] + kit.HEAD_Y + kit.R + 0.09) * 0.7)},
)


def build():
    PR.assemble(NAME, SPEC)


def finalize(name):
    return kit.finalize(name, META, lift=(0, 0, 0), ao_res=512, ao_distance=0.08)
