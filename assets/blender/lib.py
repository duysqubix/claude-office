"""Shared helpers for Claude Office props: soft primitives, palette materials, AO bake,
glTF export and the Eevee preview render.

Conventions (docs/BLENDER.md): metres, Z-up, the front of every prop faces -Y, origin at
the floor-contact point. Primitives are built with bmesh so the scripts run the same in a
live window and in `blender --background`.
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS_DIR = os.path.join(ROOT, "client", "public", "models")
SNAPS_DIR = os.path.join(ROOT, "snaps", "blender")

# Subset of client/src/style/palette.ts (hex is sRGB).
P = {
    "skyTop": "#5BB8FF",
    "skyHorizon": "#CFEFFF",
    "deskTop": "#FFFBF2",
    "deskAccents": ["#FF7A6B", "#FFC94A", "#5CC8FF", "#6EDC9A", "#B48CFF", "#FF9DCB"],
    "chairs": ["#FF5A5F", "#3D7CFF", "#FFC93C", "#2EC4B6", "#9B5DE5"],
    "chairBase": "#3B4252",
    "monitorBezel": "#2E3440",
    "screenOff": "#1B2330",
    "screenGlow": "#7FD8FF",
    "plantLeaf": "#4CC46A",
    "plantPot": "#E07A4F",
    "wood": "#C98F5A",
    "metal": "#C8D0DC",
    "coffee": "#6B3E26",
    "ink": "#2B2D42",
    "paper": "#FFFDF7",
    "claude": "#D97757",
    "treeLeaf": ["#5CCB5F", "#46B35A", "#7BD66B"],
    "stateWorking": "#4ADE80",
    "stateNeedsYou": "#FFB020",
    "eye": "#1E1B2E",
    "wallAccent": "#8FE0C8",
    "wall": "#FFF3DE",
}

STUDIO = "_Studio"


# ---------------------------------------------------------------- colour + materials

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgba(hex_str, alpha=1.0):
    h = hex_str.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (alpha,)


def principled(mat):
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def mat(name, hex_str, rough=0.7, metal=0.0, emit=None, strength=1.0, alpha=None):
    """Flat palette material. `emit` (hex) makes it glow (screens, indicator lights).
    `alpha` < 1 makes it see-through (glass, water): exported as glTF alphaMode BLEND."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = principled(m)
    b.inputs["Base Color"].default_value = rgba(hex_str)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = rgba(emit)
        b.inputs["Emission Strength"].default_value = strength
    m.diffuse_color = rgba(hex_str)
    m.use_backface_culling = True  # exports single-sided
    if alpha is not None:
        b.inputs["Alpha"].default_value = alpha
        for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try:
                setattr(m, attr, val)
            except (AttributeError, TypeError):
                pass
        m["no_ao"] = True
    m["emissive"] = bool(emit)
    return m


# ---------------------------------------------------------------- scene + collections

def clear_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.lights,
                  bpy.data.cameras):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


_active = {"coll": None, "name": None}


