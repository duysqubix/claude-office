"""Rock cluster: one big and three smaller faceted boulders in warm greys, half-sunk in the
ground, moss on the sky-facing facets of the
big ones. About 1.3 m across, 0.6 m tall. Origin at the ground
centre."""
import lib
from environment import _env

NAME = "rock_cluster"
AO_RES = 512
AO_DISTANCE = 0.3

# (x, y, z, radius, scale, material, seed)
ROCKS = [
    (0.0, 0.05, 0.12, 0.42, (1.15, 0.95, 0.85), 0, 3),
    (0.5, -0.18, 0.04, 0.24, (1.2, 1.0, 0.8), 1, 8),
    (-0.42, -0.22, 0.03, 0.2, (1.1, 1.2, 0.75), 2, 12),
    (0.22, 0.42, 0.02, 0.16, (1.3, 1.0, 0.8), 1, 21),
]


def materials():
    return dict(
        rocks=[lib.mat("Rock", "#B8B0A4", rough=0.85),
               lib.mat("RockLight", "#CFC8BC", rough=0.85),
               lib.mat("RockWarm", "#A99C8B", rough=0.85)],
        moss=lib.mat("Moss", "#6AA84F", rough=0.9),
    )


def rocks(M):
    for i, (x, y, z, r, sc, k, seed) in enumerate(ROCKS):
        # Sunk into the ground: flatten what would sit below z = 0.
        flat = (0.0 - z) / (r * sc[2]) + 0.02
        rock = _env.icoblob(f"Rock{i}", r, (x, y, z), M["rocks"][k], scale=sc, subdiv=2,
                            lump=0.22, seed=seed, flat=flat)
        if i in (0, 1):
            # Moss on the facets that face the sky.
            _env.paint_up(rock, M["moss"], min_nz=0.8, min_z=r * 0.25)


def build():
    lib.begin(NAME)
    rocks(materials())


META = dict(
    name="Rock cluster",
    category="outdoor",
    priority="P1",
    description="Faceted warm-grey boulders half-sunk in the lawn, moss on their sky-facing facets",
    tags=["rock", "garden", "lawn", "faceted"],
    tintable=[],
    anchors={},
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
