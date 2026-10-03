"""Claude Lorrain's helpers for the building, outdoor and plant models, on top of lib.py.

- finalize(): lib's join (lib.node tags) → AO bake → WebP export → preview → sidecar, plus
  the knobs lib.finalize lacks: AO strength, baking with no ground plane (sky things, wall
  openings) and lifting sky things off the preview floor.
- Faceted nature (ART-DIRECTION: smooth people against faceted nature): low-poly icosphere
  puffs, pine tiers, clipped blocks, mottled facets. Man-made things stay bevelled and soft.
- Plants: trunks, tubes, leaf blades, monstera/pothos fan leaves, pinnate fronds, flowers.
- Text: Arial Rounded Bold as a mesh, with an outline offset for two-tone sign letters.

Conventions are lib's: metres, Z-up, front faces -Y, origin at the floor-contact point.
"""
import json
import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

import lib

FONT = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"

# Palette entries lib.P doesn't carry (client/src/style/palette.ts, sRGB hex).
P = dict(
    lib.P,
    grass="#7ED957",
    grassDark="#5FBF45",
    path="#F2E3C6",
    treeTrunk="#9C6B43",
    cloud="#E6F4FC",  # Clouds are faintly blue (ART-DIRECTION §3.1)
    wallAccent="#8FE0C8",
    glass="#BFE9FF",
    doorFrame="#3F4A5C",
    stone="#D9D2C5",
    soil="#7A5236",
    water="#6FD3F7",
    # Flower heads, matching the procedural garden in client/src/world/outdoor.ts.
    flowers=["#FF7EB6", "#FFD93D", "#FFF8F0", "#FF6B6B", "#B983FF"],
    # Warm, saturated pinks: paler ones turn lilac under the blue sky light.
    blossom=["#FFA3CD", "#FF86BF", "#FFBAD9"],
)

ARTIST = "Claude Lorrain"

# Sizes shared with the procedural world (door, windows, walls): build to these, so a change
# there is one rebuild away.
with open(os.path.join(lib.ROOT, "client", "src", "world", "dimensions.json")) as _f:
    DIMS = json.load(_f)


def rng(seed):
    return random.Random(seed)


# ---------------------------------------------------------------- materials

def glow(name, hex_str, strength=2.0):
    """Lamp glass / indicator: emissive in its own colour."""
    return lib.mat(name, hex_str, rough=0.4, emit=hex_str, strength=strength)


# ---------------------------------------------------------------- shapes

