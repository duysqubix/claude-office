"""Meeting table: big stadium-shaped table (rounded ends) with a honey-wood top and a white
edge band, standing on two chunky white pedestals with round feet. Seats 6–8. Origin at the
floor centre; long axis along X."""
import math

import lib

NAME = "meeting_table"
AO_RES = 512
TOP = 0.75
L, R = 1.4, 0.58          # straight length between end centres, end radius
META = dict(
    name="Meeting table", category="furniture", priority="P1",
    description="Big rounded meeting table on two chunky pedestals",
    tags=["meeting-room", "table"], tintable=["Accent"],
    anchors_bl={"top": (0, 0, TOP), **{f"seat{i}": p for i, p in enumerate(
        [(-0.6, -0.95, 0), (0, -0.95, 0), (0.6, -0.95, 0), (-0.6, 0.95, 0), (0, 0.95, 0),
         (0.6, 0.95, 0), (-1.5, 0, 0), (1.5, 0, 0)])}},
)


def materials():
    return dict(
        top=lib.mat("Wood", "#E8BE84", rough=0.55),
        edge=lib.mat("Accent", lib.P["deskTop"], rough=0.55),
        base=lib.mat("Base", lib.P["deskTop"], rough=0.6),
    )


def top(M):
    th, eb = 0.06, 0.035
    lib.slab("MT_Top", lib.stadium(L, R, 16), TOP - th, TOP, material=M["top"], r=0.025, seg=2)
    lib.slab("MT_Edge", lib.stadium(L, R + 0.01, 16), TOP - th - eb + 0.01, TOP - th + 0.01,
             material=M["edge"], r=0.015, seg=1)


def base(M):
    for s in (-1, 1):
        x = s * 0.55
        lib.rbox(f"MT_Column{s}", (0.2, 0.36, TOP - 0.12), (x, 0, (TOP - 0.12) / 2 + 0.04),
                 M["base"], r=0.05, seg=3)
        lib.cyl(f"MT_Foot{s}", 0.26, 0.05, (x, 0, 0.025), M["base"], r=0.02, seg=2, verts=28)


STEPS = [top, base]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
