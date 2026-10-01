"""Intern bench: one 1.6 m module of the long, slightly scrappy intern desk (two stations).
A plywood top on wonky sawhorse trestles (one propped up on a stack of books), a tintable
`Accent` cable tray along the back with drooping cables, duct tape over a dent and a sticky
note on the edge. The top's ends are square so modules chain end to end along X.
Sized for 0.7-scale interns; front faces -Y; origin at the floor centre."""
import math

import lib

NAME = "intern_bench"
AO_RES = 512
L, D, TOP = 1.6, 0.62, 0.56
META = dict(
    name="Intern bench", category="furniture", priority="P0",
    description="Scrappy chainable intern desk module with two stations",
    tags=["interns", "desk", "workstation", "modular"], tintable=["Accent"],
    anchors_bl={"top": (0, 0, TOP), "station0": (-0.4, 0.02, TOP), "station1": (0.4, 0.02, TOP),
                "stool0": (-0.4, -0.5, 0), "stool1": (0.4, -0.5, 0)},
    module=dict(length=L, axis="x", chain="place modules every 1.6 m along X"),
)


def materials():
    return dict(
        ply=lib.mat("Plywood", "#E8C99A", rough=0.7),
        edge=lib.mat("PlyEdge", "#C9A06A", rough=0.7),
        horse=lib.mat("Sawhorse", "#F2B544", rough=0.6),
        tray=lib.mat("Accent", lib.P["deskAccents"][0], rough=0.6),
        cable=lib.mat("Cable", lib.P["ink"], rough=0.6),
        tape=lib.mat("Tape", "#B8BEC8", rough=0.5),
        note=lib.mat("Note", "#FFE066", rough=0.7),
        books=[lib.mat("BookA", "#4D96FF", rough=0.6), lib.mat("BookB", "#FF6B6B", rough=0.6),
               lib.mat("BookC", "#6BCB77", rough=0.6)],
    )


def top(M):
    # Square ends (bevel only along the long edges) so neighbours butt together cleanly.
    lib.rbox("IB_Top", (L, D, 0.045), (0, 0, TOP - 0.0225), M["ply"], r=0.0, seg=1)
    for s in (-1, 1):
        lib.cyl(f"IB_Lip{s}", 0.0235, L, (0, s * D / 2, TOP - 0.0225), M["edge"], r=0,
                verts=12, rot=(0, math.pi / 2, 0))
    lib.rbox("IB_Tape", (0.06, 0.2, 0.004), (0.12, -0.12, TOP + 0.002), M["tape"], r=0.0015,
             seg=1, rot=(0, 0, math.radians(20)))
    lib.rbox("IB_Note", (0.07, 0.004, 0.07), (-0.62, -D / 2 - 0.026, TOP - 0.04), M["note"],
             r=0.0015, seg=1, rot=(0, math.radians(12), 0))


def trestles(M):
    for i, x in enumerate((-0.62, 0.62)):
        lift = 0.06 if i == 1 else 0.0          # the right one stands on books
        h = TOP - 0.045 - lift
        lib.rbox(f"IB_Beam{i}", (0.07, D - 0.06, 0.05), (x, 0, h - 0.025 + lift), M["horse"],
                 r=0.02, seg=2)
        for s in (-1, 1):
            splay = math.radians(12)
            lib.rbox(f"IB_Leg{i}{s}", (0.05, 0.05, h - 0.02), (x, s * 0.2, (h - 0.02) / 2 + lift),
                     M["horse"], r=0.018, seg=1, rot=(s * splay, 0, 0))
        if lift:
            for k in range(2):
                lib.rbox(f"IB_Book{k}", (0.2 - k * 0.02, D - 0.1, 0.03), (x + k * 0.01, 0,
                         0.015 + k * 0.03), M["books"][k], r=0.008, seg=1,
                         rot=(0, 0, math.radians(4 - 7 * k)))


def cables(M):
    lib.rbox("IB_Tray", (L - 0.1, 0.1, 0.06), (0, D / 2 - 0.08, TOP - 0.09), M["tray"], r=0.02,
             seg=2)
    for i, (x, r) in enumerate(((-0.35, 0.09), (0.05, 0.12), (0.45, 0.08))):
        lib.torus(f"IB_Cable{i}", r, 0.008, (x, D / 2 - 0.08, TOP - 0.12), M["cable"], seg=12,
                  ring=6, sweep=math.pi, rot=(math.pi / 2, math.pi, 0))


STEPS = [top, trestles, cables]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
