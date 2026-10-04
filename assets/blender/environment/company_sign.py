"""Company sign: a lawn monument. A chunky Claude-orange panel with a cream inset border,
raised two-tone "CLAUDE OFFICE" letters (cream faces over fat terracotta outlines, like a
toy-town shop sign) and a sparkle, on a two-step stone plinth with a row of flowering
bushes in front. 3.1 m wide, 1.5 m tall. Origin at the ground centre; reads from -Y."""
import math

import lib
from environment import _env

NAME = "company_sign"
AO_RES = 512
AO_DISTANCE = 0.3

PANEL_Z = 0.95      # panel centre height
PANEL_Y = 0.05      # panel centre depth (a little behind the plinth centre)
PANEL_T = 0.24
FACE_Y = PANEL_Y - PANEL_T / 2


def materials():
    return dict(
        stone=lib.mat("Stone", "#E3D5BE", rough=0.85),
        cap=lib.mat("StoneCap", "#EFE5D3", rough=0.85),
        panel=lib.mat("Panel", _env.P["claude"], rough=0.6),
        cream=lib.mat("Cream", "#FFF4E3", rough=0.55),
        outline=lib.mat("Outline", "#8C3B26", rough=0.6),
        leaves=[lib.mat("Leaf", _env.P["treeLeaf"][0], rough=0.8),
                lib.mat("LeafDark", _env.P["treeLeaf"][1], rough=0.8),
                lib.mat("LeafLight", _env.P["treeLeaf"][2], rough=0.8)],
        petals=[lib.mat(f"Petal{i}", c, rough=0.6) for i, c in enumerate(_env.P["flowers"])],
        centre=lib.mat("FlowerCentre", "#FFC93C", rough=0.6),
    )


def plinth(M):
    _env.rr_prism("Plinth", 3.0, 0.8, 0.34, 0.14, (0, 0.05, 0.17), M["stone"], seg=6,
                  bevel=0.03, bseg=2)
    _env.rr_prism("PlinthCap", 3.12, 0.92, 0.08, 0.17, (0, 0.05, 0.38), M["cap"], seg=6,
                  bevel=0.03, bseg=2)


def panel(M):
    up = (math.pi / 2, 0, 0)
    _env.rr_prism("Panel", 2.7, 1.06, PANEL_T, 0.28, (0, PANEL_Y, PANEL_Z), M["panel"], seg=8,
                  bevel=0.05, bseg=3, rot=up)
    _env.rr_ring("Border", (2.5, 0.86, 0.2), (2.38, 0.74, 0.14), 0.03,
                 (0, FACE_Y, PANEL_Z), M["cream"], seg=8, bevel=0.01, bseg=1)


def letters(M):
    up = (math.pi / 2, 0, 0)
    # A little more room after CLAUDE's L: its fat outline overlapped the A's, flush.
    for text, size, z, spacing, kern in (("CLAUDE", 0.34, PANEL_Z + 0.09, 1.04, {1: 5}),
                                         ("OFFICE", 0.19, PANEL_Z - 0.21, 1.3, None)):
        _env.text_mesh(f"{text}Outline", text, size, 0.04, (0.2, FACE_Y - 0.01, z), up,
                       M["outline"], res_u=2, spacing=spacing, offset=size * 0.05, kerning=kern)
        _env.text_mesh(f"{text}Face", text, size, 0.05, (0.2, FACE_Y - 0.026, z), up,
                       M["cream"], res_u=2, spacing=spacing, kerning=kern)


def sparkle(M):
    """A ten-ray starburst left of the words, two-tone like the letters."""
    cx, cz = -0.86, PANEL_Z
    for i in range(10):
        a = math.radians(i * 36 + 8)
        length = 0.25 if i % 2 == 0 else 0.18
        d = 0.05 + length / 2
        pos = (cx + math.sin(a) * d, cz + math.cos(a) * d)
        # Every other outline stands 2 mm prouder, so neighbours never overlap flush.
        lift = 0.002 * (i % 2)
        lib.rbox(f"RayOut{i}", (0.1, 0.035 + lift, length + 0.03),
                 (pos[0], FACE_Y - 0.012 - lift / 2, pos[1]), M["outline"], r=0.016, seg=1,
                 rot=(0, a, 0))
        lib.rbox(f"Ray{i}", (0.07, 0.04, length), (pos[0], FACE_Y - 0.03, pos[1]), M["cream"],
                 r=0.03, seg=2, rot=(0, a, 0))
    lib.cyl("SparkleHub", 0.07, 0.05, (cx, FACE_Y - 0.032, cz), M["cream"], r=0.015, seg=2,
            verts=20, rot=(math.pi / 2, 0, 0))


def garden(M):
    """A low hedge of overlapping puffs along the front of the plinth, dotted with flowers."""
    rnd = _env.rng(7)
    puffs = []
    for i in range(10):
        x = -1.35 + i * 0.3
        r = 0.2 + 0.04 * ((i * 7) % 3) / 2
        puffs.append((x, -0.55 + 0.05 * (i % 2), 0.13 + 0.03 * (i % 3), r, (1, 0, 1)[i % 3]))
    _env.puff_cluster("Bush", puffs, M["leaves"], seed=60)
    for i in range(11):
        x = -1.38 + i * 0.275 + rnd.uniform(-0.04, 0.04)
        y = -0.66 + rnd.uniform(-0.04, 0.04)
        z = 0.3 + rnd.uniform(-0.04, 0.06)
        _env.flower(f"Flower{i}", (x, y, z), M["petals"][i % len(M["petals"])], M["centre"],
                    r=0.085, face=(0.75 + rnd.uniform(-0.15, 0.15), rnd.uniform(-0.3, 0.3)),
                    spin=rnd.uniform(0, 6.28))


def build():
    lib.begin(NAME)
    M = materials()
    plinth(M)
    panel(M)
    letters(M)
    sparkle(M)
    garden(M)


META = dict(
    name="CLAUDE OFFICE sign",
    category="outdoor",
    priority="P0",
    description=("Lawn monument: Claude-orange panel with raised two-tone CLAUDE OFFICE letters "
                 "and a sparkle, on a stone plinth behind a flowering hedge"),
    tags=["sign", "entrance", "garden", "text", "landmark"],
    tintable=[],
    anchors={"face": [0, 0.95, 0.1]},
    notes="Hero landmark: 11k tris / ~500 KB (text geometry). Reads from +Z.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
