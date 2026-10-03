"""Large rock: a big faceted warm-grey boulder with a broad, flattened top at seat height, so
someone on their break can perch on it, and moss on its lower ledges. About 1.15 m across,
0.46 m tall. Origin at the ground centre; the seat faces +Z (three.js)."""
import lib
from environment import _env

NAME = "rock_large"
AO_RES = 256
AO_DISTANCE = 0.2
SEAT_Z = 0.46


def build():
    lib.begin(NAME)
    rock = lib.mat("Rock", "#B8B0A4", rough=0.85)
    top = lib.mat("RockLight", "#CFC8BC", rough=0.85)
    moss = lib.mat("Moss", "#6AA84F", rough=0.9)
    r, cz, sz = 0.52, 0.06, 0.86
    big = _env.icoblob("Rock", r, (0, 0, cz), rock, scale=(1.1, 0.95, sz), subdiv=3, lump=0.2,
                       seed=23, flat=-0.2)
    # Press the crown flat at seat height (local coords are pre-scale).
    flat_top = (SEAT_Z - cz) / sz
    for v in big.data.vertices:
        if v.co.z > flat_top:
            v.co.z = flat_top + (v.co.z - flat_top) * 0.12
    big.data.update()
    _env.paint_up(big, top, min_nz=0.9, min_z=flat_top - 0.02)
    me = big.data
    me.materials.append(moss)
    mi = list(me.materials).index(moss)
    for p in me.polygons:
        if 0.45 < p.normal.z < 0.88 and p.center.z < flat_top - 0.05:
            p.material_index = mi


META = dict(
    name="Large rock", category="outdoor", priority="P1",
    description="A big faceted boulder with a flat top at seat height and moss on its ledges",
    tags=["rock", "garden", "lawn", "faceted", "seating"], tintable=[],
    anchors={"seat": [0.0, SEAT_Z, 0.05]},
    notes="Sit a character's pelvis at the seat anchor, facing +Z (or any way: it's round).",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
