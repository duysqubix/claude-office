"""Toy car: a cute, rounded bubble car with no brand. A plump `Accent` body, a round-cornered
glasshouse of dark glossy windows under a body-colour roof, fat tyres with cream hubcaps,
cream bumpers, big friendly headlights and a smiley grille. It faces -Y. 2.7 m long, 1.7 m
wide with mirrors, 1.4 m tall. Origin at the ground centre."""
import math

import lib
from environment import _env

NAME = "toy_car"
AO_RES = 512
AO_DISTANCE = 0.25

W, L = 1.5, 2.6
WHEEL_R = 0.32
AXLE_Y = 0.86


def materials():
    return dict(
        body=lib.mat("Accent", lib.P["chairs"][0], rough=0.4),
        window=lib.mat("Window", "#34476A", rough=0.15),
        tyre=lib.mat("Tyre", "#2B2D42", rough=0.8),
        cream=lib.mat("Trim", "#FFF4E3", rough=0.5),
        lamp=_env.glow("Headlight", "#FFF3C4", strength=0.8),
        tail=_env.glow("Taillight", "#FF4D5A", strength=0.6),
        dark=lib.mat("Grille", "#3B4252", rough=0.5),
    )


def body(M):
    # Plump lower body: very round in plan and on every edge.
    _env.rr_prism("Body", W, L, 0.64, 0.5, (0, 0, 0.6), M["body"], seg=8, bevel=0.24, bseg=4)
    # Glasshouse: dark windows all round under a domed roof in body colour.
    _env.rr_prism("Glass", W - 0.2, L * 0.56, 0.46, 0.44, (0, 0.1, 1.1), M["window"], seg=8,
                  bevel=0.14, bseg=3)
    _env.rr_prism("Roof", W - 0.18, L * 0.565, 0.12, 0.45, (0, 0.1, 1.35), M["body"], seg=8,
                  bevel=0.055, bseg=3)
    # B-pillars split each side into two windows.
    for sx in (-1, 1):
        lib.rbox(f"Pillar{sx}", (0.05, 0.12, 0.4), (sx * (W / 2 - 0.105), 0.12, 1.11),
                 M["body"], r=0.022, seg=2)
    _env.rr_prism("Beltline", W - 0.14, L * 0.6, 0.06, 0.46, (0, 0.1, 0.9), M["body"], seg=8,
                  bevel=0.025, bseg=2)


def details(M):
    front = -L / 2
    for sx in (-1, 1):
        lib.cyl(f"Headlight{sx}", 0.13, 0.06, (sx * 0.47, front + 0.07, 0.68), M["cream"], r=0.02,
                seg=2, verts=24, rot=(math.pi / 2, 0, 0))
        lib.sphere(f"HeadlightLens{sx}", 0.1, (sx * 0.47, front + 0.035, 0.68), M["lamp"],
                   scale=(1, 0.45, 1), u=20, v=10)
        lib.rbox(f"Taillight{sx}", (0.18, 0.05, 0.1), (sx * 0.5, -front - 0.04, 0.72), M["tail"],
                 r=0.025, seg=2)
        # Side mirrors.
        lib.rbox(f"MirrorArm{sx}", (0.1, 0.03, 0.03), (sx * (W / 2 - 0.02), -0.45, 0.92),
                 M["body"], r=0.012, seg=1)
        lib.sphere(f"Mirror{sx}", 1.0, (sx * (W / 2 + 0.05), -0.45, 0.94), M["body"],
                   scale=(0.05, 0.035, 0.05), u=12, v=8)
    # Smiley grille: a curved dark bar under the headlights.
    smile = []
    for k in range(9):
        t = (k / 8) * 2 - 1
        smile.append((t * 0.28, front + 0.03, 0.47 + 0.07 * t * t))
    _env.sweep_tube("Grille", smile, 0.035, M["dark"], verts=10)
    for sgn in (-1, 1):
        lib.rbox(f"Bumper{sgn}", (W - 0.1, 0.16, 0.14), (0, sgn * (L / 2 - 0.02), 0.32),
                 M["cream"], r=0.06, seg=3)
    lib.rbox("Plate", (0.36, 0.03, 0.13), (0, L / 2 + 0.06, 0.5), M["cream"], r=0.02, seg=2)


def wheels(M):
    for sx in (-1, 1):
        for sy in (-1, 1):
            c = (sx * (W / 2 - 0.1), sy * AXLE_Y, WHEEL_R)
            prof = [(0.0, -0.13), (0.2, -0.13), (0.27, -0.12), (WHEEL_R, -0.07),
                    (WHEEL_R + 0.005, 0.0), (WHEEL_R, 0.07), (0.27, 0.12), (0.2, 0.13), (0.0, 0.13)]
            lib.lathe(f"Tyre{sx}{sy}", prof, loc=c, material=M["tyre"], verts=24,
                      rot=(0, math.pi / 2, 0))
            lib.cyl(f"Hubcap{sx}{sy}", 0.16, 0.05, (c[0] + sx * 0.12, c[1], c[2]), M["cream"],
                    r=0.02, seg=2, verts=20, rot=(0, math.pi / 2, 0))


def build():
    lib.begin(NAME)
    M = materials()
    body(M)
    details(M)
    wheels(M)


META = dict(
    name="Toy car",
    category="outdoor",
    priority="P1",
    description=("Cute rounded bubble car with a smiley grille, big headlights, fat tyres and a "
                 "domed roof; no brand"),
    tags=["car", "vehicle", "street", "parking"],
    tintable=["Accent"],
    anchors={},
    notes=("Body is 'Accent' (default coral #FF5A5F); tint from PALETTE.chairs or shirts. Faces "
           "+Z. Headlight/Taillight are mildly emissive."),
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
