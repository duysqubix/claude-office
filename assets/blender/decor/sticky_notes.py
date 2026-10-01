"""Sticky notes: a chunky yellow pad whose top note curls up at the front corner and says
"TODO" with a couple of ticks, plus a loose pink note with a heart doodle. Pad 0.076 m
square; origin at the desk-contact centre of the pad."""
import math

import bmesh

import lib
from decor import _decor as D

NAME = "sticky_notes"
AO_RES = 256
AO_DISTANCE = 0.02
META = dict(
    name="Sticky notes", category="desk-item", priority="P0",
    description="Yellow sticky-note pad with a curled \"TODO\" note and a loose pink note",
    tags=["desk", "clutter", "notes"], tintable=[],
    anchors_bl={"top": (0, 0, 0.0158)},
)
S = 0.076
PAD_H = 0.015


def materials():
    return dict(
        pad=D.mat("Pad", "#FFE066", rough=0.8),
        padEdge=D.mat("PadEdge", "#F5D04E", rough=0.85),
        note=D.mat("Note", "#FFE987", rough=0.8),
        pink=D.mat("NotePink", "#FFB3D1", rough=0.8),
        ink=D.mat("Ink", "ink", rough=0.6),
        tick=D.mat("Tick", "#2FAF6A", rough=0.6),
        heart=D.mat("Doodle", "red", rough=0.6),
    )


def pad(M):
    for i in range(3):
        lib.rbox(f"Pad{i}", (S - 0.0006 * i, S - 0.0006 * i, PAD_H / 3 - 0.0003),
                 (0.0004 * (i % 2), -0.0004 * (i % 2), PAD_H / 6 + i * PAD_H / 3),
                 M["padEdge"] if i % 2 else M["pad"], r=0.0012, seg=1)


def curled_note(M):
    """Top note as a grid whose front-right corner lifts in a soft curl."""
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=10, y_segments=10, size=S / 2)
    diag = (1 / math.sqrt(2), -1 / math.sqrt(2))
    for v in bm.verts:
        t = v.co.x * diag[0] + v.co.y * diag[1]
        if t > 0.012:
            u = t - 0.012
            v.co.z += 9.5 * u * u
            # pull the lifted part back a touch so the curl rolls over itself
            v.co.x -= 2.2 * u * u * diag[0]
            v.co.y -= 2.2 * u * u * diag[1]
    ob = D.bm_object("Note_Top", bm, M["note"], loc=(0, 0, PAD_H + 0.0004))
    m = ob.modifiers.new("Thick", "SOLIDIFY")
    m.thickness = 0.0008
    m.offset = 0
    return ob


def writing(M):
    z = PAD_H + 0.0009
    D.text("Note_TODO", "TODO", 0.0125, M["ink"], loc=(-0.012, 0.022, z), rot=(0, 0, 0),
           depth=0, res=2)
    for i, (w, ticked) in enumerate(((0.03, True), (0.024, True), (0.028, False))):
        y = 0.004 - i * 0.012
        D.prism(f"Note_Box{i}", D.rrect_pts(0.0065, 0.0065, 0.0015), 0.0003, M["ink"],
                loc=(-0.026, y, z), back=False)
        D.prism(f"Note_Line{i}", D.rrect_pts(w, 0.0022, 0.0011), 0.0003, M["ink"],
                loc=(-0.018 + w / 2, y, z), back=False)
        if ticked:
            D.tube(f"Note_Tick{i}", [(-0.0295, y + 0.0005, z + 0.0012), (-0.0265, y - 0.0028, z + 0.0012),
                                     (-0.0215, y + 0.0045, z + 0.0012)], 0.0009, M["tick"],
                   verts=6, caps="round")


def loose_note(M):
    before = D.snapshot()
    lib.rbox("Pink_Note", (0.068, 0.068, 0.0016), (0, 0, 0.0008), M["pink"], r=0.0006, seg=1)
    D.prism("Pink_Heart", D.heart_pts(0.026, 32), 0.0003, M["heart"], loc=(0.004, 0.002, 0.0016),
            back=False)
    D.place(D.since(before), loc=(0.083, 0.03, 0), rot=(0, 0, math.radians(17)))


def build():
    lib.begin(NAME)
    M = materials()
    pad(M)
    curled_note(M)
    writing(M)
    loose_note(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
