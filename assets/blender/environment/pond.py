"""Pond: a little garden pond. A wobbly oval of glossy water, deep blue in the middle and
shallow at the edges, ringed by faceted stones, with lily pads and a pink lily, reeds with
cattails at one end, and a duck paddling about. About 3.1 × 2.0 m. Origin at the ground
centre; the water sits just above the lawn."""
import math

import bmesh
from mathutils import Vector

import lib
from environment import _env

NAME = "pond"
AO_RES = 512
AO_DISTANCE = 0.25

RX, RY = 1.2, 0.82
WATER_Z = 0.03


def rim(t):
    """Wobbly pond outline at angle t (radians), as (x, y)."""
    k = 1 + 0.1 * math.cos(2 * t + 0.4) + 0.06 * math.sin(3 * t + 1.0)
    return RX * k * math.cos(t), RY * k * math.sin(t)


def materials():
    return dict(
        deep=lib.mat("WaterDeep", "#45AEE6", rough=0.08),
        shallow=lib.mat("WaterShallow", "#7FDAF5", rough=0.1),
        stones=[lib.mat("Rock", "#B8B0A4", rough=0.85),
                lib.mat("RockLight", "#CFC8BC", rough=0.85),
                lib.mat("RockWarm", "#A99C8B", rough=0.85)],
        pad=lib.mat("LilyPad", "#4CB85A", rough=0.5),
        lily=lib.mat("Lily", "#FF9DCB", rough=0.55),
        lilyCentre=lib.mat("LilyCentre", "#FFD93D", rough=0.55),
        reed=lib.mat("Reed", "#3E9F45", rough=0.6),
        cattail=lib.mat("Cattail", "#7A5236", rough=0.8),
        duck=lib.mat("Duck", "#FFF8F0", rough=0.6),
        bill=lib.mat("Bill", "#FF9F45", rough=0.5),
        eye=lib.mat("Eye", "#1E1B2E", rough=0.3),
    )


def water(M):
    n = 40
    bm = bmesh.new()
    centre = bm.verts.new((0, 0, WATER_Z - 0.004))
    inner, outer = [], []
    for j in range(n):
        x, y = rim(2 * math.pi * j / n)
        inner.append(bm.verts.new((x * 0.55, y * 0.55, WATER_Z - 0.002)))
        outer.append(bm.verts.new((x, y, WATER_Z)))
    for j in range(n):
        k = (j + 1) % n
        bm.faces.new((centre, inner[j], inner[k]))
        bm.faces.new((inner[j], outer[j], outer[k], inner[k]))
    ob = lib._link("Water", bm, M["deep"])
    ob.data.materials.append(M["shallow"])
    for p in ob.data.polygons:
        if len(p.vertices) == 4:
            p.material_index = 1
    return ob


def stones(M):
    rnd = _env.rng(12)
    n = 22
    for j in range(n):
        t = 2 * math.pi * (j + rnd.uniform(-0.2, 0.2)) / n
        x, y = rim(t)
        out = Vector((x, y, 0)).normalized()
        r = rnd.uniform(0.11, 0.2)
        c = (x + out.x * r * 0.55, y + out.y * r * 0.55, r * 0.25)
        _env.icoblob(f"Stone{j}", r, c, M["stones"][j % 3], scale=(1.15, 1.0, 0.7),
                     subdiv=2 if r > 0.16 else 1, lump=0.2, seed=j, flat=-0.3)


def lilies(M):
    for k, (x, y, s, yaw) in enumerate(((-0.35, 0.18, 0.17, 0.4), (0.1, -0.3, 0.14, 2.0),
                                         (0.45, 0.25, 0.15, 3.6), (-0.6, -0.25, 0.12, 5.0))):
        _env.fan_leaf(f"Pad{k}", (x, y, WATER_Z + 0.008), yaw, 0.0, s, M["pad"],
                      slits=(math.pi,), slit_depth=1.0, slit_w=0.25, thick=0.012, droop=0.0,
                      samples=24, rings=1, back=1.0)
    _env.lobed_disc("LilyOuter", 0.075, 0.02, 6, 0.45, (-0.33, 0.24, WATER_Z + 0.03), M["lily"],
                    cup=0.035)
    _env.lobed_disc("LilyInner", 0.045, 0.02, 5, 0.4, (-0.33, 0.24, WATER_Z + 0.055), M["lily"],
                    cup=0.03, rot=(0, 0, 0.6))
    lib.sphere("LilyCentre", 0.018, (-0.33, 0.24, WATER_Z + 0.07), M["lilyCentre"], u=8, v=5)


def reeds(M):
    rnd = _env.rng(3)
    base_x, base_y = rim(math.radians(20))
    for k in range(7):
        x = base_x - 0.1 + rnd.uniform(-0.12, 0.12)
        y = base_y + rnd.uniform(-0.15, 0.1)
        h = rnd.uniform(0.55, 0.85)
        lean = (rnd.uniform(-0.06, 0.06), rnd.uniform(-0.06, 0.06))
        top = (x + lean[0], y + lean[1], WATER_Z + h)
        _env.tube(f"Reed{k}", (x, y, WATER_Z), top, 0.012, 0.008, M["reed"], verts=6)
        if k % 2 == 0:
            _env.tube(f"Cattail{k}", (top[0], top[1], top[2] - 0.14), top, 0.026, 0.026,
                      M["cattail"], verts=10)
        _env.blade(f"ReedLeaf{k}", (x, y, WATER_Z), rnd.uniform(0, 6.3), math.radians(70),
                   h * 0.7, 0.035, 0.008, M["reed"], droop=0.15, segs=4)


def duck(M):
    at = Vector((0.25, 0.02, WATER_Z))
    yaw = math.radians(-35)
    rot = (0, 0, yaw)

    def p(dx, dy, dz):
        c, s = math.cos(yaw), math.sin(yaw)
        return (at.x + dx * c - dy * s, at.y + dx * s + dy * c, at.z + dz)
    lib.sphere("DuckBody", 1.0, p(0, 0, 0.05), M["duck"], scale=(0.09, 0.13, 0.07), u=16, v=8,
               rot=rot)
    lib.sphere("DuckTail", 1.0, p(0, 0.12, 0.08), M["duck"], scale=(0.04, 0.05, 0.03), u=10, v=6,
               rot=(math.radians(-35), 0, yaw))
    lib.sphere("DuckHead", 0.06, p(0, -0.09, 0.16), M["duck"], u=14, v=8)
    lib.sphere("DuckBill", 1.0, p(0, -0.155, 0.15), M["bill"], scale=(0.028, 0.035, 0.012),
               u=10, v=5, rot=rot)
    for e in (-1, 1):
        lib.sphere(f"DuckEye{e}", 0.01, p(e * 0.032, -0.135, 0.18), M["eye"], u=6, v=4)


def build():
    lib.begin(NAME)
    M = materials()
    water(M)
    stones(M)
    lilies(M)
    reeds(M)
    duck(M)


META = dict(
    name="Pond",
    category="outdoor",
    priority="P2",
    description=("Little garden pond: glossy water ringed by faceted stones, lily pads and a "
                 "pink lily, reeds with cattails and a paddling duck"),
    tags=["garden", "water", "lawn", "decor"],
    tintable=[],
    anchors={"duck": [0.25, 0.03, -0.02]},
    notes="The water sits 3 cm above the lawn; no hole needed. The duck could bob on a spring.",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
