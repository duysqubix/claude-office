"""Shared body builders (rig-dimensions.json proportions) for the body-part models and the
presets: torso (pants below the belt, shirt above, split at the chest joint), crew collar,
sleeved upper arm, forearm, mitten, thigh, shin and sneaker. All in their joint's own space
(Blender: Z up, front -Y, character-left +X); `at` / `rot` place them for the presets."""
import math

import numpy as np
from mathutils import Matrix, Vector

from characters import _kit as kit

import lib

T = kit.TORSO
CHEST_Y = T["chestPivotY"]
BELT_Y = T["beltY"]
PANTS_OFF = T["pantsOffset"]
Z = kit.TORSO_Z
L = kit.LIMB
HEAD_C = kit.HEAD_Y  # head centre above the pelvis


def _profile(girth=1.0):
    return kit.torso_profile(girth, samples=36)


def _slice(prof, y0, y1):
    """Profile points with y0 <= y <= y1, with exact end points interpolated in."""
    def at(y):
        for (r0, a), (r1, b) in zip(prof, prof[1:]):
            if (a - y) * (b - y) <= 0 and a != b:
                return (r0 + (r1 - r0) * (y - a) / (b - a), y)
        return None
    out = [p for p in prof if y0 < p[1] < y1]
    lo, hi = at(y0), at(y1)
    if lo:
        out.insert(0, lo)
    if hi:
        out.append(hi)
    return out


def lathe_part(name, prof, material, verts=24, at=Vector((0, 0, 0)), grow=0.0):
    pts = [(max(0.0, r + (grow if r > 0 else 0.0)), y) for r, y in prof]
    ob = lib.lathe(name, pts, loc=tuple(at), material=material, verts=verts)
    ob.scale = (1, Z, 1)
    return ob


def torso(M, girth=1.0, chest_node=True, tuck=True, emblem=True):
    """Shirt bean over pants, split at the chest joint: the upper shirt is node `Chest`
    (pivot at chestPivotY) and the lower part ends in a dome so bending never opens a
    hole. Returns (lower parts, chest parts)."""
    prof = _profile(girth)
    lower = []
    # Lower shirt: belt to the chest line, capped with a dome hidden inside the chest.
    low = _slice(prof, BELT_Y - 0.03, CHEST_Y)
    r_top = low[-1][0]
    cap = [(r_top * math.cos(a), CHEST_Y + 0.05 * math.sin(a))
           for a in np.linspace(0.25, math.pi / 2, 5)]
    lower.append(lathe_part("ShirtLow", low + cap, M["shirt"]))
    # Pants: the bottom of the bean, proud of the shirt, with a soft waistband lip.
    pants = _slice(prof, prof[0][1], BELT_Y)
    rb = pants[-1][0] + PANTS_OFF
    pants = [(r + PANTS_OFF if r > 0 else 0.0, y - 0.004) for r, y in pants]
    pants += [(rb + 0.004, BELT_Y + 0.004), (rb + 0.002, BELT_Y + 0.012),
              (rb - 0.012, BELT_Y + 0.014)]
    lower.append(lathe_part("Pants", pants, M["pants"]))
    up = _slice(prof, CHEST_Y, prof[-1][1])
    chest = [lathe_part("ShirtUp", up, M["shirt"])]
    if emblem and "accent" in M:
        # A little round print on the left chest, like Wobbly Life's tops.
        y = 0.2
        x = 0.085 * girth
        r = kit.torso_radius_at(y, girth)
        zf = -Z * math.sqrt(max(0.0, r * r - x * x))
        n = Vector((x / (r * r), -zf / (Z * Z * r * r) * -1, 0)).normalized()
        e = lib.cyl("Emblem", 0.026, 0.006, (x, zf - 0.001, y), M["accent"], r=0.002, seg=1,
                    verts=18, rot=(math.pi / 2, 0, math.atan2(x, -zf) * -0.9))
        chest.append(e)
    if chest_node:
        for ob in chest:
            lib.node(ob, "Chest", pivot=(0, 0, CHEST_Y))
    return lower, chest


