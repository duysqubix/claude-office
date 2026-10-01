"""Doormat: a chunky round-cornered coir mat with a darker inset border and raised cream
"WELCOME" letters that read from outside (the -Y / three.js +Z side). 1.7 × 0.85 m.
Origin at the floor centre."""
import math

import lib
from environment import _env

NAME = "doormat"
AO_RES = 512
AO_DISTANCE = 0.08

W, D, T = 1.7, 0.85, 0.035


def materials():
    return dict(
        mat=lib.mat("Coir", "#C98D55", rough=0.95),
        border=lib.mat("Border", "#8E5A33", rough=0.9),
        letters=lib.mat("Letters", "#FFE8C2", rough=0.8),
    )


def body(M):
    _env.rr_prism("Mat", W, D, T, 0.13, (0, 0, T / 2), M["mat"], seg=6, bevel=0.012, bseg=2)
    # Inset border band, lying flat on top.
    _env.rr_ring("Band", (W - 0.12, D - 0.12, 0.09), (W - 0.22, D - 0.22, 0.05), 0.01,
                 (0, 0, T + 0.001), M["border"], seg=6, bevel=0.004, rot=(math.pi / 2, 0, 0),
                 bseg=1)


def letters(M):
    _env.text_mesh("Welcome", "WELCOME", 0.24, 0.02, (0, 0.0, T + 0.002), material=M["letters"],
                   bevel=0.005, bevel_res=0, res_u=2, spacing=1.08)


def build():
    lib.begin(NAME)
    M = materials()
    body(M)
    letters(M)


META = dict(
    name="WELCOME doormat",
    category="building",
    priority="P0",
    description="Chunky coir doormat with a dark inset border and raised cream WELCOME letters",
    tags=["entrance", "mat", "text"],
    tintable=[],
    anchors={},
    mount="floor: lies outside the door; the text reads from +Z (outside) toward the door",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