def icoblob(name, r, loc=(0, 0, 0), material=None, scale=(1, 1, 1), subdiv=2, rot=(0, 0, 0),
            lump=0.0, seed=0, flat=None):
    """Faceted low-poly puff (our faceted nature): an icosphere with lumpy noise, flat shaded.
    `flat` squashes everything below that local z (fraction of r) so a puff can sit on the
    ground. Records the radius safely inside it for cull_hidden()."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    off = Vector((seed * 7.31, seed * 3.17, seed * 5.53))
    for v in bm.verts:
        d = v.co.normalized()
        k = 1.0 + (lump * noise.noise(d * 1.6 + off) if lump else 0.0)
        p = d * r * k
        if flat is not None and p.z < flat * r:
            p.z = flat * r + (p.z - flat * r) * 0.25
        v.co = p
    ob = lib._link(name, bm, material, loc, rot, smooth=False)
    ob.scale = scale
    ob["r_in"] = r * (1 - lump) * 0.92 * (1.0 if flat is None else min(1.0, abs(flat) + 0.1))
    return ob


def puff_cluster(prefix, puffs, mats, lump=0.1, seed=0, ground=0.0, scale=(1, 1, 1)):
    """Faceted foliage: puffs [(x, y, z, radius, material index)] as lumpy low-poly
    icospheres (big ones a level finer); any that dip below `ground` get a flat bottom there.
    Faces buried inside neighbours are culled."""
    obs = []
    for i, (x, y, z, r, k) in enumerate(puffs):
        low = z - r * scale[2]
        flat = (ground - z) / (r * scale[2]) + 0.02 if low < ground else None
        obs.append(icoblob(f"{prefix}{i}", r * 1.03, (x, y, z), mats[k], scale=scale,
                           subdiv=3 if r > 1.0 else 2, lump=lump, seed=seed + i + 1, flat=flat))
    cull_hidden(obs)
    return obs


def metaball_mesh(name, balls, material, resolution=0.08, threshold=0.6, stiffness=2.0,
                  flat=None, smooth=4):
    """One soft merged surface from metaballs [(x, y, z, radius)], converted to a mesh.
    `flat` presses everything below that z up into a flat belly (clouds)."""
    mb = bpy.data.metaballs.new(name + "_mb")
    mb.resolution = mb.render_resolution = resolution
    mb.threshold = threshold
    for x, y, z, r in balls:
        el = mb.elements.new()
        el.co = (x, y, z)
        el.radius = r
        el.stiffness = stiffness
    tmp = bpy.data.objects.new(name + "_mb", mb)
    lib.coll().objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg), depsgraph=dg)
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.metaballs.remove(mb)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=resolution * 0.05)
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True,
                              use_axis_y=True, use_axis_z=True)
    if flat is not None:
        for v in bm.verts:
            if v.co.z < flat:
                v.co.z = flat + (v.co.z - flat) * 0.15
    return lib._link(name, bm, material)


def puff_surface(puffs, direction, origin):
    """Where a ray from inside a puff cluster leaves its outer surface: the farthest exit among
    the puffs [(x, y, z, radius, ...)] it passes through. For dotting blooms over a bush."""
    d = Vector(direction).normalized()
    o = Vector(origin)
    best = 0.0
    for x, y, z, r, *_ in puffs:
        oc = o - Vector((x, y, z))
        b = oc.dot(d)
        disc = b * b - (oc.dot(oc) - r * r)
        if disc > 0:
            best = max(best, -b + math.sqrt(disc))
    return o + d * best


def cull_hidden(objs, margin=0.97):
    """Delete faces of each puff that sit entirely inside another puff of `objs`: fewer
    tris on export and no AO texels wasted on the inside of a canopy."""
    bpy.context.view_layer.update()  # fresh objects' matrix_world is still identity
    info = [(o, o.matrix_world.copy(), o.matrix_world.inverted(), o.get("r_in", 0) * margin)
            for o in objs]
    for o, mw, _, _ in info:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        inside = set()
        for v in bm.verts:
            w = mw @ v.co
            if any(o2 is not o and r2 > 0 and (inv2 @ w).length < r2 for o2, _, inv2, r2 in info):
                inside.add(v.index)
        dead = [f for f in bm.faces if all(v.index in inside for v in f.verts)]
        bmesh.ops.delete(bm, geom=dead, context="FACES")
        bm.to_mesh(o.data)
        bm.free()


def tube(name, p0, p1, r0, r1=None, material=None, verts=12, round_ends=True):
    """Tapered limb from p0 to p1 (world points). Ends get a small dome so joints read soft."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    r1 = r0 if r1 is None else r1
    length = d.length
    prof = [(0.0, 0.0)] if not round_ends else [(0.0, -r0 * 0.35), (r0 * 0.75, -r0 * 0.22)]
    prof += [(r0, 0.0), (r1, length)]
    prof += [(0.0, length)] if not round_ends else [(r1 * 0.75, length + r1 * 0.22),
                                                     (0.0, length + r1 * 0.35)]
    ob = lib.lathe(name, prof, loc=tuple(p0), material=material, verts=verts,
                   rot=d.to_track_quat("Z", "Y").to_euler())
    ob.data.shade_smooth()
    return ob


def trunk(name, profile, material, verts=14, bend=(0.0, 0.0), seed=0, lumps=0.0, roots=0,
          root_amp=0.0, root_h=0.4):
    """Lathe a (radius, z) profile, then lean it: x += bend[0]·t², y += bend[1]·t² (t = z/top).
    `lumps` adds a gentle noise to the radius so the bark doesn't look turned on a lathe;
    `roots` lobes swell the foot into soft buttress roots that fade out by `root_h`."""
    ob = lib.lathe(name, profile, material=material, verts=verts)
    top = max(z for _, z in profile)
    off = Vector((seed * 1.7, seed * 2.9, 0))
    for v in ob.data.vertices:
        t = max(v.co.z, 0) / top
        rr = Vector((v.co.x, v.co.y, 0))
        if rr.length > 1e-5:
            k = 1.0
            if lumps:
                k += lumps * noise.noise(Vector((v.co.x * 3, v.co.y * 3, v.co.z * 1.2)) + off)
            if roots and v.co.z < root_h:
                a = math.atan2(v.co.y, v.co.x) + seed
                lobe = (0.5 + 0.5 * math.cos(roots * a)) ** 1.5
                k += root_amp * lobe * (1 - v.co.z / root_h) ** 2.2
            v.co.x, v.co.y = v.co.x * k, v.co.y * k
        v.co.x += bend[0] * t * t
        v.co.y += bend[1] * t * t
    return ob


