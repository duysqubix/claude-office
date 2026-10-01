"""Recycling bin: chunky rounded green bin with a lid and a paper slot, a white band and three
white chasing arrows on the front. Origin at the floor centre; front faces -Y."""
import math

import lib

NAME = "recycling_bin"
AO_RES = 256
META = dict(
    name="Recycling bin", category="furniture", priority="P1",
    description="Green recycling bin with lid slot and chasing-arrow badge",
    tags=["office", "clutter"], tintable=["Accent"], anchors_bl={"slot": (0, -0.05, 0.62)},
)


def materials():
    return dict(
        bin=lib.mat("Accent", "#6BCB77", rough=0.55),
        lid=lib.mat("Lid", "#4FAE5D", rough=0.5),
        white=lib.mat("Badge", "#FFFFFF", rough=0.5),
        slot=lib.mat("Slot", "#2B2D42", rough=0.8),
    )


def parts(M):
    lib.rbox("RB_Body", (0.36, 0.36, 0.56), (0, 0, 0.28), M["bin"], r=0.05, seg=3)
    lib.rbox("RB_Lid", (0.39, 0.39, 0.06), (0, 0, 0.59), M["lid"], r=0.025, seg=2)
    lib.rbox("RB_Slot", (0.22, 0.05, 0.01), (0, -0.05, 0.62), M["slot"], r=0.004, seg=1)
    # Band follows the body's rounded corners (a thin rbox can't: its bevel is capped).
    lib.slab("RB_Band", lib.rounded_rect(0.366, 0.366, 0.052, 6), 0.4525, 0.4875,
             material=M["white"], r=0.008, seg=1)
    # Three chasing arrows on a triangle.
    cz, cy, rr = 0.26, -0.185, 0.06
    for i in range(3):
        a = math.radians(90 + i * 120)
        x, z = rr * math.cos(a), rr * math.sin(a)
        lib.rbox(f"RB_Arrow{i}", (0.07, 0.01, 0.018), (x * 0.6 + 0, cy, cz + z * 0.6),
                 M["white"], r=0.006, seg=1, rot=(0, -(a + math.pi / 2), 0))
        lib.sphere(f"RB_Head{i}", 0.018, (x, cy, cz + z), M["white"], scale=(1, 0.4, 1),
                   u=8, v=4)


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