def neck_ring(girth=1.0, n=28, out=0.004):
    """Points where the head sphere meets the torso bean, all the way round (pelvis space)."""
    hc = Vector((0, 0, HEAD_C))
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        lo, hi = 0.2, 0.41
        for _ in range(30):
            y = 0.5 * (lo + hi)
            r = kit.torso_radius_at(y, girth)
            p = Vector((r * math.cos(a), Z * r * math.sin(a), y))
            if (p - hc).length > kit.R:
                lo = y
            else:
                hi = y
        r = kit.torso_radius_at(lo, girth)
        p = Vector((r * math.cos(a), Z * r * math.sin(a), lo))
        nrm = Vector((math.cos(a), math.sin(a) / Z, 0.25)).normalized()
        pts.append(p + nrm * out)
    return pts


def crew_collar(M, girth=1.0):
    """A rolled crew neckline where the head meets the shirt."""
    return kit.ring_tube("Collar", neck_ring(girth, out=0.004), 0.013, M["shirt"], ring=8)


# ---------------------------------------------------------------- limbs (joint space)

def capsule(name, length, r, material, r2=None, verts=16, rings=6):
    """Capsule hanging down from the origin (the joint) to -length."""
    r2 = r if r2 is None else r2
    pts = [Vector((0, 0, 0)), Vector((0, 0, -length))]
    return kit.tube(name, pts, [r, r2], material, ring=verts, cap_rings=rings)


def upper_arm(M, sleeve=0.62):
    """Shoulder → elbow. `Shirt` sleeve over the top `sleeve` fraction with a hem lip,
    `Skin` below it (tint it the shirt colour for long sleeves)."""
    ln, r = L["upperArm"]["len"], L["upperArm"]["r"]
    cut = ln * sleeve
    parts = [kit.tube("Sleeve", [Vector((0, 0, 0)), Vector((0, 0, -cut))], [r + 0.006, r + 0.008],
                      M["shirt"], ring=16, cap_rings=5)]
    parts.append(kit.ring_tube("Hem", [Vector((r + 0.006) * math.cos(a), (r + 0.006) * math.sin(a),
                                              -cut) for a in np.linspace(0, 2 * math.pi, 16,
                                                                        endpoint=False)],
                               0.0065, M["shirt"], ring=8))
    parts.append(capsule("Arm", ln, r, M["skin"], verts=16))
    return parts


def forearm(M):
    """Elbow → wrist, `Skin` (tint it the shirt colour for long sleeves)."""
    return [capsule("Forearm", L["forearm"]["len"], L["forearm"]["r"], M["skin"], verts=16)]


def mitten_sdf(P, side=1):
    h = L["hand"]
    rx, ry, rz = h["radii"]           # three.js: width, height, depth
    c = Vector((0, 0, -h["offset"]))
    d = kit.sd_ellipsoid(P, tuple(c), (rx * 0.94, rz, ry * 0.86))
    # The fingers' block: a touch wider and rounder below the palm.
    d = kit.smin(d, kit.sd_ellipsoid(P, tuple(c + Vector((0, 0.004, -0.03))),
                                     (rx, rz * 0.96, ry * 0.62)), 0.03)
    t = h["thumb"]
    tc = c + kit.bl(*t["at"])
    d = kit.smin(d, kit.sd_round_cone(P, tuple(c + Vector((0, -0.015, -0.0))),
                                      tuple(tc), t["r"] * 1.05, t["r"]), 0.022)
    # A soft wrist so it reads as a mitten, not a ball.
    d = kit.smin(d, kit.sd_round_cone(P, (0, 0, 0.02), tuple(c), 0.05, 0.06), 0.03)
    return d


def mitten(M, target=900):
    lo, hi = (-0.1, -0.12, -0.16), (0.1, 0.1, 0.06)
    return [kit.sdf_mesh("Mitten", mitten_sdf, lo, hi, M["skin"], voxel=0.0025,
                         target=target, remesh="decimate")]


def thigh(M):
    return [capsule("Thigh", L["thigh"]["len"], L["thigh"]["r"], M["pants"], verts=18)]


def shin(M, hem=True):
    ln, r = L["shin"]["len"], L["shin"]["r"]
    parts = [capsule("Shin", ln, r, M["pants"], r2=r + 0.004, verts=18)]
    if hem:
        parts.append(kit.ring_tube("Cuff", [Vector(((r + 0.006) * math.cos(a),
                                                    (r + 0.006) * math.sin(a), -ln + 0.012))
                                            for a in np.linspace(0, 2 * math.pi, 18,
                                                                 endpoint=False)],
                                   0.008, M["pants"], ring=8))
    return parts


