"""Paper plane: a chunky folded paper dart (two wings in a shallow V over a keel) with a blue
stripe along each wing. Nose points -Y. Origin at the bottom centre (keel on the floor)."""
import bmesh

import lib

NAME = "paper_plane"
AO_RES = 256
L, SPAN = 0.32, 0.22
LIFT = 0.04          # keel rests on the floor
META = dict(
    name="Paper plane", category="decor", priority="P2", artist="Claude Monet",
    description="Chunky folded paper plane",
    tags=["party", "fun", "throwable"], tintable=["Accent"],
    anchors_bl={"nose": (0, -L / 2, 0.06)},
)


def materials():
    return dict(paper=lib.mat("Paper", "#FFFFFF", rough=0.8),
                stripe=lib.mat("Accent", "#4D96FF", rough=0.6))


def tri(name, pts, mat, thick=0.004):
    """A thin triangle plate from three 3D points, extruded along its normal."""
    from mathutils import Vector
    a, b, c = (Vector(p) + Vector((0, 0, LIFT)) for p in pts)
    n = (b - a).cross(c - a).normalized() * thick / 2
    bm = bmesh.new()
    top = [bm.verts.new(p + n) for p in (a, b, c)]
    bot = [bm.verts.new(p - n) for p in (a, b, c)]
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((top[i], bot[i], bot[j], top[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lib._link(name, bm, mat, smooth=False)


def parts(M):
    nose = (0, -L / 2, 0.02)
    for s in (1, -1):
        tag = "L" if s > 0 else "R"
        tri(f"PP_Wing{tag}", [nose, (s * SPAN / 2, L / 2, 0.05), (0, L / 2, 0.02)], M["paper"])
        tri(f"PP_Keel{tag}", [nose, (0, L / 2, 0.02), (s * 0.006, L / 2, -0.04)], M["paper"])
        tri(f"PP_Stripe{tag}", [(s * 0.02, -L / 2 + 0.07, 0.025),
                                (s * SPAN / 2 * 0.86, L / 2 - 0.005, 0.048),
                                (s * SPAN / 2 * 0.74, L / 2 - 0.005, 0.045)], M["stripe"],
            thick=0.006)


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
