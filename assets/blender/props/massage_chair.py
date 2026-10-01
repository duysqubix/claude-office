"""Massage chair: a big puffy recliner. Chunky base, marshmallow seat, tall padded back with a
headrest, a sloped calf rest, fat arm pods with a little glowing remote. Cushions in `Seat`.
Front faces -Y; origin at the floor centre."""
import math

import lib

NAME = "massage_chair"
AO_RES = 512
META = dict(
    name="Massage chair", category="furniture", priority="P2",
    description="Puffy reclining massage chair with arm pods and a glowing remote",
    tags=["lounge", "fun", "seating"], tintable=["Seat"],
    anchors_bl={"seat": (0, 0, 0.55)},
)


def materials():
    return dict(
        seat=lib.mat("Seat", "#4B3F72", rough=0.75),
        shell=lib.mat("Shell", "#F4F7FB", rough=0.45),
        base=lib.mat("Base", lib.P["chairBase"], rough=0.6),
        glow=lib.mat("Glow", lib.P["stateWorking"], rough=0.3, emit=lib.P["stateWorking"],
                     strength=1.6),
    )


def base(M):
    lib.rbox("MS_Base", (0.7, 0.9, 0.3), (0, 0.05, 0.17), M["shell"], r=0.08, seg=3)
    lib.rbox("MS_Kick", (0.6, 0.8, 0.05), (0, 0.05, 0.025), M["base"], r=0.02, seg=1)


def cushions(M):
    s = lib.rbox("MS_Seat", (0.6, 0.62, 0.18), (0, 0.0, 0.42), M["seat"], r=0.08, seg=1)
    lib.subsurf(s, 1)
    recline = math.radians(-24)
    b = lib.rbox("MS_Back", (0.62, 0.22, 0.86), (0, 0.42, 0.88), M["seat"], r=0.1, seg=1,
                 rot=(recline, 0, 0))
    lib.subsurf(b, 1)
    h = lib.rbox("MS_Head", (0.4, 0.18, 0.2), (0, 0.55, 1.33), M["seat"], r=0.08, seg=1,
                 rot=(recline, 0, 0))
    lib.subsurf(h, 1)
    c = lib.rbox("MS_Calf", (0.52, 0.18, 0.5), (0, -0.42, 0.28), M["seat"], r=0.08, seg=1,
                 rot=(math.radians(-35), 0, 0))
    lib.subsurf(c, 1)
    lib.rbox("MS_BackShell", (0.7, 0.1, 0.9), (0, 0.55, 0.86), M["shell"], r=0.045, seg=2,
             rot=(recline, 0, 0))


def arms(M):
    for s in (-1, 1):
        a = lib.rbox(f"MS_Arm{s}", (0.18, 0.7, 0.36), (s * 0.4, 0.05, 0.5), M["shell"], r=0.08,
                     seg=1)
        lib.subsurf(a, 1)
        p = lib.rbox(f"MS_ArmPad{s}", (0.14, 0.56, 0.06), (s * 0.4, 0.03, 0.69), M["seat"],
                     r=0.028, seg=1)
        lib.subsurf(p, 1)
    lib.rbox("MS_Remote", (0.06, 0.12, 0.03), (0.4, -0.22, 0.73), M["base"], r=0.012, seg=1)
    lib.sphere("MS_RemoteLight", 0.012, (0.4, -0.25, 0.75), M["glow"], u=8, v=4)


STEPS = [base, cushions, arms]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