def skirt(name, radius, height, z0, material, verts=40, scallops=0, amp=0.0, droop=0.0,
          tip=0.22, phase=0.0):
    """Pine tier: a faceted cone with a slightly tucked-under hem. `scallops` waves the hem in
    and out (amp, fraction of radius) and dips it (droop, metres) at each lobe; with two
    vertices per scallop the hem zig-zags like a low-poly fir."""
    R, h = radius, height
    prof = [(0.0, z0 + 0.12 * h), (R * 0.55, z0 + 0.03 * h), (R * 0.88, z0 - 0.005),
            (R * 0.98, z0 + 0.03 * h), (R, z0 + 0.09 * h), (R * 0.93, z0 + 0.2 * h),
            (R * 0.62, z0 + 0.5 * h), (R * tip * 1.35, z0 + 0.86 * h), (R * tip, z0 + 0.95 * h),
            (R * tip * 0.55, z0 + 0.995 * h), (0.0, z0 + h)]
    ob = lib.lathe(name, prof, material=material, verts=verts)
    ob.data.shade_flat()
    if scallops:
        for v in ob.data.vertices:
            rr = math.hypot(v.co.x, v.co.y)
            if rr < 1e-5:
                continue
            w = max(0.0, min(1.0, (rr / R - 0.45) / 0.45))  # 0 up the cone, 1 at the hem
            wave = math.cos(scallops * math.atan2(v.co.y, v.co.x) + phase)
            k = 1 + amp * wave * w
            v.co.x, v.co.y = v.co.x * k, v.co.y * k
            v.co.z -= droop * (0.5 + 0.5 * wave) * w * w
    return ob


def lobed_disc(name, r, thick, lobes, amp, loc=(0, 0, 0), material=None, rot=(0, 0, 0),
               cup=0.0, verts=None, sharp=0.6):
    """Flower head / leaf rosette: a plump disc whose rim swells into `lobes` round petals
    (amp = notch depth as a fraction of r), cupped up by `cup` metres at the rim."""
    verts = verts or lobes * 4
    prof = [(0.0, thick * 0.5), (r * 0.6, thick * 0.42), (r * 0.92, thick * 0.2), (r, 0.0),
            (r * 0.85, -thick * 0.32), (0.0, -thick * 0.5)]
    ob = lib.lathe(name, prof, material=material, verts=verts)
    for v in ob.data.vertices:
        rho = math.hypot(v.co.x, v.co.y)
        if rho < 1e-6:
            continue
        a = math.atan2(v.co.y, v.co.x)
        petal = (0.5 + 0.5 * math.cos(lobes * a)) ** sharp
        k = 1 - amp + amp * petal
        f = min(1.0, rho / r)
        k = 1 + (k - 1) * f
        v.co.x, v.co.y = v.co.x * k, v.co.y * k
        v.co.z += cup * (rho * k / r) ** 2
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def flower(prefix, loc, petal_mat, centre_mat, r=0.06, lobes=5, face=(0.0, 0.0), spin=0.0,
           cup=0.012):
    """Cartoon flower: lobed petal disc with a domed centre, about 210 tris. It faces up,
    spun by `spin` about its own axis, then tipped toward -Y by face[0] and toward +X by
    face[1] (radians)."""
    R = (Matrix.Rotation(face[0], 3, "X") @ Matrix.Rotation(face[1], 3, "Y")
         @ Matrix.Rotation(spin, 3, "Z"))
    rot = R.to_euler()
    lobed_disc(prefix + "Petals", r, r * 0.28, lobes, 0.42, loc, petal_mat, rot, cup=cup)
    c = Vector(loc) + R @ Vector((0, 0, r * 0.14 + cup * 0.2))
    lib.sphere(prefix + "Centre", r * 0.36, tuple(c), centre_mat, scale=(1, 1, 0.62), u=7, v=4,
               rot=rot)


