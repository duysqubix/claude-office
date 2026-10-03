"""Hammock on its own stand (no trees needed): a honey-wood frame (a base beam on two cross
feet, arms raking out to hooks 1.15 m up, 3.1 m apart; 3.2 m overall) holding a striped bed between
two spreader bars on rope fans. The bed sags to 0.5 m in the middle and cups a little across;
a puffy pillow lies toward the -X end. Origin at the ground centre; the bed runs along X.

The bed, bars, ropes and pillow are one node, `Bed`, pivoting on the line between the hooks:
rotate it about X to sway (a lying person rides along from the `lie` anchor)."""
import math

import bmesh
from mathutils import Matrix, Vector

import lib
from characters import _kit as kit
from environment import _env

NAME = "hammock"
AO_RES = 512
AO_DISTANCE = 0.25

HOOK_X, HOOK_Z = 1.55, 1.15     # hook points at (±HOOK_X, 0, HOOK_Z)
BAR_X, BAR_Z = 1.0, 0.86        # spreader bars at the bed's ends
LOW_Z = 0.5                     # the bed's lowest point (its top face), in the middle
BED_W = 0.8
CUP = 0.035                     # how much the bed's long edges ride up
THICK = 0.016
STRIPES = ["coral", "sunny", "teal", "cream", "lilac", "teal", "sunny", "coral"]
COLOURS = list(dict.fromkeys(STRIPES))          # one material slot per colour
SLOT = [COLOURS.index(c) for c in STRIPES]
PIVOT = (0, 0, HOOK_Z - 0.05)   # the Bed node swings about X through here
PILLOW_X = -0.45

# A lying body's pelvis joint and head centre sit this far off the surface under them: the
# rig's torso depth behind the pelvis (with the pants) and the head's radius.
PELVIS_UP = kit.torso_radius_at(0.0) * kit.TORSO_Z + kit.TORSO["pantsOffset"]
HEAD_UP = kit.R


def materials():
    acc = lib.P["deskAccents"]
    return dict(
        wood=lib.mat("Wood", lib.P["wood"], rough=0.6),
        dark=lib.mat("WoodDark", "#A9733F", rough=0.65),
        rope=lib.mat("Rope", "#F2E3C6", rough=0.8),
        coral=lib.mat("Coral", acc[0], rough=0.8),
        sunny=lib.mat("Sunny", acc[1], rough=0.8),
        teal=lib.mat("Teal", lib.P["chairs"][3], rough=0.8),
        cream=lib.mat("Cream", lib.P["deskTop"], rough=0.8),
        lilac=lib.mat("Lilac", acc[4], rough=0.8),
        hook=lib.mat("Hook", _env.P["doorFrame"], rough=0.45, metal=0.3),
    )


def bed_z(x, y=0.0):
    """Top face of the bed: a parabola from the bars down to LOW_Z, cupped across."""
    return LOW_Z + (BAR_Z - LOW_Z) * (x / BAR_X) ** 2 + CUP * (2 * y / BED_W) ** 2


def bed(M):
    """A closed striped shell: top face, underside THICK below, and its rim."""
    nx, ny = 24, len(STRIPES)
    bm = bmesh.new()
    grid = {}
    for side, dz in ((0, 0.0), (1, -THICK)):
        for i in range(nx + 1):
            x = -BAR_X + 2 * BAR_X * i / nx
            for j in range(ny + 1):
                y = -BED_W / 2 + BED_W * j / ny
                grid[side, i, j] = bm.verts.new((x, y, bed_z(x, y) + dz))
    for side in (0, 1):
        for i in range(nx):
            for j in range(ny):
                q = [grid[side, i, j], grid[side, i + 1, j], grid[side, i + 1, j + 1],
                     grid[side, i, j + 1]]
                f = bm.faces.new(q if side == 0 else q[::-1])
                f.material_index = SLOT[j]
    # Rim: the two long edges and the two short ones.
    for i in range(nx):
        for j in (0, ny):
            f = bm.faces.new((grid[0, i, j], grid[1, i, j], grid[1, i + 1, j], grid[0, i + 1, j]))
            f.material_index = SLOT[min(j, ny - 1)]
    for j in range(ny):
        for i in (0, nx):
            f = bm.faces.new((grid[0, i, j], grid[0, i, j + 1], grid[1, i, j + 1], grid[1, i, j]))
            f.material_index = SLOT[j]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = lib._link("BedCloth", bm, None)
    for name in COLOURS:
        ob.data.materials.append(M[name])
    return ob


