"""Foosball table: chunky wooden box on fat legs with a green pitch, white lines, goals, and
eight chrome rods with black grips carrying little red and blue players. Long axis along X
(goals at the ends); rods run along Y. Origin at the floor centre."""
import math

import lib

NAME = "foosball_table"
AO_RES = 512
L, W, H = 1.25, 0.72, 0.9
FIELD_Z = 0.72
RODS = [(-1, 1), (-1, 2), (1, 3), (-1, 3), (1, 3), (-1, 3), (1, 2), (1, 1)]   # (team, players)
META = dict(
    name="Foosball table", category="furniture", priority="P2",
    description="Chunky foosball table with red and blue players",
    tags=["game-room", "fun"], tintable=["Accent"],
    anchors_bl={"playerA": (0, -0.75, 0), "playerB": (0, 0.75, 0)},
)


def materials():
    return dict(
        wood=lib.mat("Accent", lib.P["wood"], rough=0.6),
        field=lib.mat("Field", "#6BCB77", rough=0.7),
        line=lib.mat("Lines", "#FFFFFF", rough=0.6),
        goal=lib.mat("Goal", lib.P["ink"], rough=0.7),
        rod=lib.mat("Rod", lib.P["metal"], rough=0.25, metal=0.4),
        grip=lib.mat("Grip", lib.P["ink"], rough=0.6),
        red=lib.mat("TeamRed", "#FF5A5F", rough=0.5),
        blue=lib.mat("TeamBlue", "#3D7CFF", rough=0.5),
    )


def box(M):
    t = 0.05
    lib.rbox("FB_Floor", (L, W, 0.05), (0, 0, FIELD_Z - 0.025), M["wood"], r=0.02, seg=1)
    lib.rbox("FB_Field", (L - 2 * t, W - 2 * t, 0.006), (0, 0, FIELD_Z + 0.003), M["field"],
             r=0.002, seg=1)
    lib.rbox("FB_Mid", (0.012, W - 2 * t, 0.002), (0, 0, FIELD_Z + 0.007), M["line"], r=0, seg=1)
    for s in (-1, 1):
        lib.rbox(f"FB_Side{s}", (L + 0.02, t, 0.2), (0, s * (W / 2 - t / 2), FIELD_Z + 0.07),
                 M["wood"], r=0.022, seg=2)
        lib.rbox(f"FB_End{s}", (t, W, 0.2), (s * (L / 2 - t / 2), 0, FIELD_Z + 0.07), M["wood"],
                 r=0.022, seg=2)
        lib.rbox(f"FB_Goal{s}", (0.012, 0.2, 0.07), (s * (L / 2 - t - 0.002), 0,
                 FIELD_Z + 0.04), M["goal"], r=0.004, seg=1)
        for u in (-1, 1):
            lib.rbox(f"FB_Leg{s}{u}", (0.09, 0.09, FIELD_Z - 0.05),
                     (s * (L / 2 - 0.08), u * (W / 2 - 0.08), (FIELD_Z - 0.05) / 2), M["wood"],
                     r=0.03, seg=2)


def rods(M):
    n = len(RODS)
    for i, (team, players) in enumerate(RODS):
        x = -L / 2 + 0.11 + i * (L - 0.22) / (n - 1)
        z = FIELD_Z + 0.13
        lib.cyl(f"FB_Rod{i}", 0.009, W + 0.36, (x, 0, z), M["rod"], r=0, verts=8,
                rot=(math.pi / 2, 0, 0))
        gy = (W / 2 + 0.2) * (-1 if team < 0 else 1)
        lib.cyl(f"FB_Grip{i}", 0.022, 0.12, (x, gy, z), M["grip"], r=0.01, seg=1, verts=12,
                rot=(math.pi / 2, 0, 0))
        mat = M["red"] if team < 0 else M["blue"]
        for p in range(players):
            y = (p - (players - 1) / 2) * (W - 0.2) / max(players, 2)
            lib.rbox(f"FB_Body{i}_{p}", (0.035, 0.045, 0.1), (x, y, z - 0.03), mat, r=0.015,
                     seg=1)
            lib.sphere(f"FB_Head{i}_{p}", 0.022, (x, y, z + 0.035), mat, u=10, v=5)


STEPS = [box, rods]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