def star_flower(name, loc, r, material, petals=5, normal=(0, 0, 1), spin=0.0):
    """Budget flower head for scatter (wildflowers, blossoms): a flat flower of round petals
    (narrow at the root, widest near the tip), 6 triangles per petal, facing `normal`. Give it
    a double-sided material."""
    n = Vector(normal).normalized()
    R = n.to_track_quat("Z", "Y").to_matrix() @ Matrix.Rotation(spin, 3, "Z")
    c0 = Vector(loc)
    bm = bmesh.new()
    centre = bm.verts.new(tuple(c0 + R @ Vector((0, 0, r * 0.12))))
    ring = []
    step = 2 * math.pi / petals
    for i in range(petals):
        a = step * i
        for da, rr in ((-0.2, 0.36), (-0.44, 0.78), (-0.24, 1.0), (0.24, 1.0), (0.44, 0.78),
                       (0.2, 0.36)):
            da *= step
            b = a + da
            ring.append(bm.verts.new(tuple(c0 + R @ Vector((r * rr * math.cos(b),
                                                            r * rr * math.sin(b), 0.0)))))
    for i in range(len(ring)):
        bm.faces.new((centre, ring[i], ring[(i + 1) % len(ring)]))
    return lib._link(name, bm, material, smooth=False)


def paver(name, rx, ry, material, seed=0, sides=9, top=0.025, depth=0.03, chamfer=0.012):
    """Flat faceted stepping stone: an irregular rounded outline (rx × ry), a gently domed top
    with a chamfered rim, and sides sunk `depth` into the lawn (no bottom face): 5 tris per
    side. Centred on the origin, top `top` above the ground."""
    r = rng(seed)
    pts = []
    for i in range(sides):
        a = 2 * math.pi * i / sides + r.uniform(-0.2, 0.2)
        k = 1 + r.uniform(-0.16, 0.1)
        pts.append((rx * k * math.cos(a), ry * k * math.sin(a)))
    bm = bmesh.new()
    centre = bm.verts.new((0.0, 0.0, top + 0.006))
    inner = [bm.verts.new((x * 0.92, y * 0.92, top)) for x, y in pts]
    outer = [bm.verts.new((x, y, top - chamfer)) for x, y in pts]
    foot = [bm.verts.new((x * 1.02, y * 1.02, -depth)) for x, y in pts]
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((centre, inner[i], inner[j]))
        bm.faces.new((inner[i], outer[i], outer[j], inner[j]))
        bm.faces.new((outer[i], foot[i], foot[j], outer[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lib._link(name, bm, material, smooth=False)


def double_sided(m):
    """A thin cloth / petal material, visible from both sides."""
    m.use_backface_culling = False
    return m


def _orient(yaw, pitch, roll=0.0):
    """Local frame for leaves: +Y along the leaf, tipped up by `pitch`, headed by `yaw`."""
    return (Matrix.Rotation(yaw, 3, "Z") @ Matrix.Rotation(pitch, 3, "X")
            @ Matrix.Rotation(roll, 3, "Y"))


def blade(name, base, yaw, pitch, length, width, thick, material, droop=0.0, segs=8,
          tip=0.0, base_w=0.25, roll=0.0, scallops=0, scallop_amp=0.0, curl=0.0, belly=0.4):
    """Leaf blade with a lens-shaped section (raised midrib, thin rims): grass, sword leaves,
    tulip leaves, fern fronds. It grows from `base` along local +Y (tipped up by `pitch`,
    headed by `yaw`), sags by droop·length·t², and is widest at t = `belly`. `tip` keeps a
    rounded tip (fraction of width); `scallops` notch the rims for fern-like fronds; `curl`
    folds the rims up (V section) by that many metres."""
    R = _orient(yaw, pitch, roll)
    b = Vector(base)
    bm = bmesh.new()
    rows = []
    for i in range(segs + 1):
        t = i / segs
        if t <= belly:
            sh = base_w + (1 - base_w) * math.sin(0.5 * math.pi * t / belly)
        else:
            u = (t - belly) / (1 - belly)
            sh = tip + (1 - tip) * math.cos(0.5 * math.pi * u) ** 0.8
        if scallops:
            sh *= 1 - scallop_amp + scallop_amp * abs(math.sin(scallops * math.pi * t))
        w = width * sh / 2
        th = thick * max(sh, 0.3) / 2
        c = Vector((0.0, t * length, -droop * length * t * t))
        # Tangent-ish normal of the sagging centre line, for the thickness offset.
        n = Vector((0.0, 2 * droop * t, 1.0)).normalized()
        left = c + Vector((-w, 0, curl * sh))
        right = c + Vector((w, 0, curl * sh))
        top = c + n * th
        bot = c - n * th
        rows.append([bm.verts.new(tuple(b + R @ p)) for p in (left, top, right, bot)])
    for i in range(segs):
        a, z = rows[i], rows[i + 1]
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], z[(k + 1) % 4], z[k]))
    bm.faces.new(list(reversed(rows[0])))
    if tip == 0.0:
        bmesh.ops.pointmerge(bm, verts=rows[-1], merge_co=rows[-1][1].co)
    else:
        bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lib._link(name, bm, material)


