"""TV stand: low wooden media console with two doors and an open shelf holding a game
console, and a big chunky TV on a pedestal whose screen is the emissive `Screen` material
(planar 0..1 UVs). Front faces -Y; origin at the floor centre."""
import bmesh

import lib

NAME = "tv_stand"
AO_RES = 512
CW, CD, CH = 1.4, 0.44, 0.46
SW, SH = 1.18, 0.66
SZ = CH + 0.12 + SH / 2 + 0.05
META = dict(
    name="TV stand", category="furniture", priority="P1",
    description="Media console with a big TV whose screen the game can drive",
    tags=["lounge", "meeting-room", "screen"], tintable=["Screen", "Accent"],
    anchors_bl={"screenCenter": (0, -0.04, SZ)}, screen=dict(width=SW, height=SH),
)


def materials():
    return dict(
        wood=lib.mat("Wood", lib.P["wood"], rough=0.6),
        doors=lib.mat("Accent", "#E8BE84", rough=0.55),
        bezel=lib.mat("Bezel", lib.P["monitorBezel"], rough=0.5),
        screen=lib.mat("Screen", lib.P["screenOff"], rough=0.4, emit=lib.P["screenGlow"]),
        console=lib.mat("Console", "#FFFFFF", rough=0.5),
        knob=lib.mat("Knob", lib.P["ink"], rough=0.5),
    )


def console(M):
    lib.rbox("TV_Console", (CW, CD, CH - 0.08), (0, 0, 0.08 + (CH - 0.08) / 2), M["wood"],
             r=0.035, seg=3)
    for s in (-1, 1):
        lib.cyl(f"TV_Leg{s}a", 0.03, 0.08, (s * 0.62, -0.16, 0.04), M["wood"], r=0.01, seg=1,
                verts=12)
        lib.cyl(f"TV_Leg{s}b", 0.03, 0.08, (s * 0.62, 0.16, 0.04), M["wood"], r=0.01, seg=1,
                verts=12)
        lib.rbox(f"TV_Door{s}", (0.4, 0.025, 0.3), (s * 0.45, -CD / 2 - 0.005, 0.27),
                 M["doors"], r=0.018, seg=2)
        lib.sphere(f"TV_Knob{s}", 0.018, (s * 0.3, -CD / 2 - 0.022, 0.27), M["knob"], u=10,
                   v=5)
    lib.rbox("TV_Shelf", (0.42, 0.03, 0.26), (0, -CD / 2 + 0.01, 0.27), M["knob"], r=0.01,
             seg=1)
    lib.rbox("TV_GameBox", (0.26, 0.2, 0.06), (0, -0.12, 0.2), M["console"], r=0.02, seg=2)


def tv(M):
    lib.rbox("TV_Foot", (0.42, 0.24, 0.03), (0, 0.02, CH + 0.015), M["bezel"], r=0.012, seg=2)
    lib.rbox("TV_Neck", (0.1, 0.06, 0.16), (0, 0.04, CH + 0.1), M["bezel"], r=0.025, seg=2)
    lib.rbox("TV_Bezel", (SW + 0.08, 0.08, SH + 0.08), (0, 0.0, SZ), M["bezel"], r=0.04, seg=3)
    lib.rbox("TV_Back", (SW * 0.7, 0.08, SH * 0.6), (0, 0.06, SZ), M["bezel"], r=0.04, seg=2)
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in ((-SW / 2, 0, -SH / 2), (SW / 2, 0, -SH / 2),
                                    (SW / 2, 0, SH / 2), (-SW / 2, 0, SH / 2))]
    bm.faces.new(vs)
    lib._link("TV_Screen", bm, M["screen"], loc=(0, -0.041, SZ))


STEPS = [console, tv]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
