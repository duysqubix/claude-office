"""Shared body builders (rig-dimensions.json proportions) for the body-part models and the
presets: torso (pants below the belt, shirt above, split at the chest joint), crew collar,
sleeved upper arm, forearm, mitten, thigh, shin and sneaker. All in their joint's own space
(Blender: Z up, front -Y, character-left +X); `at` / `rot` place them for the presets."""
import math

import bmesh
import bpy
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
    return kit.torso_profile(girth, samples=16)


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


def _deriv(prof, y, eps=0.003):
    def at(v):
        for (r0, a), (r1, b) in zip(prof, prof[1:]):
            if (a - v) * (b - v) <= 0 and a != b:
                return r0 + (r1 - r0) * (v - a) / (b - a)
        return prof[0][0] if v < prof[0][1] else prof[-1][0]
    return (at(y + eps) - at(y - eps)) / (2 * eps)


def lathe_part(name, prof, material, verts=24, at=Vector((0, 0, 0)), normals_from=None):
    """Lathe a (radius, height) profile, squashed front-to-back by TORSO_Z, with the true
    surface normals of `normals_from` (a full profile) as custom normals: two parts cut
    from one surface then shade as one, with no crease at the cut."""
    ref = normals_from or prof
    bm = bmesh.new()
    rings = []
    for i in range(verts):
        a = 2 * math.pi * i / verts
        ring = []
        for r, y in prof:
            ring.append(bm.verts.new((r * math.cos(a), Z * r * math.sin(a), y)))
        rings.append(ring)
    for i in range(verts):
        ra, rb = rings[i], rings[(i + 1) % verts]
        for k in range(len(prof) - 1):
            bm.faces.new((ra[k], rb[k], rb[k + 1], ra[k + 1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    nrm = []
    for v in me.vertices:
        x, yy, h = v.co
        r = math.hypot(x, yy / Z)
        if r < 1e-5:
            nrm.append((0.0, 0.0, 1.0 if h > 0 else -1.0))
            continue
        c, s_ = x / r, (yy / Z) / r
        n = Vector((Z * c, s_, -Z * _deriv(ref, h))).normalized()
        nrm.append(tuple(n))
    me.shade_smooth()
    me.normals_split_custom_set_from_vertices(nrm)
    if material:
        me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    ob.location = tuple(at)
    lib.coll().objects.link(ob)
    return ob


def shell_part(name, prof, material, opening=None, verts=24, grow=0.0, normals_from=None,
               return_edges=False):
    """Like lathe_part, but the surface can leave a clean opening at the front: `opening(y)`
    gives its half-angle in radians at height y (0 = closed). Vertices fan around the back
    from one edge of the opening to the other, so the edge follows the curve exactly.
    `grow` pushes the surface out (a garment over the shirt)."""
    ref = normals_from or prof
    front = -math.pi / 2
    bm = bmesh.new()
    rows = []
    for r, y in prof:
        o = opening(y) if opening else 0.0
        rr = r + grow if r > 0 else 0.0
        if o <= 1e-4:
            angs = [front + 2 * math.pi * i / verts for i in range(verts)]
            closed = True
        else:
            angs = [front + o + (2 * math.pi - 2 * o) * i / verts for i in range(verts + 1)]
            closed = False
        rows.append(([bm.verts.new((rr * math.cos(a), Z * rr * math.sin(a), y)) for a in angs],
                     closed))
    for (ra, ca), (rb, cb) in zip(rows, rows[1:]):
        n = min(len(ra), len(rb))
        last = n if (ca and cb) else n - 1
        for i in range(last):
            j = (i + 1) % n
            bm.faces.new((ra[i], rb[i], rb[j], ra[j]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    if sum((f.calc_center_median().x * f.normal.x + f.calc_center_median().y * f.normal.y)
           for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    nrm = []
    for v in me.vertices:
        x, yy, h = v.co
        r = math.hypot(x, yy / Z)
        if r < 1e-5:
            nrm.append((0.0, 0.0, 1.0 if h > 0 else -1.0))
            continue
        nrm.append(tuple(Vector((Z * x / r, (yy / Z) / r, -Z * _deriv(ref, h))).normalized()))
    me.shade_smooth()
    me.normals_split_custom_set_from_vertices(nrm)
    if material:
        me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    lib.coll().objects.link(ob)
    if not return_edges:
        return ob
    edges = {1: [], -1: []}
    for r, y in prof:
        o = opening(y) if opening else 0.0
        if o > 1e-4:
            rr = r + grow
            for s in (1, -1):
                a = front + s * o
                edges[s].append(Vector((rr * math.cos(a), Z * rr * math.sin(a), y)))
    return ob, edges


def torso(M, girth=1.0, chest_node=True, tuck=True, emblem=True, verts=24):
    """Shirt bean over pants, split at the chest joint: the upper shirt is node `Chest`
    (pivot at chestPivotY) and the lower part ends in a dome so bending never opens a
    hole. Returns (lower parts, chest parts)."""
    prof = _profile(girth)
    lower = []
    # Lower shirt: belt to the chest line, capped with a dome hidden inside the chest.
    low = _slice(prof, BELT_Y - 0.035, CHEST_Y)
    r_top = low[-1][0]
    cap = [(r_top * math.cos(a), CHEST_Y + 0.05 * math.sin(a))
           for a in np.linspace(0.6, math.pi / 2, 2)]
    lower.append(lathe_part("ShirtLow", low, M["shirt"], normals_from=prof, verts=verts))
    lower.append(lathe_part("ShirtCap", [low[-1]] + cap, M["shirt"], verts=verts))
    # Pants: the bottom of the bean, proud of the shirt, with a soft waistband lip.
    pants = _slice(prof, prof[0][1], BELT_Y)
    rb = pants[-1][0] + PANTS_OFF
    pants = [(r + PANTS_OFF if r > 0 else 0.0, y - 0.004) for r, y in pants]
    pants += [(rb + 0.004, BELT_Y + 0.004), (rb + 0.002, BELT_Y + 0.012),
              (rb - 0.012, BELT_Y + 0.014)]
    lower.append(lathe_part("Pants", pants, M["pants"], verts=min(20, verts)))
    up = _slice(prof, CHEST_Y, prof[-1][1])
    chest = [lathe_part("ShirtUp", up, M["shirt"], normals_from=prof, verts=verts)]
    if emblem and "accent" in M:
        # A little round print on the left chest, like Wobbly Life's tops.
        p, n = torso_surface(0.085 * girth, 0.2, girth)
        chest.append(lib.cyl("Emblem", 0.026, 0.006, tuple(p + n * 0.001), M["accent"],
                             r=0.002, seg=1, verts=18, rot=align_z(n)))
    if chest_node:
        for ob in chest:
            lib.node(ob, "Chest", pivot=(0, 0, CHEST_Y))
    return lower, chest


_PROF_CACHE = {}


def torso_r(y, girth=1.0):
    """Vectorised shirt-bean radius at heights y (numpy array, pelvis space)."""
    key = round(girth, 3)
    if key not in _PROF_CACHE:
        prof = kit.torso_profile(girth, samples=200)
        _PROF_CACHE[key] = (np.array([p[1] for p in prof]), np.array([p[0] for p in prof]))
    ys, rs = _PROF_CACHE[key]
    return np.interp(y, ys, rs)


def surface_patch(name, material, x_half, y0, y1, out=0.007, thick=0.011, rnd=0.025,
                  x_c=0.0, girth=1.0, target=320, carve=None, radius_fn=None):
    """A rounded-rectangle panel (pocket, apron bib, vest panel) lying on the front of the
    shirt bean, `out` metres proud of it, following its curve. `carve(P)` may cut it."""
    def fn(P):
        x, y = P[:, 0], P[:, 2]
        qx = np.abs(x - x_c) - (x_half - rnd)
        qy = np.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - rnd)
        d2 = (np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) +
              np.minimum(np.maximum(qx, qy), 0) - rnd)
        r = (radius_fn(y) if radius_fn else torso_r(np.clip(y, -0.15, 0.4), girth))
        surf = -Z * np.sqrt(np.maximum(r * r - x * x, 0.0)) - out
        d = kit.smax(d2, np.abs(P[:, 1] - surf) - thick / 2, 0.004)
        return kit.smax(d, carve(P), 0.003) if carve else d
    lo = (x_c - x_half - 0.02, -0.34, y0 - 0.02)
    hi = (x_c + x_half + 0.02, -0.05, y1 + 0.02)
    return kit.sdf_mesh(name, fn, lo, hi, material, voxel=0.0025, target=target,
                        remesh="decimate")


def band(name, y0, y1, radius, material, verts=24, bulge=0.004):
    """A smooth rolled band (hem) of the given radius between heights y0 and y1."""
    ym = (y0 + y1) / 2
    prof = [(radius - 0.005, y0), (radius, y0 + 0.006), (radius + bulge, ym),
            (radius, y1 - 0.006), (radius - 0.005, y1)]
    return lathe_part(name, prof, material, verts=verts)


def ribbed_band(name, y0, y1, radius_fn, material, n=40, amp=0.0035, rows=4):
    """A knitted band (hem, cuff): a short tube whose radius ripples round in n ribs.
    radius_fn(y) gives the base radius; the ends roll in a little."""
    bm = bmesh.new()
    rings = []
    for k in range(rows + 1):
        t = k / rows
        y = y0 + (y1 - y0) * t
        roll = math.sin(math.pi * t) ** 0.5
        base = radius_fn(y) - 0.004 * (1 - roll)
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            r = base + amp * (1 if i % 2 == 0 else -1) * roll
            ring.append(bm.verts.new((r * math.cos(a), Z * r * math.sin(a), y)))
        rings.append(ring)
    for ra, rb in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((ra[i], ra[j], rb[j], rb[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    if sum(f.calc_center_median().x * f.normal.x + f.calc_center_median().y * f.normal.y
           for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return lib._link(name, bm, material)


def torso_surface(x, y, girth=1.0, back=False):
    """(point, outward normal) on the shirt bean at offset x, height y (pelvis space),
    on the front (or the back)."""
    r = kit.torso_radius_at(y, girth)
    e = 0.004
    dr = (kit.torso_radius_at(y + e, girth) - kit.torso_radius_at(y - e, girth)) / (2 * e)
    yy = Z * math.sqrt(max(0.0, r * r - x * x)) * (1 if back else -1)
    p = Vector((x, yy, y))
    n = Vector((x / max(r, 1e-6), yy / (Z * Z * max(r, 1e-6)), -dr)).normalized()
    return p, n


def align_z(n):
    """Euler turning local +Z onto n (discs, cylinders standing on a surface)."""
    return Vector((0, 0, 1)).rotation_difference(Vector(n)).to_euler()


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


def crew_collar(M, girth=1.0, n=24, ring=6):
    """A rolled crew neckline where the head meets the shirt."""
    return kit.ring_tube("Collar", neck_ring(girth, n=n, out=0.004), 0.013, M["shirt"], ring=ring)


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
    parts.append(kit.ring_tube("Hem", [Vector(((r + 0.006) * math.cos(a),
                                               (r + 0.006) * math.sin(a), -cut))
                                       for a in np.linspace(0, 2 * math.pi, 16, endpoint=False)],
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
    parts = [kit.sdf_mesh("Upper", sneaker_upper, lo, hi, M["shoes"], voxel=0.003, target=820,
                          remesh="decimate"),
             kit.sdf_mesh("Sole", sneaker_sole, lo, hi, M["sole"], voxel=0.003, target=420,
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
            parts.append(kit.tube(f"Stripe{s}", kit.catmull(pts, 8), 0.007, M["accent"], ring=5,
                                  cap_rings=2))
    return parts


def boot_upper(P):
    c, (rx, ry, rz) = shoe_frame()
    foot = kit.sd_ellipsoid(P, tuple(c + Vector((0, 0.004, 0.006))), (rx, ry * 0.96, rz))
    toe = kit.sd_ellipsoid(P, tuple(c + Vector((0, -ry * 0.45, -0.004))),
                           (rx * 0.99, ry * 0.52, rz * 0.86))
    shaft = kit.sd_round_cone(P, (0, 0.012, -0.03), (0, 0.006, 0.075), 0.09, 0.086)
    d = kit.smin(kit.smin(foot, toe, 0.03), shaft, 0.04)
    d = kit.smax(d, P[:, 2] - 0.072, 0.012)                      # open top
    return kit.smax(d, (c.z - rz + 0.026) - P[:, 2], 0.01)       # sits on the sole


def boot_sole(P):
    c, (rx, ry, rz) = shoe_frame()
    floor = c.z - rz
    d = kit.sd_ellipsoid(P, tuple(c + Vector((0, 0.0, 0.0))), (rx + 0.01, ry + 0.012, rz))
    d = kit.smax(d, floor - P[:, 2], 0.006)
    d = kit.smax(d, P[:, 2] - (floor + 0.03), 0.006)
    # A chunky heel block under the back.
    heel = kit.sd_round_box(P, tuple(Vector((0, c.y + ry * 0.55, floor + 0.022))),
                            (rx * 0.8, ry * 0.3, 0.022), 0.012)
    return kit.smin(d, heel, 0.008)


def boot(M):
    c, (rx, ry, rz) = shoe_frame()
    lo = tuple(c - Vector((rx + 0.03, ry + 0.03, rz + 0.02)))
    hi = (rx + 0.03, ry + 0.06, 0.1)
    parts = [kit.sdf_mesh("BootUpper", boot_upper, lo, hi, M["shoes"], voxel=0.003, target=900,
                          remesh="decimate"),
             kit.sdf_mesh("BootSole", boot_sole, lo, hi, M["sole"], voxel=0.003, target=380,
                          remesh="decimate")]
    # Laces criss-crossing up the front of the shaft and the instep.
    for i, z in enumerate((-0.035, -0.005, 0.025, 0.052)):
        p = kit.surface_point(boot_upper, Vector((0, -1.0, (z + 0.0) * 3.0)), centre=(0, 0.01, z))
        parts.append(kit.tube(f"Lace{i}", [p + Vector((-0.03, 0.004, -0.006)),
                                            p + Vector((0, -0.003, 0.004)),
                                            p + Vector((0.03, 0.004, -0.006))],
                              0.0055, M["lace"], ring=5, cap_rings=1))
    # Padded collar round the top and a pull tab at the back.
    pts = [Vector((0.088 * math.cos(a), 0.008 + 0.086 * math.sin(a), 0.066))
           for a in np.linspace(0, 2 * math.pi, 18, endpoint=False)]
    parts.append(kit.ring_tube("Collar", pts, 0.012, M["shoes"], ring=6))
    parts.append(lib.rbox("PullTab", (0.03, 0.012, 0.04), (0, 0.1, 0.08), M["lace"], r=0.006,
                          seg=1))
    return parts


def materials(skin=None, shirt=None, pants=None, shoes=None, accent=None):
    return dict(skin=kit.m_skin(skin), shirt=kit.m_shirt(shirt), pants=kit.m_pants(pants),
                shoes=kit.m_shoes(shoes), accent=kit.m_accent(accent or "#FFC93C"),
                sole=kit.flat("Sole", kit.COL["sole"], rough=0.7),
                lace=kit.flat("Laces", "#FFFDF7", rough=0.6))
