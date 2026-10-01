"""Helpers for Claude Cézanne's decor set (desk items, food, small props, wall decor), on top
of lib.py: raised rounded text, sweeps, extruded outlines, and a finalize that also handles
animated child nodes, planar label UVs and wall-hung items. Underscore file: build.py skips
it.

Conventions as lib.py: metres, Z-up, front faces -Y, origin at the floor/desk contact point.
Wall items: origin at the wall-contact point (centre of the back face, y = 0); the item
stands out towards -Y.
"""
import math
import os

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

import lib

FONT = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"
FRONT = (math.pi / 2, 0, 0)  # turns a local +Z face so it faces the front (-Y)
BACK = (math.pi / 2, 0, math.pi)  # ... or the back (+Y), still reading upright from there

# Decor colours (sRGB hex) on top of lib.P / client/src/style/palette.ts.
C = {
    "paper": "#FFFDF7",
    "paper2": "#F3EBDA",
    "cream": "#FFF3DE",
    "white": "#F7F4EE",
    "ink": "#2B2D42",
    "ink2": "#5C5F77",
    "eye": "#1E1B2E",
    "cheek": "#FF9AA2",
    "red": "#E63946",
    "coral": "#FF7A6B",
    "orange": "#FF9F45",
    "yellow": "#FFC94A",
    "duck": "#FFD93D",
    "gold": "#FFC93C",
    "goldDark": "#E8A93C",
    "sky": "#5CC8FF",
    "blue": "#3D7CFF",
    "teal": "#2EC4B6",
    "mint": "#6EDC9A",
    "lilac": "#B48CFF",
    "purple": "#9B5DE5",
    "pink": "#FF9DCB",
    "kraft": "#D9A066",
    "kraftDark": "#B9814B",
    "tape": "#E9C98E",
    "wood": "#C98F5A",
    "woodDark": "#9C6B43",
    "cork": "#D8A86C",
    "chrome": "#C8D0DC",
    "steel": "#8E99AB",
    "rubber": "#3B4252",
    "leaf": "#4CC46A",
    "leafLight": "#7BD66B",
    "leafDark": "#46B35A",
    "pot": "#E07A4F",
    "soil": "#6B4A32",
    "coffee": "#6B3E26",
    "foam": "#F2DCC0",
    "glass": "#BFE9FF",
    "screenOff": "#1B2330",
    "screenGlow": "#7FD8FF",
}


def mat(name, key_or_hex, **kw):
    """lib.mat with decor colour names allowed."""
    return lib.mat(name, C.get(key_or_hex, key_or_hex), **kw)


def label_mat(name="Label", hex_str=None):
    """A face the game paints (canvas texture): plain paper, no AO multiplied in, planar
    0..1 UVs from finalize(planar=...)."""
    m = lib.mat(name, hex_str or C["paper"], rough=0.6)
    m["no_ao"] = True  # lib.bake_ao: no AO multiplied in (the game swaps the map)
    return m


# ---------------------------------------------------------------- mesh utilities

def smooth_by_angle(me, deg=35):
    """Smooth shading with sharp edges above `deg` (flat caps stay flat, curves stay soft)."""
    bm = bmesh.new()
    bm.from_mesh(me)
    lim = math.radians(deg)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > lim)
    bm.to_mesh(me)
    bm.free()


