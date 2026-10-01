"""Nap pod: a white rounded pedestal with a reclined padded bed (`Seat`) and a big spherical
privacy dome over the head end, trimmed with a soft glowing strip. Sleeping employees go
here. The bed runs along X with the dome at +X; the open side faces -Y. Origin at the floor
centre."""
import math

import lib

NAME = "nap_pod"
AO_RES = 512
META = dict(
    name="Nap pod", category="furniture", priority="P2",
    description="Futuristic nap pod with a padded bed and a privacy dome",
    tags=["lounge", "sleep", "fun"], tintable=["Seat"],
    anchors_bl={"lie": (-0.1, 0, 0.7), "head": (0.55, 0, 0.78)},
)


def materials():
    return dict(
        shell=lib.mat("Shell", "#F4F7FB", rough=0.4),
        bed=lib.mat("Seat", lib.P["chairs"][1], rough=0.8),
        glow=lib.mat("Glow", lib.P["screenGlow"], rough=0.3, emit=lib.P["screenGlow"],
                     strength=1.6),
        base=lib.mat("Base", lib.P["chairBase"], rough=0.6),
    )


def base(M):
    lib.slab("NP_Base", lib.stadium(1.1, 0.32, 12), 0.0, 0.42, material=M["shell"], r=0.06,
             seg=3)
    lib.slab("NP_Kick", lib.stadium(1.0, 0.28, 12), -0.001, 0.05, material=M["base"], r=0.015,
             seg=1)


def bed(M):
    tilt = math.radians(-8)          # head end (+X) a little higher
    b = lib.rbox("NP_Bed", (1.6, 0.66, 0.16), (-0.05, 0, 0.53), M["bed"], r=0.07, seg=1,
                 rot=(0, tilt, 0))
    lib.subsurf(b, 1)
    p = lib.rbox("NP_Pillow", (0.3, 0.5, 0.1), (0.6, 0, 0.67), M["bed"], r=0.045, seg=1,
                 rot=(0, tilt, 0))
    lib.subsurf(p, 1)


def dome(M):
    """A thick quarter-sphere hood over the head end, open toward the feet and the viewer."""
    ro, ri, n = 0.6, 0.55, 10
    prof = [(ro * math.cos(math.pi / 2 * i / n), ro * math.sin(math.pi / 2 * i / n))
            for i in range(n + 1)]
    prof += [(ri * math.cos(math.pi / 2 * i / n), ri * math.sin(math.pi / 2 * i / n))
             for i in range(n, -1, -1)]
    prof[n] = (0.0, ro)
    prof[n + 1] = (0.0, ri)
    lib.lathe("NP_Hood", prof + [prof[0]], (0.5, 0, 0.42), M["shell"], verts=20,
              sweep=math.radians(200), start=math.radians(-40))
    lib.slab("NP_GlowTrim", lib.stadium(1.12, 0.335, 12), 0.36, 0.385, material=M["glow"],
             r=0.008, seg=1)


STEPS = [base, bed, dome]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
