"""Lanyard badge: an `Accent` cord looping round the neck with two strands meeting at a clip,
and an ID card in a clear-edged holder hanging on the chest at the tee's chestBadge anchor.
The card face is `Label` (planar 0..1 UVs, no AO) so the game prints the name. Pivot at the
torso origin (pelvis)."""
import bmesh
from mathutils import Vector

from characters import _body as B
from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "lanyard_badge"
BADGE = kit.bl(0.0, 0.085, 0.216)              # three.js chestBadge → Blender
CW, CH = 0.075, 0.095
META = mo.meta("Lanyard badge", "character-accessory", "Neck lanyard with a printable ID badge",
               ["lanyard", "badge", "office", "accessory"], tintable=("Accent", "Label"),
               priority="P0", anchors_bl={"badge": tuple(BADGE)},
               label=dict(width=CW - 0.012, height=CH * 0.62))


def build():
    lib.begin(NAME)
    cord = kit.m_accent("#FF5A5F", rough=0.7)
    holder = lib.mat("Holder", "#E6F0FA", rough=0.25)
    clip = lib.mat("Clip", lib.P["metal"], rough=0.3, metal=0.4)
    stripe = kit.m_accent("#FF5A5F", rough=0.6)
    label = lib.mat("Label", "#FFFFFF", rough=0.6)
    label["no_ao"] = True
    ring = B.neck_ring(out=0.012)
    back = [p for p in ring if p.y > -0.02]
    back.sort(key=lambda p: p.x)
    p_bad, n_bad = B.torso_surface(0.0, BADGE.z + CH / 2 + 0.03)
    top_clip = p_bad + n_bad * 0.012
    for s in (1, -1):
        side = [p for p in ring if s * p.x > 0.04 and p.y < 0.0]
        start = min(side, key=lambda p: p.y)
        mid_y = (start.z + top_clip.z) / 2
        mp, mn = B.torso_surface(s * 0.05, mid_y)
        kit.tube(f"Strand{s}", kit.catmull([start, mp + mn * 0.012, top_clip + Vector((s * 0.008, 0, 0))],
                                           samples=10), 0.006, cord, ring=8)
    back_pts = [p for p in ring if p.y > -0.06]
    back_pts.sort(key=lambda p: -p.x)
    kit.tube("Loop", back_pts, 0.006, cord, ring=8)
    lib.rbox("Clip", (0.02, 0.012, 0.025), tuple(top_clip), clip, r=0.005, seg=1)
    # Card hangs a touch off the chest, facing forward.
    p, n = B.torso_surface(0.0, BADGE.z)
    c = p + n * 0.02
    lib.rbox("Holder", (CW + 0.01, 0.006, CH + 0.01), tuple(c), holder, r=0.006, seg=1)
    lib.rbox("Stripe", (CW, 0.004, CH * 0.22), tuple(c + Vector((0, -0.0035, CH * 0.37))),
             stripe, r=0.002, seg=1)
    bm = bmesh.new()
    w, h = CW - 0.012, CH * 0.62
    vs = [bm.verts.new(v) for v in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2),
                                    (-w / 2, 0, h / 2))]
    bm.faces.new(vs)
    lib._link("Card", bm, label, loc=tuple(c + Vector((0, -0.0042, -CH * 0.1))))


def finalize(name):
    return mo.finalize_torso_item(name, META, ao_distance=0.03)
