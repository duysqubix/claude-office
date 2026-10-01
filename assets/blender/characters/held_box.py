"""Held box: the "you're free to go" cardboard box, carried out with both hands. Chunky
kraft walls, the top flaps flopped open, hand-hole slots on the sides, a strip of tape, and
a desk life poking out: a little succulent in a terracotta pot, a framed photo and a rubber
duck. Pivot = midway between the hands (the hand holes); anchors handL / handR are the
mitten centres. Front faces -Y (away from the carrier)."""
import math

from mathutils import Matrix, Vector

from characters import _kit as kit

import lib

NAME = "held_box"
W, D, H, T = 0.38, 0.28, 0.24, 0.012
Z0 = -0.14            # box bottom below the hand holes
TOP = Z0 + H
META = dict(
    name="Box of desk stuff (held)", category="character-held", priority="P0",
    description="Open cardboard box with a plant, photo and rubber duck; carried in both hands",
    tags=["held", "box", "leaving", "fired"], tintable=[],
    anchors_bl={"handL": (W / 2 + 0.035, 0, 0), "handR": (-W / 2 - 0.035, 0, 0),
                "gripL": tuple(kit.Vector((W / 2 + 0.035, 0, 0)) - kit.hand_from_grip()),
                "gripR": tuple(kit.Vector((-W / 2 - 0.035, 0, 0)) - kit.hand_from_grip())},
)


def materials():
    return dict(
        kraft=kit.flat("Kraft", "#D9A066", rough=0.85),
        dark=kit.flat("KraftDark", "#8E6239", rough=0.9),
        tape=kit.flat("Tape", "#EBCB91", rough=0.45),
        pot=kit.flat("Pot", "#E07A4F", rough=0.75),
        soil=kit.flat("Soil", "#6B4A32", rough=0.95),
        leaf=kit.flat("Leaf", "#4CC46A", rough=0.6),
        frame=kit.flat("Frame", "#9C6B43", rough=0.6),
        sky=kit.flat("PhotoSky", "#7FD8FF", rough=0.5),
        grass=kit.flat("PhotoGrass", "#7ED957", rough=0.6),
        sun=kit.flat("PhotoSun", "#FFD93D", rough=0.5),
        duck=kit.flat("Duck", "#FFD93D", rough=0.5),
        beak=kit.flat("Beak", "#FF9F45", rough=0.5),
        eye=kit.flat("DuckEye", "#1E1B2E", rough=0.2),
    )


def box(M):
    zc = Z0 + H / 2
    lib.rbox("Bottom", (W, D, T), (0, 0, Z0 + T / 2), M["kraft"], r=0.004, seg=1)
    for s, nm in ((-1, "Front"), (1, "Back")):
        lib.rbox(nm, (W, T, H), (0, s * (D / 2 - T / 2), zc), M["kraft"], r=0.005, seg=1)
    for s, nm in ((1, "SideL"), (-1, "SideR")):
        lib.rbox(nm, (T, D - 2 * T, H), (s * (W / 2 - T / 2), 0, zc), M["kraft"], r=0.005,
                 seg=1)
        lib.rbox(f"Hole{nm}", (0.006, 0.09, 0.03), (s * (W / 2 + 0.0005), 0, 0.0),
                 M["dark"], r=0.012, seg=2)
    # Flaps flopped open: the long ones hang outward, the short ones splay up and out.
    for s, nm, ang in ((-1, "FlapFront", 118), (1, "FlapBack", 104)):
        f = lib.rbox(nm, (W - 0.012, T * 0.8, D * 0.48), (0, 0, D * 0.24), M["kraft"],
                     r=0.004, seg=1)
        kit.transform([f], Matrix.Translation((0, s * (D / 2 - T / 2), TOP)) @
                      Matrix.Rotation(math.radians(-s * ang), 4, "X"))
    for s, nm, ang in ((1, "FlapL", 62), (-1, "FlapR", 70)):
        f = lib.rbox(nm, (T * 0.8, D - 0.03, W * 0.4), (0, 0, W * 0.2), M["kraft"], r=0.004,
                     seg=1)
        kit.transform([f], Matrix.Translation((s * (W / 2 - T / 2), 0, TOP)) @
                      Matrix.Rotation(math.radians(s * ang), 4, "Y"))
    lib.rbox("Tape", (0.06, 0.002, H + 0.004), (-0.07, -D / 2 - 0.001, Z0 + H / 2),
             M["tape"], r=0.001, seg=1)


def plant(M, at):
    x, y, z = at
    lib.lathe("PotBody", [(0, 0), (0.045, 0), (0.052, 0.008), (0.058, 0.07), (0.064, 0.072),
                          (0.064, 0.088), (0, 0.088)], loc=(x, y, z), material=M["pot"],
              verts=16)
    lib.cyl("PotSoil", 0.056, 0.006, (x, y, z + 0.086), M["soil"], r=0, verts=16)
    for i, (tilt, yaw, s) in enumerate([(8, 0, 1.0), (35, 80, 0.9), (38, 200, 0.9),
                                        (40, 300, 0.85), (20, 140, 0.8)]):
        t, p = math.radians(tilt), math.radians(yaw)
        d = Vector((math.sin(t) * math.cos(p), math.sin(t) * math.sin(p), math.cos(t)))
        c = Vector((x, y, z + 0.09)) + d * 0.045 * s
        lib.sphere(f"Leaf{i}", 1.0, tuple(c), M["leaf"], scale=(0.024 * s, 0.024 * s, 0.05 * s),
                   u=8, v=6, rot=d.to_track_quat("Z", "Y").to_euler())


def photo(M, at):
    x, y, z = at
    tilt = (math.radians(-14), 0, math.radians(10))
    fr = Matrix.Translation((x, y, z)) @ Matrix.Rotation(tilt[0], 4, "X") @ \
        Matrix.Rotation(tilt[2], 4, "Z")

    def put(ob):
        return kit.transform([ob], fr)[0]
    put(lib.rbox("PhotoFrame", (0.13, 0.016, 0.16), (0, 0, 0), M["frame"], r=0.008, seg=2))
    put(lib.rbox("PhotoSky", (0.1, 0.004, 0.128), (0, -0.007, 0.0), M["sky"], r=0.003, seg=1))
    put(lib.rbox("PhotoGrass", (0.1, 0.005, 0.045), (0, -0.0085, -0.04), M["grass"], r=0.003,
                 seg=1))
    put(lib.sphere("PhotoSun", 0.016, (0.025, -0.0085, 0.035), M["sun"], scale=(1, 0.25, 1),
                   u=8, v=4))


def duck(M, at):
    x, y, z = at
    lib.sphere("DuckBody", 1.0, (x, y, z), M["duck"], scale=(0.05, 0.042, 0.038), u=14, v=8)
    lib.sphere("DuckHead", 0.03, (x - 0.025, y - 0.004, z + 0.045), M["duck"], u=14, v=8)
    lib.sphere("DuckBeak", 1.0, (x - 0.056, y - 0.004, z + 0.04), M["beak"],
               scale=(0.02, 0.016, 0.008), u=10, v=6)
    for s in (-1, 1):
        lib.sphere(f"DuckEye{s}", 0.0055, (x - 0.044, y - 0.004 + s * 0.016, z + 0.055),
                   M["eye"], u=6, v=4)


def build():
    lib.begin(NAME)
    M = materials()
    box(M)
    plant(M, (-0.1, 0.04, TOP - 0.06))
    photo(M, (0.05, 0.06, TOP + 0.01))
    duck(M, (0.11, -0.05, TOP - 0.005))


def finalize(name):
    return kit.finalize(name, META, ao_distance=0.08)
