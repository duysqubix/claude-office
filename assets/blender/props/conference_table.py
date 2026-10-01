"""Conference table: big rounded-rectangle table for 8 with a honey-wood top, a white edge
band, a glowing cable hub in the middle and two chunky pedestal bases. Long axis along X;
origin at the floor centre."""
import lib

NAME = "conference_table"
AO_RES = 512
L, W, TOP = 3.0, 1.3, 0.75
SEATS = [(-0.9, -0.95), (0, -0.95), (0.9, -0.95), (-0.9, 0.95), (0, 0.95), (0.9, 0.95),
         (-1.85, 0), (1.85, 0)]
META = dict(
    name="Conference table", category="furniture", priority="P0",
    description="Rounded conference table for eight with a glowing cable hub",
    tags=["team-room", "meeting-room", "table"], tintable=["Accent"],
    anchors_bl={"top": (0, 0, TOP), **{f"seat{i}": (x, y, 0) for i, (x, y) in enumerate(SEATS)}},
)


def materials():
    return dict(
        top=lib.mat("Wood", "#E8BE84", rough=0.55),
        edge=lib.mat("Accent", lib.P["deskTop"], rough=0.55),
        base=lib.mat("Base", lib.P["deskTop"], rough=0.6),
        hub=lib.mat("Hub", lib.P["chairBase"], rough=0.5),
        glow=lib.mat("Glow", lib.P["screenGlow"], rough=0.3, emit=lib.P["screenGlow"],
                     strength=1.8),
    )


def top(M):
    th, eb = 0.065, 0.035
    lib.slab("CT_Top", lib.rounded_rect(L, W, 0.5, 8), TOP - th, TOP, material=M["top"],
             r=0.028, seg=2)
    lib.slab("CT_Edge", lib.rounded_rect(L + 0.02, W + 0.02, 0.51, 8), TOP - th - eb + 0.01,
             TOP - th + 0.01, material=M["edge"], r=0.015, seg=1)
    lib.cyl("CT_Hub", 0.11, 0.02, (0, 0, TOP + 0.008), M["hub"], r=0.008, seg=1, verts=28)
    lib.torus("CT_HubRing", 0.1, 0.008, (0, 0, TOP + 0.018), M["glow"], seg=28, ring=6)


def base(M):
    for s in (-1, 1):
        x = s * 0.85
        lib.rbox(f"CT_Column{s}", (0.24, 0.42, TOP - 0.13), (x, 0, (TOP - 0.13) / 2 + 0.04),
                 M["base"], r=0.06, seg=3)
        lib.slab(f"CT_Foot{s}", lib.stadium(0.4, 0.2, 8), 0.0, 0.05, (x, 0, 0), M["base"],
                 r=0.02, seg=2, rot=(0, 0, 1.5708))


STEPS = [top, base]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
