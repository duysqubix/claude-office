"""Yoga mat: a rolled-out mat for stretching on the lawn, round-cornered and a few millimetres
thick, with the last bit still curled up at one end. `Accent` (tintable). 1.8 × 0.6 m, along X.
Origin at the ground centre of the mat."""
import math

import lib
from environment import _env

NAME = "yoga_mat"
AO_RES = 256
AO_DISTANCE = 0.06

L, W, T = 1.75, 0.6, 0.008


def build():
    lib.begin(NAME)
    mat = lib.mat("Accent", "#9B5DE5", rough=0.7)
    _env.rr_prism("Mat", L, W, T, 0.05, (0.0, 0.0, T / 2), mat, seg=2, bevel=0.0)
    lib.cyl("Curl", 0.038, W, (L / 2 + 0.012, 0.0, 0.038), mat, r=0.006, seg=1, verts=10,
            rot=(math.pi / 2, 0, 0))


META = dict(
    name="Yoga mat", category="outdoor", priority="P1",
    description="Rolled-out yoga mat with a curl at one end, for stretching on the lawn",
    tags=["garden", "lawn", "exercise", "break"], tintable=["Accent"],
    anchors={"stretch": [0.0, 0.008, 0.0]},
    notes="Long side along X. A stretching character stands or lies on the stretch anchor.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
