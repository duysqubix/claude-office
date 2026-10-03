"""Small rock: one faceted pebble-boulder in warm grey, half-sunk in the lawn. About 0.35 m
across, 0.16 m tall. Origin at the ground centre; scatter freely (it reads the same from
every side)."""
import lib
from environment import _env

NAME = "rock_small"
AO_RES = 128
AO_DISTANCE = 0.08


def build():
    lib.begin(NAME)
    rock = lib.mat("Rock", "#B8B0A4", rough=0.85)
    _env.icoblob("Rock", 0.16, (0, 0, 0.035), rock, scale=(1.1, 0.95, 0.75), subdiv=2,
                 lump=0.24, seed=41, flat=-0.28)


META = dict(
    name="Small rock", category="outdoor", priority="P1",
    description="A small faceted warm-grey rock, half-sunk in the lawn",
    tags=["rock", "garden", "lawn", "faceted", "scatter"], tintable=[], anchors={},
    notes="About 80 tris; instance it with random yaw and a little scale variation.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
