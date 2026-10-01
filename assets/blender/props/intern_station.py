"""Intern station: one intern's spot on the bench. A chunky little hand-me-down CRT-style
monitor in old beige with the emissive `Screen` (planar 0..1 UVs), a sticky note on its
bezel, and a small beige keyboard. Origin at the desk surface, centre of the spot; the
screen faces -Y."""
import math

import bmesh

import lib

NAME = "intern_station"
AO_RES = 256
SW, SH, SZ = 0.25, 0.18, 0.2
META = dict(
    name="Intern station", category="desk-item", priority="P0",
    description="Hand-me-down little monitor and keyboard for one intern",
    tags=["interns", "desk", "computer", "screen"], tintable=["Screen"],
    anchors_bl={"screenCenter": (0, -0.012, SZ), "keyboard": (0, -0.17, 0)},
    screen=dict(width=SW, height=SH),
)


def materials():
    return dict(
        beige=lib.mat("Beige", "#E8DFC8", rough=0.55),
        dark=lib.mat("Vent", "#A89F8A", rough=0.7),
        screen=lib.mat("Screen", lib.P["screenOff"], rough=0.4, emit=lib.P["screenGlow"]),
        keys=lib.mat("Keys", "#F4EEDD", rough=0.55),
        note=lib.mat("Note", "#FF9DCB", rough=0.7),
    )


def monitor(M):
    lib.rbox("IS_Foot", (0.18, 0.16, 0.03), (0, 0.1, 0.015), M["beige"], r=0.012, seg=2)
    lib.rbox("IS_Bezel", (0.33, 0.06, 0.27), (0, 0.02, SZ), M["beige"], r=0.035, seg=3)
    lib.rbox("IS_Tube", (0.26, 0.22, 0.21), (0, 0.15, SZ - 0.005), M["beige"], r=0.06, seg=2)
    for k in range(3):
        lib.rbox(f"IS_Vent{k}", (0.006, 0.12, 0.012), (0.131, 0.15, SZ + 0.05 - k * 0.03),
                 M["dark"], r=0.003, seg=1)
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in ((-SW / 2, 0, -SH / 2), (SW / 2, 0, -SH / 2),
                                    (SW / 2, 0, SH / 2), (-SW / 2, 0, SH / 2))]
    bm.faces.new(vs)
    lib._link("IS_Screen", bm, M["screen"], loc=(0, -0.012, SZ))
    lib.rbox("IS_Note", (0.05, 0.004, 0.05), (0.15, -0.012, SZ + 0.1), M["note"], r=0.0015,
             seg=1, rot=(0, math.radians(-10), 0))


def keyboard(M):
    lib.rbox("IS_Kb", (0.28, 0.1, 0.025), (0, -0.17, 0.0125), M["beige"], r=0.01, seg=2)
    for r in range(2):
        for i in range(7):
            lib.rbox(f"IS_Key{r}_{i}", (0.028, 0.028, 0.016),
                     ((i - 3) * 0.035, -0.155 - r * 0.035, 0.032), M["keys"], r=0.007, seg=1)


STEPS = [monitor, keyboard]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