# ---------------------------------------------------------------- shoes (ankle space)

def shoe_frame():
    f = L["foot"]
    w, h, ln = f["size"]
    c = Vector((0, -f["forward"], -f["below"]))
    return c, (w / 2, ln / 2, h / 2)


def sneaker_upper(P):
    c, (rx, ry, rz) = shoe_frame()
    d = kit.sd_ellipsoid(P, tuple(c + Vector((0, 0.005, 0.004))), (rx * 0.97, ry * 0.97, rz))
    # Toe box a little puffier and rounder up front.
    d = kit.smin(d, kit.sd_ellipsoid(P, tuple(c + Vector((0, -ry * 0.42, -0.006))),
                                     (rx * 0.98, ry * 0.55, rz * 0.82)), 0.03)
    # Flat underneath so it stands.
    return kit.smax(d, (c.z - rz + 0.012) - P[:, 2], 0.012)


def sneaker_sole(P):
    c, (rx, ry, rz) = shoe_frame()
    d = kit.sd_ellipsoid(P, tuple(c + Vector((0, -0.002, -0.004))),
                         (rx + 0.008, ry + 0.01, rz * 0.98))
    floor = c.z - rz
    d = kit.smax(d, floor - P[:, 2] - 0.0005, 0.01)
    d = kit.smax(d, P[:, 2] - (floor + 0.036), 0.008)
    # Toe cap: the rubber climbs over the front of the toe.
    toe = kit.sd_ellipsoid(P, tuple(c + Vector((0, -ry * 0.6, -0.01))),
                           (rx * 0.86, ry * 0.42, rz * 0.62))
    toe = kit.smax(toe, P[:, 1] - (c.y - ry * 0.55), 0.01)
    return kit.smin(d, toe, 0.012)


def sneaker(M, side=1, laces=True, stripe=True):
    c, (rx, ry, rz) = shoe_frame()
    lo = tuple(c - Vector((rx + 0.03, ry + 0.03, rz + 0.02)))
    hi = tuple(c + Vector((rx + 0.03, ry + 0.03, rz + 0.03)))
    parts = [kit.sdf_mesh("Upper", sneaker_upper, lo, hi, M["shoes"], voxel=0.003, target=900,
                          remesh="decimate"),
             kit.sdf_mesh("Sole", sneaker_sole, lo, hi, M["sole"], voxel=0.003, target=500,
                          remesh="decimate")]
    if laces:
        for i in range(3):
            yl = c.y - 0.02 - i * 0.032
            p = kit.surface_point(sneaker_upper, Vector((0, yl - c.y, 1.0)), centre=c)
            kit_l = kit.tube(f"Lace{i}", [p + Vector((-0.032, 0, -0.004)),
                                          p + Vector((0, 0, 0.004)),
                                          p + Vector((0.032, 0, -0.004))],
                             0.0065, M["lace"], ring=6, cap_rings=2)
            parts.append(kit_l)
    if stripe and "accent" in M:
        for s in (1, -1):
            pts = []
            for t in np.linspace(0.0, 1.0, 7):
                yy = c.y + ry * (0.35 - 0.9 * t)
                zz = c.z - rz * 0.15 + rz * 0.5 * t * (1 - t) * 1.6
                p = kit.surface_point(sneaker_upper, Vector((s, (yy - c.y) / rx, (zz - c.z) / rx)),
                                      centre=c)
                pts.append(p + Vector((s * 0.002, 0, 0)))
            parts.append(kit.tube(f"Stripe{s}", kit.catmull(pts, 10), 0.007, M["accent"], ring=6,
                                  cap_rings=2))
    return parts


def materials(skin=None, shirt=None, pants=None, shoes=None, accent=None):
    return dict(skin=kit.m_skin(skin), shirt=kit.m_shirt(shirt), pants=kit.m_pants(pants),
                shoes=kit.m_shoes(shoes), accent=kit.m_accent(accent or "#FFC93C"),
                sole=kit.flat("Sole", kit.COL["sole"], rough=0.7),
                lace=kit.flat("Laces", "#FFFDF7", rough=0.6))
