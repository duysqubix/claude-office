"""Picket fence: a 2 m section of chunky cream pickets with pointed, softened tops on two
rails, with one square post with a ball cap at its left end (x = -1). Sections tile end to
end along X at 2.0 m; add one more section's post (or a hedge) at the right end of a run.
About 1 m tall. Origin at the ground centre; front is -Y."""
import lib
from environment import _env

NAME = "fence_picket"
AO_RES = 512
AO_DISTANCE = 0.15

L = 2.0
N = 8
PICKET_H = 0.82


def materials():
    return dict(
        paint=lib.mat("Paint", "#FBF4E6", rough=0.6),
        post=lib.mat("PostPaint", "#F3EADB", rough=0.6),
    )


def pickets(M):
    w = 0.11
    outline = [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, PICKET_H - 0.09), (0.0, PICKET_H),
               (-w / 2, PICKET_H - 0.09)]
    for i in range(N):
        x = -L / 2 + (i + 0.5 + 0.25) * (L - 0.1) / N
        _env.extrude_outline(f"Picket{i}", outline, 0.035, (x, -0.035, 0.0), M["paint"],
                             bevel=0.012, bseg=2)
    for z in (0.22, 0.58):
        lib.rbox(f"Rail{z}", (L, 0.04, 0.08), (0.0, 0.0, z), M["paint"], r=0.016, seg=2)


def post(M):
    lib.rbox("Post", (0.13, 0.13, 0.92), (-L / 2, 0, 0.46), M["post"], r=0.03, seg=3)
    lib.rbox("PostCap", (0.16, 0.16, 0.035), (-L / 2, 0, 0.935), M["post"], r=0.012, seg=2)
    lib.sphere("PostBall", 0.055, (-L / 2, 0, 0.995), M["post"], u=16, v=10)


def build():
    lib.begin(NAME)
    M = materials()
    pickets(M)
    post(M)


META = dict(
    name="Picket fence",
    category="outdoor",
    priority="P1",
    description=("2 m section of chunky cream pickets with pointed tops on two rails, with a "
                 "ball-capped post at the left end"),
    tags=["fence", "garden", "boundary"],
    tintable=[],
    anchors={},
    notes=("The post is at x = -1. Sections tile along X at 2.0 m; close a run with one more post, "
           "a hedge or a gate."),
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
