"""Reception desk: a curved counter bowing out toward visitors (-Y). Tintable `Accent`
body with a white wrap-around stripe, a thick white counter top, a lower work surface on the
receptionist's side (+Y) and a dark kick plinth. Origin at the floor, centred on the desk."""
import math

import lib

NAME = "reception_desk"
AO_RES = 512
R_C = 1.25          # centre of curvature sits at +Y
A0, A1 = math.radians(-138), math.radians(-42)
META = dict(
    name="Reception desk", category="furniture", priority="P0",
    description="Curved reception counter with a wrap-around stripe and a lower work surface",
    tags=["reception", "interactable"], tintable=["Accent"],
    anchors_bl={"counter": (0, -0.2, 1.07), "bell": (0.3, -0.12, 1.07),
                "receptionist": (0, 0.55, 0), "visitor": (0, -0.75, 0)},
)


def materials():
    return dict(
        body=lib.mat("Accent", lib.P["deskAccents"][1], rough=0.65),
        top=lib.mat("CounterTop", lib.P["deskTop"], rough=0.55),
        kick=lib.mat("Kick", lib.P["chairBase"], rough=0.7),
    )


def body(M):
    at = (0, R_C, 0)
    lib.arc("RD_Kick", 1.06, 1.42, A0 + 0.02, A1 - 0.02, 0.0, 0.07, at, M["kick"], r=0.02,
            seg=2, segs=28)
    lib.arc("RD_Body", 1.02, 1.46, A0, A1, 0.06, 1.0, at, M["body"], r=0.045, seg=3, segs=28)
    lib.arc("RD_Stripe", 1.44, 1.49, A0 + 0.01, A1 - 0.01, 0.50, 0.60, at, M["top"], r=0.015,
            seg=2, segs=28)


def tops(M):
    at = (0, R_C, 0)
    lib.arc("RD_Counter", 1.0, 1.56, A0 - 0.03, A1 + 0.03, 1.0, 1.075, at, M["top"], r=0.03,
            seg=3, segs=32)
    lib.arc("RD_Work", 0.68, 1.04, A0 + 0.03, A1 - 0.03, 0.70, 0.76, at, M["top"], r=0.025,
            seg=2, segs=28)
    # Fat end caps where the counter stops.
    for i, a in enumerate((A0, A1)):
        x, y = 1.24 * math.cos(a), R_C + 1.24 * math.sin(a)
        lib.cyl(f"RD_Cap{i}", 0.06, 1.0, (x, y, 0.53), M["top"], r=0.03, seg=2, verts=20)


STEPS = [body, tops]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
