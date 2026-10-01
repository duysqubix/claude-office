"""Wall screen: the Team Room's big live display (3.2 x 1.8 m picture). Chunky rounded bezel,
a flat `Screen` quad with planar 0..1 UVs (the world draws the stats canvas onto it), a
soundbar underneath, a glowing power LED and a little logo pill. Origin at the wall-contact
point (back centre); the picture is centred on the origin and faces -Y."""
import bmesh

import lib

NAME = "wall_screen"
AO_RES = 512
SW, SH = 3.2, 1.8
B, DEPTH = 0.09, 0.12
META = dict(
    name="Wall screen", category="furniture", priority="P0",
    description="Huge Team Room wall display for live plan usage and team stats",
    tags=["team-room", "wall", "screen"], tintable=["Screen"],
    anchors_bl={"screenCenter": (0, -DEPTH - 0.002, 0)}, screen=dict(width=SW, height=SH),
    mount="wall: origin is the back centre; picture centre at the origin",
)


def materials():
    return dict(
        bezel=lib.mat("Bezel", lib.P["monitorBezel"], rough=0.5),
        screen=lib.mat("Screen", lib.P["screenOff"], rough=0.4, emit=lib.P["screenGlow"]),
        bar=lib.mat("Soundbar", "#3B4252", rough=0.55),
        grille=lib.mat("Grille", "#22272F", rough=0.8),
        led=lib.mat("Led", lib.P["stateWorking"], rough=0.3, emit=lib.P["stateWorking"],
                    strength=2.5),
        logo=lib.mat("Logo", lib.P["claude"], rough=0.45),
    )


def bezel(M):
    lib.rbox("WS_Bezel", (SW + 2 * B, DEPTH, SH + 2 * B), (0, -DEPTH / 2, 0), M["bezel"], r=0.05,
             seg=3)
    lib.rbox("WS_Mount", (1.2, 0.04, 0.8), (0, -0.02, 0), M["bar"], r=0.015, seg=1)
    lib.sphere("WS_Led", 0.012, (SW / 2 + B - 0.06, -DEPTH - 0.004, -SH / 2 - B / 2), M["led"],
               scale=(1, 0.5, 1), u=8, v=4)
    lib.rbox("WS_Logo", (0.16, 0.01, 0.035), (0, -DEPTH - 0.002, -SH / 2 - B / 2), M["logo"],
             r=0.012, seg=1)


def picture(M):
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in ((-SW / 2, 0, -SH / 2), (SW / 2, 0, -SH / 2),
                                    (SW / 2, 0, SH / 2), (-SW / 2, 0, SH / 2))]
    bm.faces.new(vs)
    lib._link("WS_Screen", bm, M["screen"], loc=(0, -DEPTH - 0.002, 0))


def soundbar(M):
    z = -SH / 2 - B - 0.09
    lib.rbox("WS_Soundbar", (2.0, 0.11, 0.1), (0, -0.09, z), M["bar"], r=0.045, seg=3)
    lib.rbox("WS_Grille", (1.86, 0.01, 0.06), (0, -0.146, z), M["grille"], r=0.02, seg=1)
    for s in (-1, 1):
        lib.rbox(f"WS_BarArm{s}", (0.06, 0.06, 0.1), (s * 0.7, -0.05, z + 0.08), M["bar"],
                 r=0.02, seg=1)


STEPS = [bezel, picture, soundbar]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
