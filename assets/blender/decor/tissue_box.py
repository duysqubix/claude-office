"""Tissue box: a soft cube box in tintable `Accent` (pink by default) with cream polka dots,
an oval slot on top and a fluffy tissue puffing out of it (two crossing wavy sheets).
0.12 m cube, 0.21 m tall with the tissue; origin at the desk-contact centre."""
import math

import bmesh

import lib
from decor import _decor as D

NAME = "tissue_box"
AO_RES = 256
AO_DISTANCE = 0.035
S, H = 0.12, 0.13
META = dict(
    name="Tissue box", category="desk-item", priority="P1",
    description="Polka-dot cube tissue box with a fluffy tissue puffing out of the top",
    tags=["desk", "clutter"], tintable=["Accent"],
    anchors_bl={"tissueTop": (0, 0, 0.205)},
)
DOTS = [(-0.03, 0.035), (0.03, 0.035), (0.0, 0.068), (-0.03, 0.101), (0.03, 0.101)]


def materials():
    return dict(
        box=D.mat("Accent", "pink", rough=0.55),
        dot=D.mat("Dots", "cream", rough=0.55),
        slot=D.mat("Slot", "#B9477D", rough=0.7),
        tissue=D.mat("Tissue", "paper", rough=0.8),
    )


def box(M):
    lib.rbox("Box", (S, S, H), (0, 0, H / 2), M["box"], r=0.013, seg=3)
    D.face("Slot", D.rrect_pts(0.078, 0.034, 0.017, steps=5), M["slot"], loc=(0, 0, H + 0.0004))
    out = S / 2 + 0.0004
    sides = (((0, -1), D.FRONT), ((0, 1), D.BACK), ((1, 0), (math.pi / 2, 0, math.pi / 2)),
             ((-1, 0), (math.pi / 2, 0, -math.pi / 2)))
    for k, ((nx, ny), rot) in enumerate(sides):
        for i, (u, z) in enumerate(DOTS):
            loc = (nx * out, u, z) if nx else (u, ny * out, z)
            D.face(f"Dot{k}_{i}", D.circle_pts(0.0105, 14), M["dot"], loc=loc, rot=rot)


def sheet(name, M, yaw, lean, scale=1.0):
    """A tissue sheet puffing up out of the slot: pinched at the bottom, soft rounded top,
    wavy folds that grow towards the top."""
    bm = bmesh.new()
    nx, nz = 12, 9
    rows = []
    for j in range(nz + 1):
        t = j / nz
        row = []
        for i in range(nx + 1):
            u = i / nx * 2 - 1
            w = (0.02 + 0.03 * math.sin(min(1.0, t * 1.5) * math.pi / 2)) * scale
            z = t * 0.088 * scale * (1 - 0.42 * u * u * t ** 1.4)
            y = 0.0095 * math.sin(u * math.pi * 1.5 + 0.6) * (0.2 + 0.8 * t) + lean * t * t
            row.append(bm.verts.new((u * w, y, z)))
        rows.append(row)
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    ob = D.bm_object(name, bm, M["tissue"], loc=(0, 0, H - 0.012), rot=(0, 0, yaw))
    m = ob.modifiers.new("Thick", "SOLIDIFY")
    m.thickness = 0.0018
    m.offset = 0
    return ob


def build():
    lib.begin(NAME)
    M = materials()
    box(M)
    sheet("Tissue_A", M, 0.0, 0.008)
    sheet("Tissue_B", M, math.radians(58), -0.006, scale=0.86)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
