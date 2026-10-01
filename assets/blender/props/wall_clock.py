"""Wall clock: chunky round clock with a fat red rim, cream face, blobby hour ticks and two
hands as separate nodes `HourHand` and `MinuteHand`, both pivoted at the dial centre and
pointing at 12 at rest. Origin at the wall-contact point (back centre); the face looks -Y."""
import math

import lib

NAME = "wall_clock"
AO_RES = 256
R = 0.2
META = dict(
    name="Wall clock", category="decor", priority="P0",
    description="Chunky red wall clock with animatable hour and minute hands",
    tags=["wall", "time"], tintable=[],
    anchors_bl={"center": (0, -0.06, 0)},
    nodes={"HourHand": "rest = 12 o'clock; rotate about -Z (three) for clockwise",
           "MinuteHand": "rest = 12 o'clock; rotate about -Z (three) for clockwise"},
    mount="wall: origin is the back centre",
)


def materials():
    return dict(
        rim=lib.mat("Rim", "#FF5A5F", rough=0.45),
        face=lib.mat("Face", lib.P["paper"], rough=0.6),
        tick=lib.mat("Tick", lib.P["ink"], rough=0.5),
        hand=lib.mat("Hand", lib.P["ink"], rough=0.45),
        pin=lib.mat("Pin", "#F2C14E", rough=0.35, metal=0.4),
    )


def body(M):
    face_on = (math.pi / 2, 0, 0)
    lib.cyl("CL_Back", R, 0.04, (0, -0.02, 0), M["face"], r=0.01, seg=1, verts=40, rot=face_on)
    lib.torus("CL_Rim", R, 0.035, (0, -0.035, 0), M["rim"], seg=40, ring=12, rot=face_on)
    for i in range(12):
        a = math.radians(90 - i * 30)
        big = i % 3 == 0
        rr = R - 0.055
        lib.sphere(f"CL_Tick{i}", 0.014 if big else 0.009,
                   (rr * math.cos(a), -0.041, rr * math.sin(a)), M["tick"],
                   scale=(1, 0.5, 1), u=10, v=5)


def hands(M):
    hr = lib.rbox("CL_Hour", (0.02, 0.008, 0.095), (0, -0.05, 0.0375), M["hand"], r=0.0035,
                  seg=1)
    lib.node(hr, "HourHand", pivot=(0, -0.05, 0))
    mn = lib.rbox("CL_Minute", (0.013, 0.006, 0.145), (0, -0.057, 0.0615), M["hand"], r=0.0028,
                  seg=1)
    lib.node(mn, "MinuteHand", pivot=(0, -0.057, 0))
    lib.sphere("CL_Pin", 0.014, (0, -0.062, 0), M["pin"], scale=(1, 0.6, 1), u=12, v=6)


STEPS = [body, hands]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
