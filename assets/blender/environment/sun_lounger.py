"""Sun lounger: a chunky honey-wood frame on four legs (two little wheels at the head end),
plank bed, and a back rest hinged up at 35° on a prop, with slats behind. A thick teal
cushion follows the bed and the back rest, with a cream pillow at the top. 1.9 × 0.7 m,
cushion top 0.35 m. Origin at the ground centre; the feet end faces -Y (three.js +Z), the
head end is the raised back rest."""
import math

from mathutils import Matrix, Vector

import lib
from characters import _kit as kit
from environment import _env

NAME = "sun_lounger"
AO_RES = 512
AO_DISTANCE = 0.25

L = 1.9               # frame length (y)
W = 0.7               # overall width (x)
BED_Z = 0.29          # top of the bed planks
CUSHION = 0.06
HINGE_Y = 0.22        # where the back rest lifts off the bed
BACK_LEN = 0.85
BACK = math.radians(35)
PILLOW_S = 0.56       # pillow centre, up the back rest from the hinge
FEET_Y = -L / 2

# A lying body's pelvis joint and head centre sit this far off the surface under them: the
# rig's torso depth behind the pelvis (with the pants) and the head's radius.
PELVIS_UP = kit.torso_radius_at(0.0) * kit.TORSO_Z + kit.TORSO["pantsOffset"]
HEAD_UP = kit.R


def materials():
    return dict(
        wood=lib.mat("Wood", lib.P["wood"], rough=0.6),
        dark=lib.mat("WoodDark", "#A9733F", rough=0.65),
        cushion=lib.mat("Cushion", lib.P["chairs"][3], rough=0.85),
        pillow=lib.mat("Pillow", lib.P["deskTop"], rough=0.85),
        wheel=lib.mat("Wheel", _env.P["doorFrame"], rough=0.5),
    )


def back_frame():
    """Back rest space → world: origin on the hinge line at bed height, +Y up the rest."""
    return Matrix.Translation((0, HINGE_Y, BED_Z)) @ Matrix.Rotation(BACK, 4, "X")


def frame(M):
    rx = W / 2 - 0.04
    for s in (-1, 1):
        lib.rbox(f"Rail{s}", (0.06, L, 0.1), (s * rx, 0, BED_Z - 0.06), M["wood"], r=0.02,
                 seg=2)
        for y in (FEET_Y + 0.1, L / 2 - 0.1):
            lib.rbox(f"Leg{s}{y:+.2f}", (0.07, 0.07, BED_Z - 0.06), (s * rx, y, (BED_Z - 0.06) / 2),
                     M["dark"], r=0.018, seg=1)
        # Little wheels on the outside of the head-end legs.
        lib.cyl(f"Wheel{s}", 0.07, 0.035, (s * (rx + 0.055), L / 2 - 0.1, 0.07), M["wheel"],
                r=0.012, seg=1, verts=14, rot=(0, math.pi / 2, 0))
    for y in (FEET_Y + 0.03, L / 2 - 0.03):
        lib.rbox(f"End{y:+.2f}", (2 * rx, 0.06, 0.08), (0, y, BED_Z - 0.06), M["wood"], r=0.02,
                 seg=2)
    # Bed planks from the feet to the hinge (under the cushion; their edges show).
    n = 4
    span = HINGE_Y - FEET_Y
    for i in range(n):
        y = FEET_Y + span * (i + 0.5) / n
        lib.rbox(f"Plank{i}", (2 * rx - 0.02, span / n - 0.015, 0.03), (0, y, BED_Z - 0.015),
                 M["wood"], r=0.008, seg=1)


def back_rest(M):
    """Slatted panel hinged at the bed and raised on a prop."""
    rx = W / 2 - 0.07
    parts = []
    for s in (-1, 1):
        parts.append(lib.rbox(f"BackSide{s}", (0.05, BACK_LEN, 0.05),
                              (s * rx, BACK_LEN / 2, -0.025), M["wood"], r=0.016, seg=2))
    for i in range(5):
        y = 0.08 + i * (BACK_LEN - 0.12) / 4
        parts.append(lib.rbox(f"Slat{i}", (2 * rx + 0.04, 0.1, 0.025), (0, y, -0.0125),
                              M["wood"], r=0.008, seg=1))
    for o in parts:
        o.matrix_basis = back_frame() @ o.matrix_basis
    # The prop: from under the rest, two thirds up, down onto the rails.
    top = back_frame() @ Vector((0, BACK_LEN * 0.62, -0.05))
    foot = Vector((0, top.y + 0.12, BED_Z - 0.01))
    d = top - foot
    for s in (-1, 1):
        x = s * (W / 2 - 0.12)
        mid = (Vector((x, top.y, top.z)) + Vector((x, foot.y, foot.z))) / 2
        lib.rbox(f"Prop{s}", (0.04, 0.04, d.length), tuple(mid), M["dark"], r=0.012, seg=1,
                 rot=(-math.atan2(d.y, d.z), 0, 0))
    lib.rbox("PropBar", (W - 0.2, 0.04, 0.04), (0, foot.y, foot.z + 0.01), M["dark"], r=0.012,
             seg=1)


def cushion(M):
    rx = W / 2 - 0.05
    span = HINGE_Y - FEET_Y - 0.03
    lib.rbox("CushionBed", (2 * rx, span + 0.04, CUSHION),
             (0, FEET_Y + 0.03 + span / 2, BED_Z + CUSHION / 2), M["cushion"], r=0.026, seg=3)
    up = lib.rbox("CushionBack", (2 * rx, BACK_LEN - 0.02, CUSHION),
                  (0, (BACK_LEN - 0.02) / 2, CUSHION / 2), M["cushion"], r=0.026, seg=3)
    pillow = lib.rbox("Pillow", (0.36, 0.17, 0.08), (0, PILLOW_S, CUSHION + 0.035),
                      M["pillow"], r=0.038, seg=3)
    for o in (up, pillow):
        o.matrix_basis = back_frame() @ o.matrix_basis


def on_back(s, lift=0.0):
    """World point on the back rest's cushion, s metres up from the hinge."""
    return back_frame() @ Vector((0, s, CUSHION + lift))


def build():
    lib.begin(NAME)
    M = materials()
    frame(M)
    back_rest(M)
    cushion(M)


META = dict(
    name="Sun lounger",
    category="outdoor",
    priority="P1",
    artist="Claude Rodin",
    description="Honey-wood sun lounger with a raised back rest, a thick teal cushion and a pillow",
    tags=["garden", "lounge", "seating", "lying"],
    tintable=[],
    # Someone lying on their back: pelvis just short of the hinge, head on the pillow.
    anchors_bl={"lie": (0, HINGE_Y - 0.1, BED_Z + CUSHION + PELVIS_UP),
                "head": tuple(on_back(PILLOW_S, lift=0.075 + HEAD_UP))},
    notes="'lie' = the pelvis joint of someone lying on their back (cushion top 0.35 m), "
          "'head' = their head centre on the pillow; the back rest is up 35°, feet toward +Z.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