def new_object(name, me, material=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    if material is not None:
        me.materials.clear()
        me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    ob.rotation_euler = rot
    lib.coll().objects.link(ob)
    return ob


def bm_object(name, bm, material=None, loc=(0, 0, 0), rot=(0, 0, 0), sharp=None):
    """Link a bmesh as an object. sharp=None: fully smooth; a number: smooth by angle."""
    if sharp is None:
        return lib._link(name, bm, material, loc, rot)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    smooth_by_angle(me, sharp)
    return new_object(name, me, material, loc, rot)


def lathe(name, profile, material=None, loc=(0, 0, 0), verts=32, sharp=None, rot=(0, 0, 0)):
    """lib.lathe; `sharp` (degrees) keeps creases above that angle crisp (a coffee surface
    meeting the cup wall) instead of smoothing across them."""
    ob = lib.lathe(name, profile, loc, material, verts, rot)
    if sharp is not None:
        smooth_by_angle(ob.data, sharp)
    return ob


def flatten_below(ob, z):
    """Clamp an object's vertices (world Z) to >= z: a flat base for blobs and spheres."""
    bpy.context.view_layer.update()
    mw, mi = ob.matrix_world, ob.matrix_world.inverted()
    for v in ob.data.vertices:
        w = mw @ v.co
        if w.z < z:
            w.z = z
            v.co = mi @ w
    ob.data.update()
    return ob


def displace(ob, fn):
    """Move every vertex (object space): fn(co) -> new co."""
    for v in ob.data.vertices:
        v.co = fn(v.co.copy())
    ob.data.update()
    return ob


# ---------------------------------------------------------------- text

def text(name, body, size, material, loc=(0, 0, 0), rot=FRONT, depth=0.003, res=3,
         align="CENTER", line=1.0, spacing=1.0, back=False, valign="CENTER"):
    """Raised rounded text. Built flat (glyphs in local XY, standing `depth` out along +Z from
    z = 0), centred on its glyph bounds, then turned by `rot` (default: faces the front, -Y,
    growing out of a surface at `loc`). Back faces are dropped unless `back`."""
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.font = bpy.data.fonts.load(FONT, check_existing=True)
    cu.size = size
    cu.space_line = line
    cu.space_character = spacing
    cu.extrude = depth / 2
    cu.resolution_u = res
    cu.align_x = "CENTER" if align == "CENTER" else align
    tmp = bpy.data.objects.new(name + "_curve", cu)
    lib.coll().objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg), depsgraph=dg)
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(cu)

    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    zs = [v.co.z for v in bm.verts]
    ox = {"CENTER": (min(xs) + max(xs)) / 2, "LEFT": min(xs), "RIGHT": max(xs)}[align]
    oy = {"CENTER": (min(ys) + max(ys)) / 2, "TOP": max(ys), "BOTTOM": min(ys)}[valign]
    bmesh.ops.translate(bm, vec=(-ox, -oy, -min(zs)), verts=bm.verts)
    if not back:
        bm.normal_update()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < -0.7], context="FACES")
    bmesh.ops.transform(bm, matrix=_place(loc, rot), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    smooth_by_angle(me, 40)
    return new_object(name, me, material)


def _place(loc, rot):
    return Matrix.Translation(loc) @ Euler(rot, "XYZ").to_matrix().to_4x4()


def text_size(ob):
    """(width, height) of a front-facing text object (X extent, Z extent)."""
    xs = [v.co.x for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    return max(xs) - min(xs), max(zs) - min(zs)


def wrap_cylinder(ob, radius, axis=(0.0, 0.0), base=None):
    """Bend a front-facing part around a vertical cylinder through `axis`. The part is built
    flat on the plane y = axis.y - base (base defaults to radius), standing out towards -Y.
    `radius` may be a function of z (tapered cups). Mesh coordinates are taken as world (the
    object must have identity rotation/scale)."""
    ax, ay = axis
    lx, ly, lz = ob.location
    base = radius if base is None else base
    for v in ob.data.vertices:
        x, y, z = v.co.x + lx - ax, v.co.y + ly - ay, v.co.z + lz
        r = radius(z) if callable(radius) else radius
        d = r + (-y - base)
        a = x / r
        v.co = (ax + d * math.sin(a) - lx, ay - d * math.cos(a) - ly, v.co.z)
    ob.data.update()
    return ob


def bake_xform(ob):
    """Apply an object's location/rotation/scale into its mesh (identity transform after)."""
    ob.data.transform(ob.matrix_basis)
    ob.matrix_basis = Matrix.Identity(4)
    ob.data.update()
    return ob


def snapshot():
    """Names of the parts built so far (pair with since() to grab a sub-assembly)."""
    return {o.name for o in lib.coll().objects}


def since(before):
    return [o for o in lib.coll().objects if o.name not in before]


def place(objs, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    """Move a sub-assembly built at the origin: scale, rotate (XYZ Euler), then translate."""
    bpy.context.view_layer.update()
    m = _place(loc, rot) @ Matrix.Scale(scale, 4)
    for o in objs:
        o.matrix_world = m @ o.matrix_world
    bpy.context.view_layer.update()
    return objs


def turn(objs, pivot, rot):
    """Rotate a sub-assembly about a pivot point (XYZ Euler)."""
    p = Vector(pivot)
    place(objs, loc=-p)
    return place(objs, loc=p, rot=rot)


def paint(ob, material, pred):
    """Give faces where pred(centre, normal) is true (object space) a second material."""
    me = ob.data
    if material.name not in [m.name for m in me.materials]:
        me.materials.append(material)
    idx = [m.name for m in me.materials].index(material.name)
    for p in me.polygons:
        if pred(p.center, p.normal):
            p.material_index = idx
    return ob


# ---------------------------------------------------------------- outlines (2D, CCW)

def circle_pts(r, n=24, cx=0.0, cy=0.0, a0=0.0, sx=1.0, sy=1.0):
    return [(cx + sx * r * math.cos(a0 + 2 * math.pi * i / n),
             cy + sy * r * math.sin(a0 + 2 * math.pi * i / n)) for i in range(n)]


def star_pts(points=5, r1=1.0, r2=0.45, a0=math.pi / 2):
    out = []
    for i in range(points * 2):
        r = r1 if i % 2 == 0 else r2
        a = a0 + math.pi * i / points
        out.append((r * math.cos(a), r * math.sin(a)))
    return out


def heart_pts(size=1.0, n=40):
    """Heart about its bounding-box centre, `size` wide."""
    raw = []
    for i in range(n):
        t = 2 * math.pi * i / n
        raw.append((16 * math.sin(t) ** 3,
                    13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)))
    xs = [p[0] for p in raw]
    ys = [p[1] for p in raw]
    s = size / (max(xs) - min(xs))
    cy = (max(ys) + min(ys)) / 2
    pts = [(x * s, (y - cy) * s) for x, y in raw]
    return _ccw(_dedupe(pts))


def rounded_pts(pts, radius, steps=4):
    """Fillet every corner of a closed polygon with an arc of `radius` (clamped per corner)."""
    out = []
    n = len(pts)
    for i in range(n):
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % n])
        d0, d1 = (p0 - p1), (p2 - p1)
        l0, l1 = d0.length, d1.length
        if l0 < 1e-9 or l1 < 1e-9:
            continue
        d0.normalize()
        d1.normalize()
        ang = math.acos(max(-1.0, min(1.0, d0.dot(d1))))
        if ang > math.pi - 1e-3:
            out.append(tuple(p1))
            continue
        t = radius / math.tan(ang / 2)
        t = min(t, l0 * 0.49, l1 * 0.49)
        r = t * math.tan(ang / 2)
        a, b = p1 + d0 * t, p1 + d1 * t
        bis = (d0 + d1).normalized()
        c = p1 + bis * math.sqrt(r * r + t * t)
        va, vb = a - c, b - c
        aa = math.atan2(va.y, va.x)
        ab = math.atan2(vb.y, vb.x)
        da = ab - aa
        while da > math.pi:
            da -= 2 * math.pi
        while da < -math.pi:
            da += 2 * math.pi
        for k in range(steps + 1):
            u = aa + da * k / steps
            out.append((c.x + r * math.cos(u), c.y + r * math.sin(u)))
    return out