def begin(name):
    """Start an asset in a fresh collection and hide the other assets."""
    scene = bpy.context.scene
    for c in scene.collection.children:
        if c.name in (name, STUDIO):
            continue
        c.hide_viewport = True
        if c.name.startswith("_"):
            # Helper collections ("_Mannequin", ...): empty them (their owner rebuilds them
            # when an asset needs them) but keep them renderable for that asset's preview.
            for ob in list(c.objects):
                bpy.data.objects.remove(ob, do_unlink=True)
            c.hide_render = False
        else:
            c.hide_render = True
    coll = bpy.data.collections.get(name)
    if coll:
        for ob in list(coll.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
    else:
        coll = bpy.data.collections.new(name)
        scene.collection.children.link(coll)
    coll.hide_viewport = False
    coll.hide_render = False
    # Drop leftovers of a previous build of this asset so names stay clean.
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(block):
            if item.users == 0:
                block.remove(item)
    _active["coll"], _active["name"] = coll, name
    return coll


def coll():
    return _active["coll"]


def _link(name, bm, material, loc=(0, 0, 0), rot=(0, 0, 0), smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    ob.rotation_euler = rot
    if material:
        me.materials.append(material)
    coll().objects.link(ob)
    return ob


def bevel(ob, width, segments=3, angle=None, harden=True):
    m = ob.modifiers.new("Bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE" if angle is not None else "NONE"
    if angle is not None:
        m.angle_limit = math.radians(angle)
    m.harden_normals = harden
    return ob


def subsurf(ob, levels=1):
    m = ob.modifiers.new("Subsurf", "SUBSURF")
    m.levels = levels
    m.render_levels = levels
    return ob


# ---------------------------------------------------------------- soft primitives

def rbox(name, size, loc=(0, 0, 0), material=None, r=0.03, seg=3, rot=(0, 0, 0)):
    """Rounded box. `size` is full extents (x, y, z); `loc` its centre."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    ob = _link(name, bm, material, loc, rot)
    r = min(r, min(size) * 0.49)
    if r > 0:
        bevel(ob, r, seg)
    return ob


def cyl(name, radius, depth, loc=(0, 0, 0), material=None, r=0.01, seg=2, verts=32,
        radius2=None, rot=(0, 0, 0)):
    """Cylinder (or cone with radius2) along local Z, centred on loc; rims rounded by r."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                          radius1=radius, radius2=radius if radius2 is None else radius2,
                          depth=depth)
    ob = _link(name, bm, material, loc, rot)
    if r > 0:
        bevel(ob, r, seg, angle=40)
    return ob


def sphere(name, radius, loc=(0, 0, 0), material=None, scale=(1, 1, 1), u=24, v=12,
           rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=radius)
    ob = _link(name, bm, material, loc, rot)
    ob.scale = scale
    return ob


def torus(name, major, minor, loc=(0, 0, 0), material=None, seg=32, ring=12,
          rot=(0, 0, 0), sweep=None):
    """Torus in the XY plane. `sweep` (radians) makes an open bent tube from angle 0, with
    flat-capped ends (handles, faucets, rails)."""
    if sweep is not None:
        return _bent_tube(name, major, minor, sweep, loc, material, seg, ring, rot)
    bm = bmesh.new()
    rows = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        row = []
        for j in range(ring):
            b = 2 * math.pi * j / ring
            rr = major + minor * math.cos(b)
            row.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), minor * math.sin(b))))
        rows.append(row)
    for i in range(seg):
        for j in range(ring):
            bm.faces.new((rows[i][j], rows[(i + 1) % seg][j],
                          rows[(i + 1) % seg][(j + 1) % ring], rows[i][(j + 1) % ring]))
    return _link(name, bm, material, loc, rot)


def _bent_tube(name, major, minor, sweep, loc, material, seg, ring, rot):
    bm = bmesh.new()
    rows = []
    for i in range(seg + 1):
        a = sweep * i / seg
        row = []
        for j in range(ring):
            b = 2 * math.pi * j / ring
            rr = major + minor * math.cos(b)
            row.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), minor * math.sin(b))))
        rows.append(row)
    for i in range(seg):
        for j in range(ring):
            bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][(j + 1) % ring],
                          rows[i][(j + 1) % ring]))
    bm.faces.new(list(reversed(rows[0])))
    bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _link(name, bm, material, loc, rot)