def fan_leaf(name, base, yaw, pitch, length, material, slits=(), slit_depth=0.55,
             slit_w=0.07, thick=0.018, droop=0.25, cup=0.0, samples=64, rings=3, roll=0.0,
             back=0.18, pointy=0.9):
    """Heart-shaped leaf around its petiole point (a cardioid: long ahead, notched behind),
    with V slits radiating from the petiole at the given angles (radians from the midrib):
    a cartoon monstera leaf. Droops toward the rim; `cup` lifts the sides; a higher `pointy`
    sharpens the tip (pothos hearts)."""
    R = _orient(yaw, pitch, roll)
    b = Vector(base)
    bm = bmesh.new()

    def rho(phi):
        r = length * (back + (1 - back) * (0.5 + 0.5 * math.cos(phi)) ** pointy)
        for s in slits:
            d = (phi - s + math.pi) % (2 * math.pi) - math.pi
            r *= 1 - slit_depth * math.exp(-(d / slit_w) ** 2)
        return r

    def point(phi, f, side):
        rr = rho(phi) * f
        x, y = rr * math.sin(phi), rr * math.cos(phi)
        z = -droop * length * (rr / length) ** 2 + cup * (x / length) ** 2 * length
        z += side * thick * 0.5 * (1 - f ** 2)
        return b + R @ Vector((x, y + length * 0.12, z))

    phis = [2 * math.pi * j / samples - math.pi for j in range(samples)]
    top_c = bm.verts.new(tuple(point(0, 0, 1)))
    bot_c = bm.verts.new(tuple(point(0, 0, -1)))
    tops, bots = [], []
    for k in range(1, rings + 1):
        f = k / rings
        tops.append([bm.verts.new(tuple(point(p, f, 1))) for p in phis[:]])
        if k < rings:
            bots.append([bm.verts.new(tuple(point(p, f, -1))) for p in phis])
    bots.append(tops[-1])  # top and bottom share the rim
    n = samples
    for surf, centre, flip in ((tops, top_c, False), (bots, bot_c, True)):
        for j in range(n):
            q = (centre, surf[0][j], surf[0][(j + 1) % n])
            bm.faces.new(q[::-1] if flip else q)
        for k in range(rings - 1):
            for j in range(n):
                q = (surf[k][j], surf[k + 1][j], surf[k + 1][(j + 1) % n], surf[k][(j + 1) % n])
                bm.faces.new(q[::-1] if flip else q)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lib._link(name, bm, material)


def pinnate_frond(prefix, start, yaw, pitch, length, sag, rachis_mat, leaf_mats, pairs=9,
                  leaflet=(0.1, 0.2), width=0.04, spread=0.85, rachis_r=0.012, segs=3,
                  fall=0.35, seed=0):
    """Palm / fern frond: a sagging rachis (tube) with `pairs` of slim leaflet blades, longest
    mid-frond (leaflet = (min, extra) length). Leaflets angle forward and out by `spread`
    and hang by `fall`."""
    d = Vector((-math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch),
                math.sin(pitch)))
    S = Vector(start)
    pts = [S + d * length * t + Vector((0, 0, -sag * t * t)) for t in (k / 7 for k in range(8))]
    sweep_tube(prefix + "Rachis", pts, rachis_r, rachis_mat, verts=6, r_end=rachis_r * 0.4)
    across = Vector((math.cos(yaw), math.sin(yaw), 0))
    for k in range(1, pairs + 1):
        t = k / (pairs + 1)
        p = S + d * length * t + Vector((0, 0, -sag * t * t))
        tangent = (d * length + Vector((0, 0, -2 * sag * t))).normalized()
        ll = leaflet[0] + leaflet[1] * math.sin(math.pi * (0.15 + 0.85 * t)) * (1 - 0.3 * t)
        for sgn in (-1, 1):
            out = (tangent * 0.55 + across * sgn * spread).normalized()
            out.z -= fall
            out.normalize()
            blade(f"{prefix}L{k}{'ab'[sgn > 0]}", tuple(p), math.atan2(-out.x, out.y),
                  math.asin(max(-1.0, min(1.0, out.z))), ll, width, width * 0.2,
                  leaf_mats[(seed + k) % len(leaf_mats)], droop=0.25, segs=segs, base_w=0.3,
                  belly=0.35, roll=sgn * 0.5)