def rrect_pts(w, h, r, steps=4, cx=0.0, cy=0.0):
    hw, hh = w / 2, h / 2
    return [(x + cx, y + cy) for x, y in
            rounded_pts([(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)], r, steps)]


def _dedupe(pts, eps=1e-7):
    out = []
    for p in pts:
        if not out or (abs(p[0] - out[-1][0]) > eps or abs(p[1] - out[-1][1]) > eps):
            out.append(p)
    if len(out) > 2 and abs(out[0][0] - out[-1][0]) < eps and abs(out[0][1] - out[-1][1]) < eps:
        out.pop()
    return out


def _ccw(pts):
    area = sum(pts[i - 1][0] * pts[i][1] - pts[i][0] * pts[i - 1][1] for i in range(len(pts)))
    return pts if area > 0 else list(reversed(pts))


def prism(name, outline, depth, material, loc=(0, 0, 0), rot=(0, 0, 0), r=0.0, seg=2,
          angle=40, sharp=None, back=True):
    """Extrude a 2D outline (local XY) from z = 0 to z = depth; bevel radius r. With the FRONT
    rotation it grows out of a surface towards -Y."""
    pts = _ccw(_dedupe(list(outline)))
    bm = bmesh.new()
    bot = [bm.verts.new((x, y, 0.0)) for x, y in pts]
    top = [bm.verts.new((x, y, depth)) for x, y in pts]
    if back:
        bm.faces.new(list(reversed(bot)))
    bm.faces.new(top)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bm.normal_update()
    ob = bm_object(name, bm, material, loc, rot, sharp=sharp if sharp is not None else 35)
    if r > 0:
        lib.bevel(ob, r, seg, angle=angle)
    return ob


