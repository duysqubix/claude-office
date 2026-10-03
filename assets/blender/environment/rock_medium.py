"""Medium rock: a faceted warm-grey boulder with a smaller stone tucked against it and moss on
its sky-facing facets, half-sunk in the lawn. About 0.75 m across, 0.32 m tall. Origin at the
ground centre."""
import lib
from environment import _env

NAME = "rock_medium"
AO_RES = 256
AO_DISTANCE = 0.15


def build():
    lib.begin(NAME)
    rock = lib.mat("Rock", "#B8B0A4", rough=0.85)
    light = lib.mat("RockLight", "#CFC8BC", rough=0.85)
    moss = lib.mat("Moss", "#6AA84F", rough=0.9)
    big = _env.icoblob("Rock", 0.3, (0.02, 0.0, 0.08), rock, scale=(1.15, 1.0, 0.82), subdiv=2,
                       lump=0.24, seed=7, flat=-0.3)
    _env.paint_up(big, moss, min_nz=0.8, min_z=0.08)
    _env.icoblob("Pebble", 0.12, (-0.26, -0.13, 0.03), light, scale=(1.1, 1.0, 0.8), subdiv=2,
                 lump=0.22, seed=19, flat=-0.25)


META = dict(
    name="Medium rock", category="outdoor", priority="P1",
    description="A faceted warm-grey boulder with a pebble beside it and moss on top",
    tags=["rock", "garden", "lawn", "faceted", "scatter"], tintable=[], anchors={},
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