def tulip(prefix, loc, material, r=0.05, rot=(0, 0, 0)):
    """Tulip head: a plump egg cup whose rim rises into three rounded petal tips."""
    prof = [(0.0, 0.0), (r * 0.55, r * 0.12), (r * 0.92, r * 0.55), (r, r * 1.05),
            (r * 0.82, r * 1.55), (r * 0.5, r * 1.72), (r * 0.25, r * 1.45), (0.0, r * 1.38)]
    ob = lib.lathe(prefix + "Head", prof, material=material, verts=15)
    for v in ob.data.vertices:
        if v.co.z > r * 1.2:
            a = math.atan2(v.co.y, v.co.x)
            v.co.z += r * 0.38 * (0.5 + 0.5 * math.cos(3 * a)) ** 2 * (v.co.z / (r * 1.72))
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def sweep_tube(name, pts, r, material=None, verts=10, r_end=None, caps=True, closed=False):
    """Round tube swept along a polyline of world points (parallel-transport frames), radius
    tapering linearly to `r_end`; domed caps at open ends. For bent rails, frames, ropes."""
    P = [Vector(p) for p in pts]
    n = len(P)
    r_end = r if r_end is None else r_end
    T = []
    for i in range(n):
        if closed:
            d = P[(i + 1) % n] - P[i - 1]
        else:
            d = P[min(i + 1, n - 1)] - P[max(i - 1, 0)]
        T.append(d.normalized())
    up = Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0))
    N = [T[0].cross(up).normalized()]
    for i in range(1, n):
        q = T[i - 1].rotation_difference(T[i])
        N.append((q @ N[-1]).normalized())
    bm = bmesh.new()
    rings = []
    total = sum((P[i + 1] - P[i]).length for i in range(n - 1)) or 1.0
    acc = 0.0
    for i in range(n):
        if i:
            acc += (P[i] - P[i - 1]).length
        rr = r + (r_end - r) * acc / total
        B = T[i].cross(N[i])
        rings.append([bm.verts.new(tuple(P[i] + rr * (math.cos(a) * N[i] + math.sin(a) * B)))
                      for a in (2 * math.pi * k / verts for k in range(verts))])
    segs = n if closed else n - 1
    for i in range(segs):
        a, b = rings[i], rings[(i + 1) % n]
        for k in range(verts):
            bm.faces.new((a[k], a[(k + 1) % verts], b[(k + 1) % verts], b[k]))
    if caps and not closed:
        for idx, sign, rr in ((0, -1, r), (n - 1, 1, r_end)):
            ring = rings[idx]
            tip = bm.verts.new(tuple(P[idx] + T[idx] * sign * rr * 0.6))
            for k in range(verts):
                f = (ring[k], ring[(k + 1) % verts], tip)
                bm.faces.new(f if sign > 0 else f[::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lib._link(name, bm, material)


def extrude_outline(name, pts, depth, loc=(0, 0, 0), material=None, bevel=0.01, bseg=2,
                    rot=(0, 0, 0)):
    """Board cut from a 2D outline [(x, z)] standing in the XZ plane, `depth` thick along Y,
    edges softened by a bevel: pickets, flags, signs."""
    bm = bmesh.new()
    front = [bm.verts.new((x, -depth / 2, z)) for x, z in pts]
    back = [bm.verts.new((x, depth / 2, z)) for x, z in pts]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    k = len(pts)
    for i in range(k):
        j = (i + 1) % k
        bm.faces.new((front[j], front[i], back[i], back[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = lib._link(name, bm, material, loc, rot)
    if bevel > 0:
        lib.bevel(ob, min(bevel, depth * 0.45), bseg, angle=30)
    return ob


def faceted_block(name, size, loc=(0, 0, 0), material=None, cuts=5, power=6.0, jitter=0.04,
                  seed=0, freq=2.2):
    """Low-poly rounded block (faceted nature: clipped hedges, boulders): a subdivided cube
    pushed onto a superellipsoid (higher `power` = boxier) with noisy vertices, flat shaded.
    `size` is full extents; it sits on loc's z (bottom at loc.z)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    half = Vector(size) / 2
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    for v in bm.verts:
        q = v.co.copy()
        k = sum(abs(c) ** power for c in q) ** (-1.0 / power)
        q *= k
        d = q.normalized()
        w = Vector((q.x * half.x, q.y * half.y, q.z * half.z))
        w += Vector((d.x / half.x, d.y / half.y, d.z / half.z)).normalized() * jitter * \
            noise.noise(w * freq + off)
        v.co = Vector((w.x, w.y, max(0.0, w.z + half.z)))
    return lib._link(name, bm, material, loc, smooth=False)


def paint_up(ob, material, min_nz=0.7, min_z=None):
    """Give the upward-facing faces of `ob` another material (moss on rocks, sunlit tops)."""
    me = ob.data
    if material.name not in me.materials:
        me.materials.append(material)
    idx = list(me.materials).index(material)
    for p in me.polygons:
        if p.normal.z > min_nz and (min_z is None or p.center.z > min_z):
            p.material_index = idx
    return ob


def mottle(ob, materials, weights=None, seed=0, where=None):
    """Scatter faces of `ob` across `materials` (a cheap leafy texture for faceted foliage).
    `where(poly)` limits which faces are touched."""
    me = ob.data
    for m in materials:
        if m.name not in me.materials:
            me.materials.append(m)
    idx = [list(me.materials).index(m) for m in materials]
    r = rng(seed)
    for p in me.polygons:
        if where is None or where(p):
            p.material_index = r.choices(idx, weights=weights)[0]
    return ob


def wall_window(M, w, h, transom=None, wall_t=0.3):
    """Window unit for a w × h wall opening, origin at the bottom centre (the sill line),
    centred in the wall: a soft round-cornered frame ring wrapping the opening, a chunky
    vertical mullion, a transom bar at `transom` × h if given, a deep sill ledge on both faces
    and one glass pane. M needs "trim", "sill" and "glass" materials. Mirrors the procedural
    windows in client/src/world/building.ts."""
    depth = wall_t + 0.08
    rr_ring("Frame", (w + 0.22, h + 0.22, 0.17), (w - 0.08, h - 0.08, 0.1), depth,
            (0, 0, h / 2), M["trim"], seg=8, bevel=0.035)
    lib.rbox("MullionV", (0.12, 0.13, h - 0.04), (0, 0, h / 2), M["trim"], r=0.02, seg=2)
    if transom is not None:
        lib.rbox("MullionH", (w - 0.04, 0.12, 0.1), (0, 0, h * transom), M["trim"], r=0.02,
                 seg=2)
    rr_prism("SillLedge", w + 0.36, wall_t + 0.26, 0.075, 0.06, (0, 0, -0.07), M["sill"],
             seg=5, bevel=0.03, bseg=3)
    lib.rbox("Glass", (w - 0.06, 0.02, h - 0.06), (0, 0, h / 2), M["glass"], r=0.006, seg=1)


def rr_points(w, h, r, seg=6):
    """Rounded-rectangle outline, centred, counter-clockwise: 4 · (seg + 1) points."""
    r = max(1e-4, min(r, w / 2 - 1e-4, h / 2 - 1e-4))
    pts = []
    for cx, cy, a0 in ((w / 2 - r, -h / 2 + r, -90), (w / 2 - r, h / 2 - r, 0),
                       (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def rr_prism(name, w, d, h, r, loc=(0, 0, 0), material=None, seg=6, bevel=0.01, bseg=2,
             rot=(0, 0, 0)):
    """Slab with rounded corners in plan: w (x) × d (y) × h (z), centred on loc. The top and
    bottom rims get a soft bevel."""
    bm = bmesh.new()
    pts = rr_points(w, d, r, seg)
    bot = [bm.verts.new((x, y, -h / 2)) for x, y in pts]
    top = [bm.verts.new((x, y, h / 2)) for x, y in pts]
    n = len(pts)
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = lib._link(name, bm, material, loc, rot)
    if bevel > 0:
        lib.bevel(ob, min(bevel, h * 0.45), bseg, angle=30)
    return ob


def rr_ring(name, outer, inner, depth, loc=(0, 0, 0), material=None, seg=6, bevel=0.012,
            rot=(0, 0, 0), bseg=3):
    """Picture-frame ring standing in the XZ plane (faces ±Y), `depth` thick along Y.
    outer / inner = (width, height, corner radius); the inner one is the hole."""
    po, pi = rr_points(*outer, seg), rr_points(*inner, seg)
    bm = bmesh.new()
    fo = [bm.verts.new((x, -depth / 2, z)) for x, z in po]
    fi = [bm.verts.new((x, -depth / 2, z)) for x, z in pi]
    bo = [bm.verts.new((x, depth / 2, z)) for x, z in po]
    bi = [bm.verts.new((x, depth / 2, z)) for x, z in pi]
    n = len(po)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((fo[i], fo[j], fi[j], fi[i]))
        bm.faces.new((bo[j], bo[i], bi[i], bi[j]))
        bm.faces.new((fo[j], fo[i], bo[i], bo[j]))
        bm.faces.new((fi[i], fi[j], bi[j], bi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = lib._link(name, bm, material, loc, rot)
    if bevel > 0:
        lib.bevel(ob, bevel, bseg, angle=30)
    return ob


def text_mesh(name, body, size, depth, loc=(0, 0, 0), rot=(0, 0, 0), material=None,
              bevel=0.0, bevel_res=2, res_u=4, spacing=1.0, align="CENTER", offset=0.0,
              back=False):
    """Raised rounded letters. The text lies in local XY facing +Z (rot=(pi/2, 0, 0) stands it
    up facing -Y), centred on loc horizontally and vertically, `depth` thick in total.
    `offset` fattens (+) or thins (-) the glyph outlines: a fat dark copy behind a normal one
    gives chunky two-tone sign letters. The back caps (local -Z, against the surface the
    letters sit on) are dropped unless `back`."""
    font = bpy.data.fonts.load(FONT, check_existing=True)
    cu = bpy.data.curves.new(name + "_text", "FONT")
    cu.body = body
    cu.font = font
    cu.size = size
    cu.extrude = max(depth / 2 - bevel, 0.0)
    cu.bevel_depth = bevel
    cu.bevel_resolution = bevel_res
    cu.resolution_u = res_u
    cu.align_x = align
    cu.align_y = "CENTER"
    cu.space_character = spacing
    cu.offset = offset
    tmp = bpy.data.objects.new(name + "_text", cu)
    lib.coll().objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg), depsgraph=dg)
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(cu)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    if not back:
        bm.normal_update()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < -0.7], context="FACES")
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    ob = lib._link(name, bm, material, loc, rot, smooth=True)
    # Flat letter faces stay crisp; only the bevelled rims shade smoothly.
    ob.data.set_sharp_from_angle(angle=math.radians(40))
    return ob


# ---------------------------------------------------------------- finalize


# ---------------------------------------------------------------- finalize

def finalize(name, ao_res=512, ao_distance=0.35, meta=None, strength=1.0, ground="floor",
             preview_lift=0.0):
    """lib.finalize with three more knobs: AO `strength`; the AO contact `ground` ("floor",
    "wall", or None for things that touch nothing: sky decor, wall openings, baked 50 m up
    clear of lib's AO plane); and `preview_lift` to float sky things over the preview floor.
    Animated parts are lib.node() tags; `meta` (sidecar() kwargs) writes the sidecar, credited
    to meta["artist"] if given, else to me."""
    ob = lib.join_asset(name)
    tris = lib.tri_count(ob)
    lift = 0.0 if ground else 50.0
    ob.location.z += lift
    lib.bake_ao(ob, ao_res, ao_distance, strength=strength, ground=ground or "floor")
    ob.location.z -= lift
    glb = lib.export_glb(ob, name)
    ob.location.z += preview_lift
    bpy.context.view_layer.update()
    png = lib.render_preview(ob, name)
    ob.location.z -= preview_lift
    nodes = [o.name for o in lib.asset_objects(ob) if o is not ob]
    # Namespace materials and node objects in the .blend so the next asset gets fresh names.
    for o in lib.asset_objects(ob):
        for m in o.data.materials:
            if "@" not in m.name:
                m.name = m.name + "@" + name
        if o is not ob:
            o.name = o.name + "@" + name
    report = {"object": ob.name, "nodes": nodes, "tris": tris, "glb": glb, "png": png,
              "kb": os.path.getsize(glb) // 1024}
    if meta:
        # Other artists use this finalize too: their META names them; mine default to me.
        report["sidecar"] = lib.sidecar(name, **dict({"artist": ARTIST}, **meta))
    return report