def face(name, outline, material, loc=(0, 0, 0), rot=(0, 0, 0)):
    """A single flat n-gon (print, decal, label) in local XY facing +Z; FRONT turns it to -Y,
    BACK to +Y."""
    pts = _ccw(_dedupe(list(outline)))
    bm = bmesh.new()
    bm.faces.new([bm.verts.new((x, y, 0.0)) for x, y in pts])
    return bm_object(name, bm, material, loc, rot, sharp=30)


def band(name, outer, inner, material, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Flat closed band between two outlines with matching points (a drawn ring, a stamp's
    border); far lighter than a swept tube."""
    bm = bmesh.new()
    vo = [bm.verts.new((x, y, 0.0)) for x, y in outer]
    vi = [bm.verts.new((x, y, 0.0)) for x, y in inner]
    n = len(vo)
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new((vo[i], vo[j], vi[j], vi[i]))
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    return bm_object(name, bm, material, loc, rot, sharp=30)


def ring(name, r_out, r_in, material, n=24, loc=(0, 0, 0), rot=(0, 0, 0)):
    return band(name, circle_pts(r_out, n), circle_pts(r_in, n), material, loc, rot)


def slab(name, outline, depth, material, loc=(0, 0, 0), rot=(0, 0, 0), r=0.004, seg=2):
    """prism() centred on its thickness (z from -depth/2 to depth/2)."""
    ob = prism(name, outline, depth, material, loc, rot, r=r, seg=seg)
    for v in ob.data.vertices:
        v.co.z -= depth / 2
    ob.data.update()
    return ob


# ---------------------------------------------------------------- sweeps

def catmull(pts, steps):
    """Catmull-Rom through the points (endpoints kept), `steps` samples per segment."""
    if steps <= 1 or len(pts) < 3:
        return [Vector(p) for p in pts]
    P = [Vector(p) for p in pts]
    P = [P[0] + (P[0] - P[1])] + P + [P[-1] + (P[-1] - P[-2])]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(steps):
            t = k / steps
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-2])
    return out


def tube(name, pts, radius, material, verts=10, smooth=0, caps="round", radii=None,
         closed=False, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Sweep a circle along a path (parallel-transport frames). caps: 'round', 'flat' or None.
    `radii`: per-control-point radius scale (interpolated with the path)."""
    path = catmull(pts, smooth) if smooth else [Vector(p) for p in pts]
    if closed:
        path = path[:-1] if (path[0] - path[-1]).length < 1e-9 else path
    m = len(path)
    if radii is not None:
        rs = []
        for i in range(m):
            f = i * (len(radii) - 1) / max(1, m - 1)
            k = min(int(f), len(radii) - 2)
            u = f - k
            rs.append(radii[k] * (1 - u) + radii[k + 1] * u)
    else:
        rs = [1.0] * m
    tang = []
    for i in range(m):
        if closed:
            t = path[(i + 1) % m] - path[i - 1]
        else:
            t = path[min(i + 1, m - 1)] - path[max(i - 1, 0)]
        tang.append(t.normalized())
    ref = Vector((0, 0, 1)) if abs(tang[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = [(ref - tang[0] * ref.dot(tang[0])).normalized()]
    for i in range(1, m):
        q = tang[i - 1].rotation_difference(tang[i])
        n = q @ nrm[-1]
        n = (n - tang[i] * n.dot(tang[i])).normalized()
        nrm.append(n)
    bm = bmesh.new()
    rings = []
    for i in range(m):
        b = tang[i].cross(nrm[i])
        ring = []
        for k in range(verts):
            a = 2 * math.pi * k / verts
            ring.append(bm.verts.new(path[i] + radius * rs[i] * (math.cos(a) * nrm[i] + math.sin(a) * b)))
        rings.append(ring)
    segs = m if closed else m - 1
    for i in range(segs):
        r0, r1 = rings[i], rings[(i + 1) % m]
        for k in range(verts):
            k2 = (k + 1) % verts
            bm.faces.new((r0[k], r0[k2], r1[k2], r1[k]))
    if not closed and caps:
        for end, sign in ((0, -1), (m - 1, 1)):
            ring = rings[end]
            c = path[end]
            t = tang[end] * sign
            rr = radius * rs[end]
            if caps == "round":
                b = tang[end].cross(nrm[end])
                prev = ring
                for frac, push in ((0.72, 0.62), (0.38, 0.9)):
                    nr = []
                    for k in range(verts):
                        a = 2 * math.pi * k / verts
                        nr.append(bm.verts.new(c + t * rr * push + rr * frac *
                                               (math.cos(a) * nrm[end] + math.sin(a) * b)))
                    for k in range(verts):
                        k2 = (k + 1) % verts
                        f = (prev[k], prev[k2], nr[k2], nr[k]) if sign > 0 else (prev[k2], prev[k], nr[k], nr[k2])
                        bm.faces.new(f)
                    prev = nr
                tip = bm.verts.new(c + t * rr)
                for k in range(verts):
                    k2 = (k + 1) % verts
                    bm.faces.new((prev[k], prev[k2], tip) if sign > 0 else (prev[k2], prev[k], tip))
            else:
                bm.faces.new(ring if sign > 0 else list(reversed(ring)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lib._link(name, bm, material, loc, rot)


def arc_pts(r, a0, a1, n=12, cx=0.0, cz=0.0, y=0.0, sx=1.0, sz=1.0):
    """Points on an arc in the XZ plane (angles in radians from +X towards +Z)."""
    return [(cx + sx * r * math.cos(a0 + (a1 - a0) * i / n), y,
             cz + sz * r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


# ---------------------------------------------------------------- finalize

def bake_ao(ob, res=256, distance=0.06, strength=1.0, samples=1024, margin=None):
    """lib.bake_ao with two knobs it lacks: an island margin scaled to the texture (0.01 leaves
    ~2.5 px gaps at 256², so dark buried islands bleed into neighbours as seam lines) and more
    samples (smooth, noise-free AO). Otherwise the same contract: one 'AO' atlas over the
    asset's objects, multiplied into every material not flagged emissive / no_ao, planar
    0..1 UVs on Screen/Board/Label faces."""
    margin = max(0.01, 7.0 / res) if margin is None else margin
    scene = bpy.context.scene
    objs = lib.asset_objects(ob)
    for o in objs:
        me = o.data
        while me.uv_layers:
            me.uv_layers.remove(me.uv_layers[0])
        me.uv_layers.new(name="AO")
    lib._deselect()
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin,
                             scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")

    img_name = ob.name + "_AO"
    if img_name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[img_name])
    img = bpy.data.images.new(img_name, res, res, alpha=False)
    img.generated_color = (1, 1, 1, 1)
    mats = []
    for o in objs:
        for m in o.data.materials:
            if m not in mats:
                mats.append(m)
    tex_nodes = []
    for m in mats:
        nt = m.node_tree
        for n in [n for n in nt.nodes if n.get("ao")]:
            nt.nodes.remove(n)
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        t["ao"] = True
        t.location = (-700, 300)
        nt.nodes.active = t
        tex_nodes.append((m, t))

    floor = _plane("_ao_floor", 5, (0, 0, 0), (0, 0, 0), lib.coll())
    prev_engine = scene.render.engine
    lib._set_engine(scene, "CYCLES")
    scene.cycles.samples = samples
    scene.cycles.device = "CPU"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    scene.world.light_settings.distance = distance
    scene.render.bake.margin = 8
    # EXTEND (nearest island texel) instead of ADJACENT_FACES, which leaves dark notches
    # along diagonal island borders at these small sizes.
    scene.render.bake.margin_type = "EXTEND"
    bpy.ops.object.bake(type="AO", use_clear=True)
    _drop(floor)
    lib._set_engine(scene, prev_engine)

    import numpy as np
    px = np.empty(res * res * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    px[:, :3] = 1.0 - strength * (1.0 - px[:, :3])
    img.pixels.foreach_set(px.ravel())
    img.update()
    img.pack()

    for o in objs:
        lib._screen_uvs(o.data)
    for m, t in tex_nodes:
        if m.get("emissive") or m.get("no_ao"):
            continue
        nt = m.node_tree
        b = lib.principled(m)
        mix = nt.nodes.new("ShaderNodeMix")
        mix["ao"] = True
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.location = (-350, 300)
        mix.inputs[0].default_value = 1.0
        mix.inputs[6].default_value = b.inputs["Base Color"].default_value
        nt.links.new(t.outputs["Color"], mix.inputs[7])
        nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    return img


def planar_uvs(ob, names, up=(0, 0, 1)):
    """Faces using a material in `names` get a 0..1 planar UV per facing direction, oriented
    to read left-to-right from the side the face looks at (a two-sided tent card, a phone
    lying face up). Runs after lib.bake_ao, replacing lib's front-only projection."""
    me = ob.data
    idx = {i for i, m in enumerate(me.materials) if m.name.split("@")[0] in names}
    if not idx:
        return
    uv = me.uv_layers.active.data
    groups = {}
    for p in me.polygons:
        if p.material_index in idx:
            key = tuple(round(c, 1) for c in p.normal)
            groups.setdefault(key, []).append(p)
    for polys in groups.values():
        n = Vector((0, 0, 0))
        for p in polys:
            n += p.normal * p.area
        n.normalize()
        upv = Vector(up)
        if abs(n.dot(upv)) > 0.95:
            upv = Vector((0, 1, 0))
        right = upv.cross(n).normalized()
        fup = n.cross(right).normalized()
        loops = [li for p in polys for li in p.loop_indices]
        cos = [me.vertices[me.loops[li].vertex_index].co for li in loops]
        us = [c.dot(right) for c in cos]
        vs = [c.dot(fup) for c in cos]
        u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
        for li, u, v in zip(loops, us, vs):
            uv[li].uv = ((u - u0) / max(u1 - u0, 1e-9), (v - v0) / max(v1 - v0, 1e-9))


def _plane(name, size, loc, rot, coll):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    ob.rotation_euler = rot
    coll.objects.link(ob)
    return ob


def _drop(ob):
    me = ob.data
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(me)


def finalize(name, ao_res=256, ao_distance=0.06, meta=None, planar=(), wall=False,
             preview=None):
    """lib.finalize plus decor extras (animated parts: tag them with lib.node in build()).

    planar  material names whose faces get per-direction planar 0..1 UVs (two-sided `Label`,
            a `Screen` lying flat).
    wall    wall-hung item (origin at the back-centre wall contact): AO is baked against a
            wall instead of the floor, and the preview hangs it on a wall.
    meta    lib.sidecar kwargs (artist defaults to Claude Cézanne).
    preview callable that adds preview-only parts after export (e.g. a sample name on a
            blank Label); they are removed again after the render.
    """
    c = lib.coll()
    ob = lib.join_asset(name)
    objs = lib.asset_objects(ob)
    tris = lib.tri_count(ob)

    wall_ob = None
    if wall:
        # Lift far above lib's AO floor; bake against a wall plane at the back instead.
        ob.location = (0, 0, 50.0)
        wall_ob = _plane("_ao_wall", 3, (0, 0.0005, 50.0), (math.pi / 2, 0, 0), c)
        bpy.context.view_layer.update()
    bake_ao(ob, ao_res, ao_distance)
    if wall_ob is not None:
        _drop(wall_ob)
        ob.location = (0, 0, 0)
        bpy.context.view_layer.update()
    if planar:
        for o in objs:
            planar_uvs(o, set(planar))
    glb = lib.export_glb(ob, name)

    backdrop = None
    if wall:
        lo, hi = lib._world_bounds(objs)
        ob.location = (0, 0, max(0.12, 0.35 * (hi.z - lo.z)) - lo.z)
        bpy.context.view_layer.update()
        backdrop = _plane("_backdrop", 30, (0, 0.002, 0), (math.pi / 2, 0, 0), c)
        backdrop.data.materials.append(lib.mat("_studio_wall", C["cream"], rough=0.9))
    extras = []
    if preview is not None:
        before = snapshot()
        preview()
        extras = since(before)
        bpy.context.view_layer.update()
        if wall:
            for o in extras:
                o.matrix_world = ob.matrix_world @ o.matrix_world
    png = lib.render_preview(ob, name)
    # lib lowers its preview floor for wall items; keep things that stand on z = 0 grounded.
    lo, _ = lib._world_bounds(objs)
    floor = bpy.data.objects.get("_floor")
    if floor is not None and lo.z > -0.02 and abs(floor.location.z) > 1e-4:
        floor.location.z = 0.0
        bpy.ops.render.render(write_still=True)
    for o in extras:
        _drop(o)
    if backdrop is not None:
        _drop(backdrop)
        ob.location = (0, 0, 0)

    for o in objs:
        for m in o.data.materials:
            if "@" not in m.name:
                m.name = m.name + "@" + name
        if o is not ob:
            o.name = o.name + "@" + name
    report = {"object": ob.name, "nodes": [o.name for o in objs[1:]], "tris": tris,
              "glb": glb, "png": png, "kb": os.path.getsize(glb) // 1024}
    if meta:
        report["sidecar"] = lib.sidecar(name, **dict(dict(artist="Claude Cézanne"), **meta))
    lib.view(objs)
    return report