def bed_parts(M):
    parts = [bed(M)]
    for s in (-1, 1):
        x = s * (BAR_X + 0.03)
        parts.append(lib.cyl(f"Bar{s}", 0.022, BED_W + 0.12, (x, 0, bed_z(BAR_X) - 0.008),
                             M["wood"], r=0.01, seg=1, verts=10, rot=(math.pi / 2, 0, 0)))
        hook = Vector((s * HOOK_X, 0, HOOK_Z - 0.05))
        for y in (-BED_W / 2 - 0.03, 0.0, BED_W / 2 + 0.03):
            end = Vector((x, y, bed_z(BAR_X) - 0.008))
            parts.append(_env.sweep_tube(f"Rope{s}{y:+.2f}", [end, hook], 0.008, M["rope"],
                                         verts=5))
    # The pillow at the -X end, tipped to lie along the rising bed.
    px = PILLOW_X
    slope = math.atan(2 * (BAR_Z - LOW_Z) * px / BAR_X ** 2)   # the bed's pitch there
    pillow = lib.rbox("Pillow", (0.24, 0.42, 0.09), (0, 0, 0.045), M["cream"], r=0.04, seg=3)
    pillow.matrix_basis = (Matrix.Translation((px, 0, bed_z(px) - 0.004)) @
                           Matrix.Rotation(-slope, 4, "Y")) @ pillow.matrix_basis
    parts.append(pillow)
    for o in parts:
        lib.node(o, "Bed", pivot=PIVOT)


def stand(M):
    lib.rbox("Beam", (2 * 1.06, 0.1, 0.1), (0, 0, 0.11), M["wood"], r=0.025, seg=2)
    for s in (-1, 1):
        lib.rbox(f"Foot{s}", (0.1, 0.7, 0.08), (s * 1.0, 0, 0.04), M["dark"], r=0.025, seg=2)
        # Arm raking out and up from the beam's end to the hook.
        a = Vector((s * 0.96, 0, 0.12))
        b = Vector((s * HOOK_X, 0, HOOK_Z + 0.04))
        d = b - a
        lib.rbox(f"Arm{s}", (0.09, 0.09, d.length), tuple((a + b) / 2), M["wood"], r=0.025,
                 seg=2, rot=(0, math.atan2(d.x, d.z), 0))
        lib.sphere(f"Cap{s}", 0.055, tuple(b + d.normalized() * 0.01), M["dark"], u=12, v=6)
        lib.torus(f"Hook{s}", 0.03, 0.009, (s * HOOK_X, 0, HOOK_Z - 0.02), M["hook"], seg=10,
                  ring=5, rot=(math.pi / 2, 0, 0))


def build():
    lib.begin(NAME)
    M = materials()
    stand(M)
    bed_parts(M)


LIE = (0.1, 0, bed_z(0.1) + 0.004 + PELVIS_UP)
HEAD = (PILLOW_X, 0, bed_z(PILLOW_X) + 0.085 + HEAD_UP)
META = dict(
    name="Hammock",
    category="outdoor",
    priority="P1",
    artist="Claude Rodin",
    description="Striped hammock on spreader bars and rope fans, hung from its own wooden stand",
    tags=["garden", "lounge", "lying", "hammock"],
    tintable=[],
    # Someone lying in it, in model space and in the Bed node's frame (origin at its pivot).
    anchors_bl={"lie": LIE, "head": HEAD, "bedPivot": PIVOT,
                "lieBed": tuple(Vector(LIE) - Vector(PIVOT)),
                "headBed": tuple(Vector(HEAD) - Vector(PIVOT))},
    notes="'lie' = the pelvis joint of someone lying along X, 'head' = their head centre on "
          "the pillow (-X). Node 'Bed' (bed, bars, ropes, pillow) pivots at 'bedPivot' on the "
          "hook line: rotate it about X to sway; 'lieBed'/'headBed' are the same points in "
          "its frame, so a body parented to Bed rides along.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
