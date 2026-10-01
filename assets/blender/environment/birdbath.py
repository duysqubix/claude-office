"""Birdbath: a stone baluster pedestal holding a wide shallow bowl of bright water, with two
round little birds (one blue, one yellow) perched on the rim. About 1 m tall. Origin at the
ground centre."""
import math

import lib
from environment import _env

NAME = "birdbath"
AO_RES = 256
AO_DISTANCE = 0.15

BOWL_Z = 0.78
BOWL_R = 0.44


def materials():
    return dict(
        stone=lib.mat("Stone", _env.P["stone"], rough=0.85),
        water=lib.mat("Water", _env.P["water"], rough=0.08),
        birds=[lib.mat("BirdBlue", "#5CC8FF", rough=0.6),
               lib.mat("BirdYellow", "#FFD93D", rough=0.6)],
        belly=lib.mat("BirdBelly", "#FFF4E3", rough=0.6),
        beak=lib.mat("Beak", "#FF9F45", rough=0.5),
        eye=lib.mat("Eye", "#1E1B2E", rough=0.3),
    )


def pedestal(M):
    prof = [(0.0, 0.0), (0.27, 0.0), (0.28, 0.03), (0.26, 0.07), (0.2, 0.09), (0.18, 0.13),
            (0.12, 0.17), (0.1, 0.25), (0.13, 0.36), (0.135, 0.42), (0.1, 0.5), (0.085, 0.6),
            (0.1, 0.66), (0.16, 0.7), (0.2, 0.73), (0.0, 0.73)]
    lib.lathe("Pedestal", prof, material=M["stone"], verts=28)
    bowl = [(0.0, BOWL_Z - 0.06), (0.22, BOWL_Z - 0.06), (0.36, BOWL_Z - 0.02),
            (BOWL_R, BOWL_Z + 0.06), (BOWL_R + 0.02, BOWL_Z + 0.1), (BOWL_R, BOWL_Z + 0.13),
            (BOWL_R - 0.04, BOWL_Z + 0.12), (BOWL_R - 0.08, BOWL_Z + 0.05),
            (0.0, BOWL_Z + 0.03)]
    lib.lathe("Bowl", bowl, material=M["stone"], verts=36)
    lib.cyl("Water", BOWL_R - 0.07, 0.01, (0, 0, BOWL_Z + 0.085), M["water"], r=0, verts=32)


def bird(prefix, at, yaw, mat, M):
    """A round little bird facing `yaw` (0 = -Y)."""
    def p(dx, dy, dz):
        c, s = math.cos(yaw), math.sin(yaw)
        return (at[0] + dx * c - dy * s, at[1] + dx * s + dy * c, at[2] + dz)
    rot = (0, 0, yaw)
    lib.sphere(prefix + "Body", 1.0, p(0, 0, 0.055), mat, scale=(0.055, 0.07, 0.055), u=14,
               v=8, rot=rot)
    lib.sphere(prefix + "Belly", 1.0, p(0, -0.025, 0.045), M["belly"],
               scale=(0.042, 0.04, 0.042), u=12, v=6, rot=rot)
    lib.sphere(prefix + "Head", 0.042, p(0, -0.05, 0.115), mat, u=14, v=8)
    lib.sphere(prefix + "Beak", 1.0, p(0, -0.092, 0.11), M["beak"], scale=(0.012, 0.022, 0.01),
               u=8, v=5, rot=rot)
    for e in (-1, 1):
        lib.sphere(prefix + f"Eye{e}", 0.008, p(e * 0.022, -0.082, 0.125), M["eye"], u=6, v=4)
    lib.sphere(prefix + "Tail", 1.0, p(0, 0.075, 0.085), mat, scale=(0.03, 0.045, 0.012), u=10,
               v=5, rot=(math.radians(-30), 0, yaw))


def build():
    lib.begin(NAME)
    M = materials()
    pedestal(M)
    rim_z = BOWL_Z + 0.12
    for k, (deg, mat) in enumerate(((-65, M["birds"][0]), (150, M["birds"][1]))):
        a = math.radians(deg)
        at = (math.cos(a) * (BOWL_R - 0.02), math.sin(a) * (BOWL_R - 0.02), rim_z)
        # Face outward-ish and a little toward the front.
        bird(f"Bird{k}", at, a + math.pi / 2 + (0.5 if k == 0 else -0.6), mat, M)


META = dict(
    name="Birdbath",
    category="outdoor",
    priority="P2",
    description=("Stone baluster birdbath with a bowl of bright water and two round little "
                 "birds perched on the rim"),
    tags=["garden", "birds", "water", "decor"],
    tintable=[],
    anchors={"water": [0, 0.865, 0]},
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
