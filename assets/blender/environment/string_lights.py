"""String lights: a span of warm globe bulbs on a sagging wire between two chunky honey-wood
posts (2.6 m tall, 4.0 m apart) on slate footings, each with a short arm and hook at the
top. The wire dips to about 2.1 m in the middle; the bulbs (string_bulb's, 1.4× so they read
across the yard) hang under it to ~1.98 m, clear of everyone walking underneath. Origin at the ground centre; the span runs
along X.

The glass is the emissive material `Bulb`, in its own node `Bulbs`, so the night lighting
can brighten it. The wire and sockets are the node `Strand`: hide both nodes to hang your
own strand of string_bulb between the hook anchors `start` and `end`."""
import math

from mathutils import Vector

import lib
from environment import _env, string_bulb

NAME = "string_lights"
AO_RES = 512
AO_DISTANCE = 0.25

POST_X = 2.0          # posts at ±POST_X
POST_H = 2.6
HOOK_X, HOOK_Z = 1.84, 2.43
SAG = 0.33
BULBS = 12


def materials():
    return dict(
        string_bulb.materials(),
        wood=lib.mat("Wood", lib.P["wood"], rough=0.6),
        dark=lib.mat("WoodDark", "#A9733F", rough=0.65),
        slate=lib.mat("Slate", _env.P["doorFrame"], rough=0.55),
        wire=lib.mat("Wire", "#2E3440", rough=0.5),
    )


def wire_z(x):
    """The wire's height: a gentle parabola between the hooks."""
    return HOOK_Z - SAG * (1 - (x / HOOK_X) ** 2)


def post(M, s):
    x = s * POST_X
    lib.rbox(f"Footing{s}", (0.3, 0.3, 0.1), (x, 0, 0.05), M["slate"], r=0.03, seg=1)
    lib.rbox(f"Post{s}", (0.12, 0.12, POST_H - 0.1), (x, 0, 0.05 + (POST_H - 0.1) / 2),
             M["wood"], r=0.022, seg=1)
    cap = lib.cyl(f"Cap{s}", 0.1, 0.08, (x, 0, POST_H + 0.03), M["dark"], r=0, verts=4,
                  radius2=0.0, rot=(0, 0, math.pi / 4))
    cap.data.shade_flat()
    # A short arm reaching toward the span, the wire's hook under its tip.
    arm_len = POST_X - HOOK_X + 0.05
    lib.rbox(f"Arm{s}", (arm_len, 0.05, 0.05), (s * (HOOK_X + arm_len / 2 - 0.03), 0,
                                                 HOOK_Z + 0.05), M["dark"], r=0.012, seg=1)
    lib.torus(f"Hook{s}", 0.022, 0.006, (s * HOOK_X, 0, HOOK_Z + 0.005), M["wire"], seg=6,
              ring=3, rot=(math.pi / 2, 0, 0))


def lights(M):
    pts = [Vector((x, 0, wire_z(x))) for x in
           (-HOOK_X + 2 * HOOK_X * i / 12 for i in range(13))]
    strand = [_env.sweep_tube("WireSpan", pts, 0.008, M["wire"], verts=5)]
    for i in range(BULBS):
        x = -HOOK_X + 2 * HOOK_X * (i + 0.5) / BULBS
        socket, glass = string_bulb.bulb(M, (x, 0, wire_z(x) - 0.004), f"Bulb{i}", size=1.4)
        strand.append(socket)
        lib.node(glass, "Bulbs", pivot=(0, 0, 0))
    for o in strand:
        lib.node(o, "Strand", pivot=(0, 0, 0))


def build():
    lib.begin(NAME)
    M = materials()
    for s in (-1, 1):
        post(M, s)
    lights(M)


META = dict(
    name="String lights",
    category="outdoor",
    priority="P1",
    artist="Claude Rodin",
    description="Warm globe bulbs on a sagging wire between two wooden posts, glowing at dusk",
    tags=["garden", "light", "night", "party"],
    tintable=[],
    anchors_bl={"start": (-HOOK_X, 0, HOOK_Z), "end": (HOOK_X, 0, HOOK_Z),
                "postL": (-POST_X, 0, 0), "postR": (POST_X, 0, 0)},
    notes="Glass is emissive 'Bulb' (strength 2) in node 'Bulbs': brighten it at dusk. Wire "
          "and sockets are node 'Strand'. The wire hangs from 'start' to 'end' (the hooks) and "
          "dips to 2.1 m; the bulbs' bottoms are ~1.98 m up.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