def arc(name, r_in, r_out, a0, a1, z0, z1, loc=(0, 0, 0), material=None, segs=24, r=0.03,
        seg=3, rot=(0, 0, 0)):
    """Curved slab: the ring sector between radii r_in..r_out and angles a0..a1 (radians,
    0 = +X, counter-clockwise), extruded z0..z1. Corners rounded by r (angle-limited)."""
    bm = bmesh.new()
    cols = []
    for i in range(segs + 1):
        a = a0 + (a1 - a0) * i / segs
        ca, sa = math.cos(a), math.sin(a)
        cols.append([bm.verts.new((rr * ca, rr * sa, z)) for rr, z in
                     ((r_in, z0), (r_out, z0), (r_out, z1), (r_in, z1))])
    for i in range(segs):
        a, b = cols[i], cols[i + 1]
        for k in range(4):
            bm.faces.new((a[k], b[k], b[(k + 1) % 4], a[(k + 1) % 4]))
    bm.faces.new(list(reversed(cols[0])))
    bm.faces.new(cols[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _link(name, bm, material, loc, rot)
    if r > 0:
        bevel(ob, r, seg, angle=35)
    return ob


def slab(name, outline, z0, z1, loc=(0, 0, 0), material=None, r=0.03, seg=3, rot=(0, 0, 0)):
    """Prism from a convex 2D outline [(x, y), ...] (counter-clockwise), extruded z0..z1,
    edges rounded by r (angle-limited so the outline's own facets stay smooth)."""
    bm = bmesh.new()
    bot = [bm.verts.new((x, y, z0)) for x, y in outline]
    top = [bm.verts.new((x, y, z1)) for x, y in outline]
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bm.faces.new(list(reversed(bot)))
    bm.faces.new(top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _link(name, bm, material, loc, rot)
    if r > 0:
        bevel(ob, r, seg, angle=35)
    return ob


def stadium(length, radius, segs=16):
    """Outline of a stadium (rectangle with semicircular ends) along X, centred."""
    pts = []
    for s, a0 in ((1, -math.pi / 2), (-1, math.pi / 2)):
        for i in range(segs + 1):
            a = a0 + math.pi * i / segs
            pts.append((s * length / 2 + radius * math.cos(a), radius * math.sin(a)))
    return pts


def rounded_rect(w, d, radius, segs=6):
    """Outline of a w x d rectangle with rounded corners, centred."""
    pts = []
    for cx, cy, a0 in ((w / 2 - radius, -d / 2 + radius, -math.pi / 2),
                       (w / 2 - radius, d / 2 - radius, 0),
                       (-w / 2 + radius, d / 2 - radius, math.pi / 2),
                       (-w / 2 + radius, -d / 2 + radius, math.pi)):
        for i in range(segs + 1):
            a = a0 + (math.pi / 2) * i / segs
            pts.append((cx + radius * math.cos(a), cy + radius * math.sin(a)))
    return pts


def lathe(name, profile, loc=(0, 0, 0), material=None, verts=32, rot=(0, 0, 0), sweep=None,
          start=0.0):
    """Spin a (radius, z) profile around Z. Points with radius 0 close the shape.
    `sweep` (radians) spins only part way from angle `start` (0 = +X, CCW); a closed profile
    (first point == last) then gets flat caps at both ends (hoods, half shells)."""
    bm = bmesh.new()
    rings = []
    partial = sweep is not None
    n = verts + 1 if partial else verts
    for i in range(n):
        a = start + (sweep if partial else 2 * math.pi) * i / verts
        ca, sa = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((r * ca, r * sa, z)) for r, z in profile])
    for i in range(verts):
        a, b = rings[i], rings[(i + 1) % n]
        for k in range(len(profile) - 1):
            bm.faces.new((a[k], b[k], b[k + 1], a[k + 1]))
    if partial and tuple(profile[0]) == tuple(profile[-1]):
        bm.faces.new(rings[0][:-1])
        bm.faces.new(list(reversed(rings[-1][:-1])))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    # Faces that collapsed to triangles at the poles are fine; drop degenerate ones.
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _link(name, bm, material, loc, rot)


def blob(name, radius, loc=(0, 0, 0), material=None, scale=(1, 1, 1), levels=2,
         rot=(0, 0, 0)):
    """Soft pebble: subdivided cube, rounder and lighter than a UV sphere."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=radius * 2)
    ob = _link(name, bm, material, loc, rot)
    ob.scale = scale
    subsurf(ob, levels)
    return ob


# ---------------------------------------------------------------- live viewport

def _deselect():
    for o in bpy.context.scene.objects:
        if o is not None:
            o.select_set(False)


def view(objs=None, shading="MATERIAL"):
    """Frame the current asset in every 3D viewport (no-op in background mode)."""
    if bpy.app.background:
        return
    objs = objs if objs is not None else list(coll().objects)
    _deselect()
    for ob in objs:
        ob.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]
    for win in bpy.context.window_manager.windows:
        for area in win.screen.areas:
            if area.type != "VIEW_3D":
                continue
            space = area.spaces.active
            space.shading.type = shading
            space.overlay.show_relationship_lines = False
            region = next(r for r in area.regions if r.type == "WINDOW")
            with bpy.context.temp_override(window=win, area=area, region=region):
                bpy.ops.view3d.view_selected()
    for ob in objs:
        ob.select_set(False)


# ---------------------------------------------------------------- nodes, text, sidecars

CATALOG_DIR = os.path.join(ROOT, "assets", "catalog")
FONT_ROUNDED = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"


def node(ob, name, pivot=None):
    """Mark a part as belonging to a separate animated node `name` (e.g. "Door", "Drawer1").
    All parts with the same node name are joined into one child object of the asset, with
    its origin at `pivot` (Blender coords; default: centre of its bounding box)."""
    ob["node"] = name
    if pivot is not None:
        ob["pivot"] = list(pivot)
    return ob


def text(name, body, size, loc=(0, 0, 0), material=None, rot=(math.pi / 2, 0, 0),
         extrude=0.006, bevel=0.002, font=FONT_ROUNDED, align="CENTER", res=2):
    """Extruded text. Default rotation stands it up facing -Y (the front). Text is
    triangle-hungry: use res=1 and bevel=0 (or extrude=0 for a flat decal) on small labels."""
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.bevel_depth = bevel
    cu.bevel_resolution = 1
    cu.resolution_u = res
    cu.align_x = align
    cu.align_y = "CENTER"
    if font and os.path.exists(font):
        cu.font = bpy.data.fonts.load(font, check_existing=True)
    ob = bpy.data.objects.new(name, cu)
    ob.location = loc
    ob.rotation_euler = rot
    if material:
        cu.materials.append(material)
    coll().objects.link(ob)
    return ob


def to_three(v):
    """Blender (x, y, z) Z-up → three.js (x, y, z) Y-up, +Z front."""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def sidecar(id, name, category, priority, description, tags=(), tintable=(), anchors=None,
            anchors_bl=None, artist="Claude Monet", status="done", **extra):
    """Write assets/catalog/<id>.json. `anchors` are three.js coords; `anchors_bl` are
    Blender coords and get converted."""
    import json
    a = dict(anchors or {})
    for k, v in (anchors_bl or {}).items():
        a[k] = to_three(v)
    data = dict(id=id, name=name, category=category, artist=artist, priority=priority,
                status=status, description=description, tags=list(tags),
                tintable=list(tintable), anchors=a)
    data.update(extra)
    os.makedirs(CATALOG_DIR, exist_ok=True)
    path = os.path.join(CATALOG_DIR, id + ".json")
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    return path


# ---------------------------------------------------------------- finalize: join, bake, export

def asset_objects(ob):
    """The asset root plus its animated node children."""
    return [ob] + [c for c in ob.children if c.type == "MESH"]


def tri_count(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    n = 0
    for o in [ob] + [c for c in ob.children if c.type == "MESH"]:
        me = o.evaluated_get(dg).to_mesh()
        n += sum(len(p.vertices) - 2 for p in me.polygons)
        o.evaluated_get(dg).to_mesh_clear()
    return n


def _join(parts, name, offset=Vector((0, 0, 0))):
    """Apply modifiers + transforms on `parts` and join them into one new object `name`
    whose origin sits at `offset` (world)."""
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    mats = []
    for ob in parts:
        ev = ob.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, depsgraph=dg)
        me.transform(Matrix.Translation(-offset) @ ob.matrix_world)
        if ob.matrix_world.determinant() < 0:
            me.flip_normals()
        # Remap material slots into the joined mesh.
        remap = []
        for m in me.materials:
            if m not in mats:
                mats.append(m)
            remap.append(mats.index(m))
        for p in me.polygons:
            p.material_index = remap[p.material_index] if remap else 0
        # Keep per-corner custom normals (bevel harden) through the join.
        me.attributes.new("_n", "FLOAT_VECTOR", "CORNER").data.foreach_set(
            "vector", [c for cn in me.corner_normals for c in cn.vector])
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    old = bpy.data.meshes.get(name)
    if old is not None:
        if old.users == 0:
            bpy.data.meshes.remove(old)
        else:
            old.name = name + "@stale"
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    attr = me.attributes["_n"]
    normals = [tuple(d.vector) for d in attr.data]
    me.attributes.remove(attr)
    me.shade_smooth()
    me.normals_split_custom_set(normals)
    # Node names must export exactly (game looks them up); move any stale holder aside.
    stale = bpy.data.objects.get(name)
    if stale is not None:
        stale.name = name + "@stale"
    ob = bpy.data.objects.new(name, me)
    ob.location = offset
    coll().objects.link(ob)
    return ob


def _world_bounds(objs):
    pts = [o.matrix_world @ Vector(v) for o in objs for v in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


def join_asset(name):
    """Join every part into the asset object `name`; parts tagged with node() become named
    child objects (separate glTF nodes the game can animate)."""
    c = coll()
    parts = [o for o in c.objects if o.type in ("MESH", "FONT", "CURVE")]
    groups = {}
    for o in parts:
        groups.setdefault(o.get("node"), []).append(o)
    root = _join(groups.pop(None, []), name)
    for node_name, objs in groups.items():
        pivot = next((Vector(o["pivot"]) for o in objs if "pivot" in o), None)
        if pivot is None:
            lo, hi = _world_bounds(objs)
            pivot = (lo + hi) / 2
        child = _join(objs, node_name, pivot)
        child.parent = root
    for ob in parts:
        bpy.data.objects.remove(ob, do_unlink=True)
    return root


def _set_engine(scene, *names):
    for n in names:
        try:
            scene.render.engine = n
            return n
        except TypeError:
            continue
    raise RuntimeError("no render engine from %s" % (names,))


def _fill_margin(src, dst):
    """Copy the texels a margin-free bake wrote into `src` (alpha 1) to `dst`, and fill the
    rest from their baked neighbours, ring by ring outwards."""
    import numpy as np
    w, h = src.size
    px = np.empty(w * h * 4, dtype=np.float32)
    src.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    done = px[..., 3] > 0.5
    px[..., 3] = 1.0
    rgb = px[..., :3]

    def shift(a, dy, dx):
        out = np.zeros_like(a)
        out[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] = \
            a[max(-dy, 0):h + min(-dy, 0), max(-dx, 0):w + min(-dx, 0)]
        return out

    for _ in range(w + h):
        if done.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros((h, w), np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy or dx:
                    f = shift(done, dy, dx)
                    acc += shift(rgb, dy, dx) * f[..., None]
                    cnt += f
        new = ~done & (cnt > 0)
        if not new.any():
            break
        rgb[new] = acc[new] / cnt[new][:, None]
        done |= new
    dst.pixels.foreach_set(px.ravel())


def bake_ao(ob, res=512, distance=0.35, strength=1.0, samples=None, ground="floor"):
    """Bake AO on a dedicated UV map 'AO' (shared atlas across the root and its node
    children) and multiply it into every non-emissive base colour. Models with node
    children bake without a margin and fill around the islands afterwards."""
    scene = bpy.context.scene
    objs = asset_objects(ob)
    for o in objs:
        me = o.data
        while me.uv_layers:
            me.uv_layers.remove(me.uv_layers[0])
        me.uv_layers.new(name="AO")

    _deselect()
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")  # multi-object edit: one packed atlas
    bpy.ops.mesh.select_all(action="SELECT")
    # Margin scales with resolution so islands keep >= ~7 px apart (no bleed at 256²).
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=max(0.01, 7.0 / res),
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
        t.extension = "EXTEND"   # exported as CLAMP_TO_EDGE: no bleed across atlas edges
        t["ao"] = True
        t.location = (-700, 300)
        nt.nodes.active = t
        tex_nodes.append((m, t))

    # A floor (or, for wall-mounted items, a wall at y=0) for contact shadow.
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=5,
                          matrix=Matrix.Rotation(math.radians(90), 4, "X")
                          if ground == "wall" else Matrix())
    floor_me = bpy.data.meshes.new("_ao_floor")
    bm.to_mesh(floor_me)
    bm.free()
    floor = bpy.data.objects.new("_ao_floor", floor_me)
    coll().objects.link(floor)

    prev_engine = scene.render.engine
    _set_engine(scene, "CYCLES")
    scene.cycles.samples = samples or (1024 if res <= 512 else 256)
    scene.cycles.device = "CPU"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    scene.world.light_settings.distance = distance
    scene.render.bake.margin = 8
    # EXTEND fills the margin by stretching edge pixels; ADJACENT_FACES left dark notches
    # along diagonal island borders (dashed lines on rounded edges).
    scene.render.bake.margin_type = "EXTEND"
    # With node children, Blender bakes each object with its own margin and lays it over
    # texels the others already baked (a dark wedge, black cage wires): bake those with no
    # margin into a scratch image with alpha, then fill around the islands from it.
    scratch = None
    if len(objs) > 1:
        scratch = bpy.data.images.new(img_name + "_bake", res, res, alpha=True)
        scratch.generated_color = (0, 0, 0, 0)
        for m, t in tex_nodes:
            t.image = scratch
        scene.render.bake.margin = 0
    bpy.ops.object.bake(type="AO", use_clear=True)
    if scratch is not None:
        for m, t in tex_nodes:
            t.image = img
        _fill_margin(scratch, img)
        bpy.data.images.remove(scratch)
    bpy.data.objects.remove(floor, do_unlink=True)
    bpy.data.meshes.remove(floor_me)
    _set_engine(scene, prev_engine)

    # Soften: ao' = 1 - strength * (1 - ao), keeps the occlusion gentle and toy-like.
    import numpy as np
    px = np.empty(res * res * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    px[:, :3] = 1.0 - strength * (1.0 - px[:, :3])
    img.pixels.foreach_set(px.ravel())
    img.update()
    img.pack()

    for o in objs:
        _screen_uvs(o.data)

    for m, t in tex_nodes:
        # Planar-UV materials (Screen/Board/Label) overlap the atlas: never sample the AO.
        if m.get("emissive") or m.get("no_ao") or m.name.split("@")[0] in UV_PLANAR:
            continue
        nt = m.node_tree
        b = principled(m)
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


UV_PLANAR = ("Screen", "Board", "Label")  # materials the game draws on: planar 0..1 front UVs


def _screen_uvs(me):
    """Faces using a `Screen`/`Board` material get a planar 0..1 UV (front view, X→u, Z→v)
    so the game can swap a canvas texture onto it. Mark those materials emissive or set
    m["no_ao"] = True so they never sample the AO."""
    for mname in UV_PLANAR:
        idx = [i for i, m in enumerate(me.materials) if m.name.split("@")[0] == mname]
        if not idx:
            continue
        polys = [p for p in me.polygons if p.material_index in idx]
        xs = [me.vertices[v].co.x for p in polys for v in p.vertices]
        zs = [me.vertices[v].co.z for p in polys for v in p.vertices]
        x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
        uv = me.uv_layers["AO"].data
        for p in polys:
            for li in p.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                uv[li].uv = ((co.x - x0) / max(x1 - x0, 1e-6), (co.z - z0) / max(z1 - z0, 1e-6))


def export_glb(ob, name, image_format="WEBP", quality=85):
    os.makedirs(MODELS_DIR, exist_ok=True)
    path = os.path.join(MODELS_DIR, name + ".glb")
    _deselect()
    for o in asset_objects(ob):
        o.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_materials="EXPORT",
                              export_image_format=image_format,
                              export_image_quality=quality)
    return path


# ---------------------------------------------------------------- preview render

def _studio():
    c = bpy.data.collections.get(STUDIO)
    if c is None:
        c = bpy.data.collections.new(STUDIO)
        bpy.context.scene.collection.children.link(c)
    c.hide_viewport = True  # keep the live viewport clean; still renders
    c.hide_render = False
    for ob in list(c.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    return c


def _light(c, name, kind, energy, loc, size, color="#FFFFFF"):
    ld = bpy.data.lights.get(name) or bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = rgba(color)[:3]
    if kind == "AREA":
        ld.size = size
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    direction = -Vector(loc)
    ob.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    c.objects.link(ob)
    return ob


def render_preview(ob, name, res=(1200, 1000)):
    scene = bpy.context.scene
    c = _studio()
    lo, hi = _world_bounds(asset_objects(ob))
    centre = (lo + hi) / 2
    radius = (hi - lo).length / 2
    k = max(radius, 0.15)

    # Floor and world in the palette's sky colour.
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=40)
    fme = bpy.data.meshes.new("_floor")
    bm.to_mesh(fme)
    bm.free()
    floor = bpy.data.objects.new("_floor", fme)
    fme.materials.append(mat("_studio_floor", P["skyHorizon"], rough=0.95))
    # Floor items sit on z=0; wall items centred on the origin hang above a lowered floor.
    floor.location.z = 0.0 if lo.z > -0.02 else lo.z - 0.15
    c.objects.link(floor)

    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = rgba(P["skyHorizon"])
    bg.inputs["Strength"].default_value = 0.55

    # Warm "sun" key with a fairly tight soft shadow, cool fill, white rim.
    _light(c, "_key", "AREA", 300 * k * k, centre + Vector((-1.6, -1.8, 3.4)) * k * 1.5,
           0.8 * k + 0.2, "#FFF1D6")
    _light(c, "_fill", "AREA", 70 * k * k, centre + Vector((2.8, -1.5, 1.6)) * k * 1.4,
           3.0 * k + 1, "#DDEEFF")
    _light(c, "_rim", "AREA", 140 * k * k, centre + Vector((0.5, 3.0, 2.6)) * k * 1.4,
           2.0 * k + 1)

    cam_data = bpy.data.cameras.new("_cam")
    cam_data.lens = 70
    cam = bpy.data.objects.new("_cam", cam_data)
    c.objects.link(cam)
    direction = Vector((1.0, -1.35, 0.85)).normalized()
    half_fov = cam_data.angle / 2
    dist = radius / math.sin(half_fov) * 1.2
    cam.location = centre + direction * dist
    cam.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    _set_engine(scene, "BLENDER_EEVEE_NEXT", "BLENDER_EEVEE")
    try:
        scene.eevee.taa_render_samples = 64
        scene.eevee.use_shadows = True
    except AttributeError:
        pass
    try:
        scene.view_settings.view_transform = "Standard"
    except TypeError:
        pass
    scene.view_settings.look = "None"
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    os.makedirs(SNAPS_DIR, exist_ok=True)
    path = os.path.join(SNAPS_DIR, name + ".png")
    scene.render.filepath = path
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    return path


def finalize(name, ao_res=512, ao_distance=0.35, meta=None, samples=None):
    """Join → bake AO → export GLB (WebP AO) → preview render (→ sidecar if `meta`, a dict
    of sidecar() kwargs). Returns a short report."""
    ob = join_asset(name)
    tris = tri_count(ob)
    wall = str((meta or {}).get("mount", "")).startswith("wall")
    bake_ao(ob, ao_res, ao_distance, samples=samples, ground="wall" if wall else "floor")
    glb = export_glb(ob, name)
    png = render_preview(ob, name)
    # Namespace materials and node objects in the .blend so the next asset gets fresh names.
    for o in asset_objects(ob):
        for m in o.data.materials:
            if "@" not in m.name:
                m.name = m.name + "@" + name
        if o is not ob:
            o.name = o.name + "@" + name
    report = {"object": ob.name, "tris": tris, "glb": glb, "png": png,
              "kb": os.path.getsize(glb) // 1024}
    if meta:
        report["sidecar"] = sidecar(name, **meta)
    view(asset_objects(ob))
    return report
