"""Bob: a chunky rounded helmet to the jaw, fuller at the sides and tucked under at the ends,
with a side-swept fringe: clean smooth sections divided by a few crisp carved grooves that
end in rounded notches, toy-hair style. `Hair`. SDF-sculpted (see _kit), trimmed where it
is buried in the head. Pivot at the head centre."""
from characters import _kit as kit

import lib

NAME = "hair_bob"
META = dict(
    name="Bob", category="character-hair", priority="P0",
    description="Chunky jaw-length bob with a side-swept fringe",
    tags=["hair", "bob"], tintable=["Hair"],
    anchors_bl={"headTop": (0, 0, kit.R + 0.036)},
)
R = kit.R
COLOR = "#A0522D"

# Grooves as (theta, phi) control points from the crown toward an edge; phi 0 = front,
# +90 = character-left. The fringe ones sweep toward character-left as they fall.
GROOVES = [
    [(22, -62), (42, -50), (62, -36)],
    [(18, -34), (40, -20), (61, -4)],
    [(19, -6), (40, 10), (62, 26)],
    [(24, 30), (44, 42), (63, 54)],
    [(36, 84), (70, 92), (104, 96)],
    [(36, 132), (70, 138), (106, 140)],
    [(36, 180), (72, 180), (108, 180)],
    [(36, 228), (70, 222), (106, 220)],
    [(36, 276), (70, 268), (104, 264)],
]


def base(P):
    S = kit
    d = S.sd_ellipsoid(P, (0, 0.01, 0.012), (R + 0.03, R + 0.034, R + 0.036))
    for s in (1, -1):
        d = S.smin(d, S.sd_ellipsoid(P, (s * 0.13, 0.035, -0.07), (0.175, 0.2, 0.13)), 0.06)
    d = S.smin(d, S.sd_ellipsoid(P, (0, 0.11, -0.06), (0.215, 0.18, 0.14)), 0.06)
    d = S.smax(d, -S.sd_ellipsoid(P, (0, -0.3, -0.07), (0.205, 0.24, 0.185)), 0.02)
    d = S.smax(d, -(P[:, 2] + 0.165), 0.03)
    return d


_paths = None


def sdf(P):
    global _paths
    if _paths is None:
        _paths = [kit.groove_path(base, g, samples=12, sink=-0.0055, extend=0.03)
                  for g in GROOVES]
    d = base(P)
    for pts in _paths:
        d = kit.smax(d, -kit.sd_groove(P, pts, 0.004, 0.0135), 0.007)
    return d


def build():
    lib.begin(NAME)
    kit.sdf_mesh("Bob", sdf, (-0.34, -0.36, -0.24), (0.34, 0.34, 0.35), kit.m_hair(COLOR),
                 voxel=0.0035, trim=kit.outside_head(), target=1900, remesh="decimate")


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.08)
