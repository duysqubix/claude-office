"""Aquarium: a glass tank (alpha-blended `Glass` and `Water`) on a wooden cabinet, with gravel,
chunky water plants, a little castle, a glowing lid light, and three cartoon fish as nodes
`Fish1`..`Fish3` (pivot at each fish's centre, nose pointing -X) so the game can swim them.
Front faces -Y; origin at the floor centre."""
import math

import lib

NAME = "aquarium"
AO_RES = 512
TW, TD, TH = 1.0, 0.44, 0.56
BASE = 0.76
FISH = [("Fish1", "#FF9F45", (-0.2, -0.02, BASE + 0.3), 1.0),
        ("Fish2", "#4D96FF", (0.18, 0.05, BASE + 0.4), 0.85),
        ("Fish3", "#FFD93D", (0.05, -0.06, BASE + 0.2), 0.75)]
META = dict(
    name="Aquarium", category="furniture", priority="P1",
    description="Fish tank on a cabinet with three swimmable cartoon fish",
    tags=["team-room", "lounge", "decor"], tintable=[],
    anchors_bl={"tankCenter": (0, 0, BASE + TH / 2)},
    nodes={f[0]: "pivot at the fish centre; nose points -X (three)" for f in FISH},
)


def materials():
    M = dict(
        cab=lib.mat("Cabinet", lib.P["wood"], rough=0.6),
        trim=lib.mat("Trim", "#2B2D42", rough=0.5),
        glass=lib.mat("Glass", "#E6F7FF", rough=0.05, alpha=0.18),
        water=lib.mat("Water", "#5CC8FF", rough=0.1, alpha=0.28),
        gravel=lib.mat("Gravel", "#E8BE84", rough=0.9),
        plant=lib.mat("Plant", "#46B35A", rough=0.6),
        plant2=lib.mat("Plant2", "#7BD66B", rough=0.6),
        castle=lib.mat("Castle", "#C8D0DC", rough=0.6),
        light=lib.mat("Light", "#E0F4FF", rough=0.4, emit="#BFE9FF", strength=1.5),
        eye=lib.mat("Eye", "#FFFFFF", rough=0.4),
        pupil=lib.mat("Pupil", lib.P["eye"], rough=0.4),
    )
    for name, col, _, _ in FISH:
        M[name] = lib.mat(name, col, rough=0.45)
    return M


def cabinet(M):
    lib.rbox("AQ_Cabinet", (TW + 0.06, TD + 0.06, BASE - 0.02), (0, 0, (BASE - 0.02) / 2),
             M["cab"], r=0.035, seg=3)
    for s in (-1, 1):
        lib.rbox(f"AQ_Door{s}", (TW / 2 - 0.06, 0.02, BASE - 0.2), (s * TW / 4, -TD / 2 - 0.03,
                 BASE / 2), M["cab"], r=0.018, seg=2)
        lib.sphere(f"AQ_Knob{s}", 0.018, (s * 0.06, -TD / 2 - 0.045, BASE / 2), M["trim"], u=10,
                   v=5)


def tank(M):
    lib.rbox("AQ_BaseTrim", (TW + 0.02, TD + 0.02, 0.05), (0, 0, BASE + 0.005), M["trim"],
             r=0.015, seg=1)
    lib.rbox("AQ_Glass", (TW, TD, TH), (0, 0, BASE + TH / 2), M["glass"], r=0.02, seg=1)
    lib.rbox("AQ_Water", (TW - 0.03, TD - 0.03, TH - 0.08), (0, 0, BASE + (TH - 0.08) / 2 + 0.01),
             M["water"], r=0.012, seg=1)
    lib.rbox("AQ_Lid", (TW + 0.03, TD + 0.03, 0.05), (0, 0, BASE + TH + 0.02), M["trim"],
             r=0.02, seg=2)
    lib.rbox("AQ_Light", (TW - 0.2, 0.06, 0.01), (0, 0, BASE + TH - 0.006), M["light"],
             r=0.003, seg=1)


def scenery(M):
    lib.rbox("AQ_Gravel", (TW - 0.04, TD - 0.04, 0.05), (0, 0, BASE + 0.045), M["gravel"],
             r=0.02, seg=1)
    for i, (x, h, mat) in enumerate(((-0.4, 0.34, M["plant"]), (-0.33, 0.24, M["plant2"]),
                                     (0.38, 0.4, M["plant"]), (0.3, 0.26, M["plant2"]))):
        lib.sphere(f"AQ_Weed{i}", 1.0, (x, 0.1, BASE + 0.05 + h / 2), mat,
                   scale=(0.035, 0.02, h / 2), u=10, v=6, rot=(0, math.radians(8 - i * 5), 0))
    lib.rbox("AQ_Castle", (0.12, 0.1, 0.14), (0.15, 0.1, BASE + 0.14), M["castle"], r=0.012,
             seg=1)
    for s in (-1, 1):
        lib.cyl(f"AQ_Tower{s}", 0.03, 0.2, (0.15 + s * 0.065, 0.1, BASE + 0.17), M["castle"],
                r=0.008, seg=1, verts=12)
        lib.cyl(f"AQ_Roof{s}", 0.036, 0.06, (0.15 + s * 0.065, 0.1, BASE + 0.3), M["Fish1"],
                radius2=0.0, r=0, verts=12)


def fish(M):
    for name, _, c, k in FISH:
        x, y, z = c
        parts = [
            lib.sphere(f"{name}_Body", 0.05 * k, c, M[name], scale=(1.3, 0.7, 1.0), u=16, v=8),
            lib.slab(f"{name}_Tail", [(0, 0), (0.06 * k, 0.035 * k), (0.06 * k, -0.035 * k)],
                     -0.008, 0.008, (x + 0.05 * k, y, z), M[name], r=0.004, seg=1,
                     rot=(math.pi / 2, 0, 0)),
            lib.sphere(f"{name}_Eye", 0.014 * k, (x - 0.04 * k, y - 0.03 * k, z + 0.012 * k),
                       M["eye"], u=8, v=4),
            lib.sphere(f"{name}_Pupil", 0.007 * k, (x - 0.046 * k, y - 0.04 * k,
                       z + 0.012 * k), M["pupil"], u=6, v=3),
        ]
        for p in parts:
            lib.node(p, name, pivot=c)


STEPS = [cabinet, tank, scenery, fish]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
