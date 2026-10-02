"""Held mug, manager edition: the very same mug as Cézanne's desk `mug_manager` (cream glaze,
raised red "WORLD'S OKAYEST MANAGER", gold rim, coffee inside), turned so its handle points
back into the mitten and the lettering faces forward. Modelled around the mitten's
centre, shifted onto the rig's handGrip point): the handle disappears into the hand and the
mug sits just in front of it, upright.
Front faces -Y."""
import math

from mathutils import Matrix

from characters import _kit as kit
from decor import mug as MUG
from decor import mug_manager as MM

import lib

NAME = "held_mug_manager"
S = MM.S
HANDLE_OUT = 0.076 * S     # handle's reach from the mug axis
GRIP_Y = HANDLE_OUT + 0.046  # hand centre behind the mug axis: handle inside the mitten
GRIP_Z = 0.058 * S           # handle's mid-height above the mug bottom
META = dict(
    name="Manager's mug (held)", category="character-held", priority="P0",
    description="The WORLD'S OKAYEST MANAGER mug, gripped by its handle; pivot at the rig's handGrip",
    tags=["held", "manager", "coffee", "mug"], tintable=[],
    anchors_bl={"handGrip": (0, 0, 0), "handCentre": tuple(kit.hand_from_grip()),
                "coffee": tuple(kit.hand_from_grip() + kit.Vector(
                    (0, -GRIP_Y, MUG.COFFEE_Z * S - GRIP_Z))),
                "rim": tuple(kit.hand_from_grip() + kit.Vector((0, -GRIP_Y, 0.1 * S - GRIP_Z)))},
)


def build():
    lib.begin(NAME)
    M = MM.materials()
    before = set(lib.coll().objects)
    MUG.make(M, s=S, heart=False)
    turn = Matrix.Rotation(math.pi / 2, 4, "Z")  # handle +X → +Y, back toward the hand
    kit.transform(set(lib.coll().objects) - before, turn)
    MM.lettering(M)  # wraps the front (-Y), opposite the handle
    MM.rim(M)
    kit.transform(lib.coll().objects, Matrix.Translation((0, -GRIP_Y, -GRIP_Z)))
    kit.regrip()  # origin: the rig's handGrip (3 cm below, 6 cm ahead of the mitten centre)


def finalize(name):
    return kit.finalize(name, META, ao_distance=MM.AO_DISTANCE)
