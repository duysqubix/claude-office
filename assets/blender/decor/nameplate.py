"""Nameplate: chunky rounded wedge for the front of a desk, readable from both sides. The
body is tintable `Accent`; each sloped face carries a paper `Label` panel (planar 0..1 UVs,
reading left-to-right from its own side, no AO) where the game draws the name. Label aspect
2.9:1 (the 256×88 canvas). 0.34 m long, 0.135 m tall; origin at the desk-contact centre;
the main face looks -Y."""
import math

import bmesh
from mathutils import Vector

import lib
from decor import _decor as D

NAME = "nameplate"
AO_RES = 256
AO_DISTANCE = 0.04
LEN, BASE, H = 0.34, 0.09, 0.135
LABEL_W, LABEL_H = 0.30, 0.1035
META = dict(
    name="Nameplate", category="desk-item", priority="P0",
    description="Chunky two-sided wedge nameplate; the game paints the name on its Label faces",
    tags=["desk", "name", "label"], tintable=["Accent", "Label"],
    anchors_bl={"labelFront": (0, -0.0225, 0.0675), "labelBack": (0, 0.0225, 0.0675)},
    label=dict(width=LABEL_W, height=LABEL_H, canvas=[256, 88], sides=2),
)


def materials():
    return dict(
        body=D.mat("Accent", "sky", rough=0.55),
        label=D.label_mat("Label"),
    )


def wedge(M):
    tri = D.rounded_pts([(-BASE / 2, 0.0), (BASE / 2, 0.0), (0.0, H)], 0.006, steps=5)
    ob = D.prism("Wedge", tri, LEN, M["body"], loc=(-LEN / 2, 0, 0),
                 rot=(math.pi / 2, 0, math.pi / 2), r=0.007, seg=3, angle=30)
    return ob


def labels(M):
    # Unit vectors along each sloped face (bottom → top) and out of it.
    for side, sy in (("Front", -1), ("Back", 1)):
        along = Vector((0, -sy * BASE / 2, H)).normalized()
        out = Vector((0, sy * H, BASE / 2)).normalized()
        # Centred on the straight part of the slope (the fillets eat more near the apex).
        mid = Vector((0, sy * BASE / 4, H / 2)) + out * 0.0012 - along * 0.005
        bm = bmesh.new()
        hx, hz = LABEL_W / 2, LABEL_H / 2
        corners = [mid + Vector((x, 0, 0)) + along * z for x, z in
                   ((-hx, -hz), (hx, -hz), (hx, hz), (-hx, hz))]
        vs = [bm.verts.new(c) for c in corners]
        f = bm.faces.new(vs)
        f.normal_update()
        if f.normal.dot(out) < 0:
            f.normal_flip()
        D.bm_object(f"Label{side}", bm, M["label"], sharp=30)


def build():
    lib.begin(NAME)
    M = materials()
    wedge(M)
    labels(M)


def sample_name():
    """Preview only: what the game might paint on the front label."""
    slope = math.atan2(BASE / 2, H)
    along = Vector((0, BASE / 2, H)).normalized()
    out = Vector((0, -H, BASE / 2)).normalized()
    mid = Vector((0, -BASE / 4, H / 2)) + out * 0.002 - along * 0.005
    ink = D.mat("_PreviewInk", "ink", rough=0.6)
    D.text("_Preview_Name", "Claudette", 0.05, ink, loc=tuple(mid), depth=0, res=3,
           rot=(math.pi / 2 - slope, 0, 0))
    bar = D.face("_Preview_Bar", D.rrect_pts(0.012, LABEL_H - 0.012, 0.005), D.mat("_PreviewBar", "sky"),
                 loc=tuple(mid + Vector((-LABEL_W / 2 + 0.014, 0, 0))), rot=(math.pi / 2 - slope, 0, 0))
    return bar


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META, planar=("Label",), preview=sample_name)
