"""Claude Rodin's character kit helpers, on top of lib.py (Monet and Lorrain build on it too:
keep it backward compatible).

- Rig dimensions: client/src/chars/rig-dimensions.json (head shape and size, face points,
  limb lengths and radii, mitten, foot, torso profile and chest joint, attach points),
  falling back to rig.ts DIM. HEAD may be a sphere or a rounded box; everything that sits
  on the head (face parts, hair, hats) finds the surface with head_sdf / head_front.
- Materials with the tintable names (`Skin`, `Shirt`, `Pants`, `Shoes`, `Hair`, `Accent`) in
  representative palette colours; the game recolours them by name.
- SDF sculpting: organic parts (hair, mitten, shoes, hood) are signed-distance fields built
  from smooth-unioned ellipsoids, round cones and boxes, cut along angular hairlines,
  grooved, meshed with OpenVDB and decimated to budget (sdf_mesh).
- Tubes, closed rings, decal patches on the face, lathes with seamless analytic normals
  (see _body.py for the torso, limbs and shoes).
- Preview mannequin: worn items are shown on a neutral bust; finalize() bakes AO with the
  bust as occluder (before the face is added), exports at the pivot, renders the catalog
  preview and writes the sidecar (artist Claude Rodin by default).

Conventions: Blender metres, Z-up, front faces -Y, character-left is +X (three.js +X).
Three.js (x, y, z) == Blender (x, -z, y).
"""
import json
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

import lib

# ---------------------------------------------------------------- rig dimensions

RIG_JSON = os.path.join(lib.ROOT, "client", "src", "chars", "rig-dimensions.json")
DIM = dict(pelvisY=0.42, hipX=0.105, shoulderX=0.215, shoulderY=0.25, neckY=0.34,
           headR=0.27, headUp=0.21, armLen=0.29, legLen=0.345)
# Head shape (three.js metres): "sphere" (rig.ts today) or "roundedBox" (ART-REFERENCE §1.1:
# 0.58 w × 0.54 h × 0.50 d, corner radius 0.19, jaw 6 % narrower).
HEAD = dict(shape="sphere", size=[0.54, 0.54, 0.54], radius=0.27, jaw=0.0)
RIG = {}
if os.path.exists(RIG_JSON):
    with open(RIG_JSON) as f:
        RIG = json.load(f)
    DIM.update({k: v for k, v in RIG.items() if isinstance(v, (int, float))})
    if isinstance(RIG.get("head"), dict):
        HEAD.update(RIG["head"])
    elif "headR" in RIG:
        HEAD.update(shape="sphere", size=[2 * RIG["headR"]] * 3, radius=RIG["headR"])

if os.environ.get("RODIN_HEAD") == "box":  # what-if previews of the ART-REFERENCE head
    HEAD.update(shape="roundedBox", size=[0.58, 0.54, 0.50], radius=0.19, jaw=0.06)

# Everything else the rig file pins down (three.js metres; see rig-dimensions.json).
_h = RIG.get("head", {})
if "r" in _h:
    HEAD.update(shape=_h.get("shape", "sphere"), size=[2 * _h["r"]] * 3, radius=_h["r"])
    DIM["headR"] = _h["r"]
DIM["neckY"] = _h.get("neckY", DIM["neckY"])
DIM["headUp"] = _h.get("centerAboveNeck", DIM["headUp"])
FACE = dict(eyes=dict(x=0.088, y=-0.005, radii=[0.037, 0.055, 0.0225], inset=0.012),
            brows=dict(x=0.092, y=0.094), mouth=dict(y=-0.093, width=0.08),
            cheeks=dict(x=0.158, y=-0.062, radii=[0.046, 0.032, 0.012]))
FACE.update(RIG.get("face", {}))
LIMB = dict(shoulder=dict(x=0.215, y=0.25, restSplayDeg=17), upperArm=dict(len=0.15, r=0.072),
            forearm=dict(len=0.13, r=0.066),
            hand=dict(radii=[0.074, 0.084, 0.06], offset=0.045,
                      thumb=dict(r=0.032, at=[0.0, -0.01, 0.045])),
            hip=dict(x=0.105), thigh=dict(len=0.17, r=0.085), shin=dict(len=0.15, r=0.078),
            foot=dict(size=[0.188, 0.14, 0.27], below=0.03, forward=0.052, toeOutDeg=7))
for _k in LIMB:
    if isinstance(RIG.get(_k), dict):
        LIMB[_k].update({k: v for k, v in RIG[_k].items() if not k.startswith("_")})
TORSO = dict(scaleZ=0.85, beltY=0.015, pantsOffset=0.011, chestPivotY=0.12)
if isinstance(RIG.get("torso"), dict):
    TORSO.update({k: v for k, v in RIG["torso"].items() if not k.startswith("_")})
ATTACH = {k: v for k, v in RIG.get("attach", {}).items() if not k.startswith("_")}
# Held items pivot at the rig's handGrip: this far from the mitten centre (three.js).
GRIP_FROM_HAND = ATTACH.get("handGrip", {}).get("at", [0.0, -0.03, 0.06])

R = DIM["headR"]  # nominal head radius (spherical helpers)
# Blender half extents of the head: x = width, y = depth, z = height.
HX, HY, HZ = HEAD["size"][0] / 2, HEAD["size"][2] / 2, HEAD["size"][1] / 2
HEAD_Y = DIM["neckY"] + DIM["headUp"]  # head centre above the pelvis

# Torso bean profile (radius, height above pelvis), scaled front-to-back by TORSO_Z.
TORSO_CTRL = [tuple(p) for p in TORSO.get("profile", [
    (0.0, -0.155), (0.12, -0.142), (0.205, -0.095), (0.243, 0.0), (0.24, 0.1),
    (0.214, 0.21), (0.165, 0.31), (0.09, 0.385), (0.0, 0.41)])]
TORSO_Z = TORSO["scaleZ"]


def bl(x, y, z):
    """three.js (x, y, z) → Blender Vector."""
    return Vector((x, -z, y))


def to_three(v):
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


# ---------------------------------------------------------------- materials

COL = dict(
    skin="#F7C59F", shirt="#4D96FF", pants="#2F3E66", shoes="#E63946", hair="#5A3825",
    accent="#FF5A5F", eye="#1E1B2E", cheek="#FF9AA2", mouth="#5A2A2A", white="#FFFFFF",
    ink="#2B2D42", tongue="#FF7A8A", sole="#F4F1EA", paper="#FFFDF7", metal="#C8D0DC",
    claude="#D97757", manager_shirt="#FFFFFF", manager_tie="#E63946",
    manager_pants="#2B2D42", manager_hair="#3B2A20",
)


def m_skin(c=None):
    return lib.mat("Skin", c or COL["skin"], rough=0.68)


def m_shirt(c=None):
    return lib.mat("Shirt", c or COL["shirt"], rough=0.78)


def m_pants(c=None):
    return lib.mat("Pants", c or COL["pants"], rough=0.8)


def m_shoes(c=None):
    return lib.mat("Shoes", c or COL["shoes"], rough=0.6)


def m_hair(c=None, rough=0.62):
    return lib.mat("Hair", c or COL["hair"], rough=rough)


def m_accent(c=None, rough=0.7):
    return lib.mat("Accent", c or COL["accent"], rough=rough)


def m_eye():
    return lib.mat("Eye", COL["eye"], rough=0.16)


def m_shine():
    return lib.mat("EyeShine", COL["white"], rough=0.3, emit=COL["white"], strength=1.0)


def m_mouth():
    return lib.mat("Mouth", COL["mouth"], rough=0.45)


def translucent(name, hex_str, alpha, rough=0.6):
    """Alpha-blended surface (glTF alphaMode BLEND); never multiplied by the AO."""
    m = lib.mat(name, hex_str, rough=rough)
    lib.principled(m).inputs["Alpha"].default_value = alpha
    m.surface_render_method = "BLENDED"
    m["no_ao"] = True
    return m


def m_cheek():
    return translucent("Cheek", COL["cheek"], 0.5)


def flat(name, hex_str, rough=0.6, metal=0.0):
    return lib.mat(name, hex_str, rough=rough, metal=metal)


# ---------------------------------------------------------------- frames + head surface

def frame_from(out, up=(0, 0, 1)):
    """3x3 matrix whose columns are a local frame with local -Y = `out` (the feature's
    front), local +Z as close to `up` as possible."""
    n = Vector(out).normalized()
    u = Vector(up)
    u = (u - n * u.dot(n))
    if u.length < 1e-6:
        u = Vector((0, 1, 0)) - n * n.y
    u.normalize()
    y = -n
    x = y.cross(u)
    return Matrix((x, y, u)).transposed()


def head_sdf(P):
    """Signed distance to the head (N×3 Blender coords, head centre at the origin)."""
    if HEAD["shape"] == "sphere":
        return np.linalg.norm(P, axis=1) - HEAD["radius"]
    Q = np.array(P, dtype=np.float32, copy=True)
    if HEAD.get("jaw"):
        t = np.clip(-Q[:, 2] / HZ, 0.0, 1.0)
        Q[:, 0] /= 1.0 - HEAD["jaw"] * t * t * (3 - 2 * t)
    rr = HEAD["radius"]
    q = np.abs(Q) - (np.array([HX, HY, HZ], dtype=np.float32) - rr)
    return (np.linalg.norm(np.maximum(q, 0.0), axis=1) + np.minimum(np.max(q, axis=1), 0.0)
            - rr)


def ray_hits(fn, origins, dirs, t0=0.0, t1=0.7, iters=28):
    """Vectorised bisection: for each ray origin + t*dir (fn < 0 at t0, > 0 at t1) the t
    where fn crosses zero."""
    o = np.asarray(origins, dtype=np.float32).reshape(-1, 3)
    d = np.asarray(dirs, dtype=np.float32).reshape(-1, 3)
    lo = np.full(len(d), t0, dtype=np.float32)
    hi = np.full(len(d), t1, dtype=np.float32)
    for _ in range(iters):
        m = 0.5 * (lo + hi)
        out = fn(o + d * m[:, None]) > 0
        hi = np.where(out, m, hi)
        lo = np.where(out, lo, m)
    return 0.5 * (lo + hi)


def first_hit(fn, origin, direction, t_max=0.5, step=0.003):
    """March from `origin` (outside, fn > 0) along `direction` to the FIRST surface crossing,
    then refine by bisection. Returns the hit point, or None."""
    o = Vector(origin)
    d = Vector(direction).normalized()
    ts = np.arange(0.0, t_max, step, dtype=np.float32)
    P = np.array([tuple(o + d * float(t)) for t in ts], dtype=np.float32)
    v = fn(P)
    inside = np.nonzero(v < 0)[0]
    if len(inside) == 0:
        return None
    k = int(inside[0])
    lo, hi = float(ts[max(k - 1, 0)]), float(ts[k])
    for _ in range(20):
        m = 0.5 * (lo + hi)
        if float(fn(np.array([tuple(o + d * m)], dtype=np.float32))[0]) > 0:
            lo = m
        else:
            hi = m
    return o + d * (0.5 * (lo + hi))


def sdf_normal(fn, p, eps=1e-4):
    p = np.asarray(p, dtype=np.float32).reshape(1, 3)
    g = []
    for i in range(3):
        e = np.zeros((1, 3), dtype=np.float32)
        e[0, i] = eps
        g.append(float(fn(p + e)[0] - fn(p - e)[0]))
    return Vector(g).normalized()


def head_front(fx, fy):
    """(surface point, outward normal) of the head's face at face coords (fx char-left,
    fy up), found along -Y."""
    t = float(ray_hits(head_sdf, [(fx, 0.0, fy)], [(0.0, -1.0, 0.0)])[0])
    p = Vector((fx, -t, fy))
    return p, sdf_normal(head_sdf, p)


def face_point(fx, fy, out=0.0):
    p, n = head_front(fx, fy)
    return p + n * out


def face_dir(fx, fy, r=R):
    """Outward normal of the face at face coords."""
    return head_front(fx, fy)[1]


def on_head(fx, fy, out=0.0, r=R):
    """(location, 3x3 frame) of a feature at face coords, `out` metres off the surface."""
    p, n = head_front(fx, fy)
    return p + n * out, frame_from(n)


def head_point(direction, out=0.0):
    """Head surface point along a direction from the centre, pushed `out` along it."""
    d = Vector(direction).normalized()
    t = float(ray_hits(head_sdf, [(0, 0, 0)], [tuple(d)])[0])
    return d * (t + out)


def sph(theta, phi, r=R):
    """Head-centred spherical point: theta degrees from the crown, phi degrees around
    (0 = front -Y, 90 = character-left +X, 180 = back, 270 = character-right)."""
    t, p = math.radians(theta), math.radians(phi)
    return Vector((r * math.sin(t) * math.sin(p), -r * math.sin(t) * math.cos(p),
                   r * math.cos(t)))


def place(ob, loc, frame):
    ob.location = loc
    ob.rotation_euler = frame.to_euler()
    return ob


def hand_from_grip():
    """Blender offset of the mitten centre from the rig's handGrip point (held items are
    modelled around the mitten centre, then shifted so the GLB origin is the grip)."""
    return -bl(*GRIP_FROM_HAND)


def regrip(objs=None):
    """Re-pivot a held item modelled around the mitten centre onto the rig's handGrip."""
    objs = list(lib.coll().objects) if objs is None else objs
    return transform(objs, Matrix.Translation(hand_from_grip()))


def transform(objs, m):
    """Pre-multiply 4x4 `m` onto each object's own transform. Uses matrix_basis, which is
    built from loc/rot/scale directly (matrix_world is stale on objects created since the
    last depsgraph update)."""
    for ob in objs:
        ob.matrix_basis = m @ ob.matrix_basis
    return objs


# ---------------------------------------------------------------- curves + tubes

def catmull(ctrl, samples=24):
    """Uniform Catmull-Rom through `ctrl` (like three.js SplineCurve.getPoints)."""
    pts = [Vector(c) for c in ctrl]
    n = len(pts)
    out = []
    for i in range(samples + 1):
        p = (n - 1) * i / samples
        k = min(int(math.floor(p)), n - 2)
        w = p - k
        p0 = pts[k - 1] if k > 0 else pts[k]
        p1, p2 = pts[k], pts[k + 1]
        p3 = pts[k + 2] if k + 2 < n else pts[n - 1]
        v0 = (p2 - p0) * 0.5
        v1 = (p3 - p1) * 0.5
        t2, t3 = w * w, w * w * w
        out.append((2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2
                   + v0 * w + p1)
    return out


def tube(name, pts, radius, material, ring=12, caps=True, cap_rings=4):
    """Sweep a circle along `pts` (Blender coords). `radius` is a number, a list (one per
    point) or a function of t in 0..1. Rounded (hemispherical) end caps."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    if callable(radius):
        rad = [radius(i / (n - 1)) for i in range(n)]
    elif isinstance(radius, (int, float)):
        rad = [radius] * n
    else:
        rad = list(radius)
    tang = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
    # Parallel-transport frames so the tube never twists.
    t0 = tang[0]
    ref = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))
    nrm = (ref - t0 * ref.dot(t0)).normalized()
    frames = []
    for i in range(n):
        if i > 0:
            nrm = (nrm - tang[i] * nrm.dot(tang[i])).normalized()
        frames.append((nrm.copy(), tang[i].cross(nrm)))
    bm = bmesh.new()
    rings = []

    def ring_at(c, a, b, r):
        return [bm.verts.new(c + (a * math.cos(2 * math.pi * j / ring) +
                                  b * math.sin(2 * math.pi * j / ring)) * r)
                for j in range(ring)]

    if caps:
        a, b = frames[0]
        for k in range(cap_rings, 0, -1):
            ang = (math.pi / 2) * k / (cap_rings + 1)
            rings.append(ring_at(pts[0] - tang[0] * rad[0] * math.sin(ang), a, b,
                                 rad[0] * math.cos(ang)))
    for i in range(n):
        a, b = frames[i]
        rings.append(ring_at(pts[i], a, b, rad[i]))
    if caps:
        a, b = frames[-1]
        for k in range(1, cap_rings + 1):
            ang = (math.pi / 2) * k / (cap_rings + 1)
            rings.append(ring_at(pts[-1] + tang[-1] * rad[-1] * math.sin(ang), a, b,
                                 rad[-1] * math.cos(ang)))
    for r0, r1 in zip(rings, rings[1:]):
        for j in range(ring):
            bm.faces.new((r0[j], r0[(j + 1) % ring], r1[(j + 1) % ring], r1[j]))
    if caps:
        tip0 = bm.verts.new(pts[0] - tang[0] * rad[0])
        tip1 = bm.verts.new(pts[-1] + tang[-1] * rad[-1])
        for j in range(ring):
            bm.faces.new((rings[0][(j + 1) % ring], rings[0][j], tip0))
            bm.faces.new((rings[-1][j], rings[-1][(j + 1) % ring], tip1))
    else:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lib._link(name, bm, material)


def ring_tube(name, pts, radius, material, ring=10):
    """A closed tube through the loop `pts` (glasses rims, bands)."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    centre = sum(pts, Vector((0, 0, 0))) / n
    bm = bmesh.new()
    rows = []
    for i in range(n):
        t = (pts[(i + 1) % n] - pts[i - 1]).normalized()
        out = (pts[i] - centre)
        out = (out - t * out.dot(t)).normalized()
        b = t.cross(out)
        rows.append([bm.verts.new(pts[i] + (out * math.cos(2 * math.pi * j / ring) +
                                            b * math.sin(2 * math.pi * j / ring)) * radius)
                     for j in range(ring)])
    for i in range(n):
        r0, r1 = rows[i], rows[(i + 1) % n]
        for j in range(ring):
            bm.faces.new((r0[j], r0[(j + 1) % ring], r1[(j + 1) % ring], r1[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return lib._link(name, bm, material)


def rrect_loop(hw, hh, r, n=6):
    """Rounded-rectangle loop (x, z) centred on 0, corner radius r, n points per corner."""
    out = []
    for cx, cz, a0 in ((hw - r, hh - r, 0), (-hw + r, hh - r, 90), (-hw + r, -hh + r, 180),
                       (hw - r, -hh + r, 270)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            out.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return out


def mesh_from(name, verts, faces, material, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate()
    if smooth:
        me.shade_smooth()
    if material:
        me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    lib.coll().objects.link(ob)
    return ob


def quad_sphere(name, radius, material, cuts=11, deform=None, loc=(0, 0, 0)):
    """Evenly spread quad sphere (spherified cube). `deform(unit_dir) -> radius scale`."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co
        x2, y2, z2 = x * x, y * y, z * z
        d = Vector((x * math.sqrt(max(0, 1 - y2 / 2 - z2 / 2 + y2 * z2 / 3)),
                    y * math.sqrt(max(0, 1 - z2 / 2 - x2 / 2 + z2 * x2 / 3)),
                    z * math.sqrt(max(0, 1 - x2 / 2 - y2 / 2 + x2 * y2 / 3)))).normalized()
        s = deform(d) if deform else 1.0
        v.co = d * radius * s if not isinstance(s, Vector) else s
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lib._link(name, bm, material, loc)


def dome(name, material, u=20, v=10, keep=0.15):
    """Unit UV sphere with its back (local +Y beyond `keep`) removed: for features half
    buried in a surface (eyes, cheeks), so no triangles are wasted inside the head."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    back = [f for f in bm.faces if all(vv.co.y > keep for vv in f.verts)]
    bmesh.ops.delete(bm, geom=back, context="FACES")
    return lib._link(name, bm, material)


def lathe_spline(name, ctrl, material, samples=40, verts=32, scale=(1, 1, 1), loc=(0, 0, 0)):
    """Lathe a Catmull-Rom (radius, z) profile around Z (radius 0 at the ends closes it)."""
    pts = catmull([(r, z, 0) for r, z in ctrl], samples)
    prof = [(max(0.0, p.x), p.y) for p in pts]
    prof[0] = (0.0, prof[0][1]) if ctrl[0][0] == 0 else prof[0]
    prof[-1] = (0.0, prof[-1][1]) if ctrl[-1][0] == 0 else prof[-1]
    ob = lib.lathe(name, prof, loc=loc, material=material, verts=verts)
    ob.scale = scale
    return ob


# ---------------------------------------------------------------- SDF sculpting

def _arr(v):
    return np.asarray(v, dtype=np.float32)


def _local(P, c, rot=None):
    q = P - _arr(c)
    if rot is not None:
        q = q @ _arr(rot)  # rot columns = local axes in world coords
    return q


def rot3(rx=0.0, ry=0.0, rz=0.0):
    """Euler XYZ (radians) → 3x3 numpy rotation (columns are the local axes)."""
    from mathutils import Euler
    return np.array(Euler((rx, ry, rz)).to_matrix(), dtype=np.float32)


def look(direction, up=(0, 0, 1)):
    """3x3 numpy frame whose local +Z points along `direction`."""
    d = Vector(direction).normalized()
    u = Vector(up)
    if abs(d.dot(u.normalized())) > 0.99:
        u = Vector((0, -1, 0))
    x = u.cross(d).normalized()
    y = d.cross(x)
    return np.array(Matrix((x, y, d)).transposed(), dtype=np.float32)


def sd_sphere(P, c, r):
    return np.linalg.norm(P - _arr(c), axis=1) - r


def sd_ellipsoid(P, c, radii, rot=None):
    q = _local(P, c, rot)
    rr = _arr(radii)
    k0 = np.linalg.norm(q / rr, axis=1)
    k1 = np.linalg.norm(q / (rr * rr), axis=1)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


def sd_round_box(P, c, half, r, rot=None):
    q = np.abs(_local(P, c, rot)) - (_arr(half) - r)
    return (np.linalg.norm(np.maximum(q, 0.0), axis=1) + np.minimum(np.max(q, axis=1), 0.0)
            - r)


def sd_torus(P, c, major, minor, rot=None):
    """Ring in the local XY plane."""
    q = _local(P, c, rot)
    qx = np.sqrt(q[:, 0] ** 2 + q[:, 1] ** 2) - major
    return np.sqrt(qx * qx + q[:, 2] ** 2) - minor


def sd_round_cone(P, a, b, r1, r2):
    """Capsule from a (radius r1) to b (radius r2) (iq's exact round cone)."""
    a, b = _arr(a), _arr(b)
    ba = b - a
    l2 = float(ba @ ba)
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pa = P - a
    y = pa @ ba
    z = y - l2
    w = pa * l2 - np.outer(y, ba)
    x2 = np.sum(w * w, axis=1)
    y2 = y * y * l2
    z2 = z * z * l2
    k = math.copysign(1.0, rr) * rr * rr * x2
    d_end = np.sqrt(x2 + z2) * il2 - r2
    d_start = np.sqrt(x2 + y2) * il2 - r1
    d_mid = (np.sqrt(np.maximum(x2 * a2 * il2, 0.0)) + y * rr) * il2 - r1
    return np.where(np.sign(z) * a2 * z2 > k, d_end,
                    np.where(np.sign(y) * a2 * y2 < k, d_start, d_mid))


def sd_capsule(P, a, b, r):
    a, b = _arr(a), _arr(b)
    ba = b - a
    pa = P - a
    h = np.clip((pa @ ba) / float(ba @ ba), 0.0, 1.0)
    return np.linalg.norm(pa - np.outer(h, ba), axis=1) - r


def sd_lock(P, pts, radii, k=0.01):
    """A tapered curved lock: round cones chained through control points."""
    d = None
    for i in range(len(pts) - 1):
        di = sd_round_cone(P, pts[i], pts[i + 1], radii[i], radii[i + 1])
        d = di if d is None else smin(d, di, k)
    return d


def _sph_frame(theta, phi, roll=0.0):
    """Unit normal and tangents (down the head, around the head) at spherical (theta, phi)
    degrees; `roll` degrees turns the tangents about the normal."""
    t, p = math.radians(theta), math.radians(phi)
    n = Vector((math.sin(t) * math.sin(p), -math.sin(t) * math.cos(p), math.cos(t)))
    down = Vector((math.cos(t) * math.sin(p), -math.cos(t) * math.cos(p), -math.sin(t)))
    around = n.cross(down).normalized()  # toward increasing phi
    if roll:
        q = Matrix.Rotation(math.radians(roll), 3, n)
        down, around = q @ down, q @ around
    return n, down, around


def sd_lobe(P, theta, phi, size, r=R, lift=0.0, roll=0.0, centre=(0, 0, 0)):
    """A hair section: an ellipsoid that bends with a sphere of radius r around `centre`.
    size = (half width around the head, half length down the head, half thickness);
    the lobe's middle sits at spherical (theta, phi), `lift` metres off that sphere."""
    n, down, around = _sph_frame(theta, phi, roll)
    Q = P - _arr(centre)
    a = Q @ _arr(n)
    u = r * np.arctan2(Q @ _arr(around), a)
    v = r * np.arctan2(Q @ _arr(down), a)
    w = np.linalg.norm(Q, axis=1) - (r + lift)
    q = np.stack([u, v, w], axis=1)
    rr = _arr(size)
    k0 = np.linalg.norm(q / rr, axis=1)
    k1 = np.linalg.norm(q / (rr * rr), axis=1)
    d = k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)
    return np.where(a > -0.05, d, 1.0)  # ignore the far side of the head


def sph_dir(theta, phi):
    t, p = math.radians(theta), math.radians(phi)
    return Vector((math.sin(t) * math.sin(p), -math.sin(t) * math.cos(p), math.cos(t)))


def surface_point(fn, direction, r0=0.05, r1=0.6, centre=(0, 0, 0), iters=26):
    """Where the SDF `fn` crosses zero along the ray centre + t * direction (fn < 0 at r0,
    > 0 at r1). Used to lay grooves exactly on a sculpted surface."""
    c = Vector(centre)
    d = Vector(direction).normalized()
    lo, hi = r0, r1
    for _ in range(iters):
        m = 0.5 * (lo + hi)
        v = float(fn(np.array([tuple(c + d * m)], dtype=np.float32))[0])
        if v > 0:
            hi = m
        else:
            lo = m
    return c + d * (0.5 * (lo + hi))


def groove_path(fn, ctrl, samples=14, sink=0.0, centre=(0, 0, 0), extend=0.0):
    """Points on the surface of `fn` along a Catmull-Rom through (theta, phi) controls,
    `sink` metres below it (negative: above, for a shallow wide channel). `extend` runs the
    path on past its last point, so a groove ending at an edge notches it."""
    dirs = catmull([tuple(sph_dir(t, p)) for t, p in ctrl], samples)
    out = []
    for d in dirs:
        p = surface_point(fn, d, centre=centre)
        out.append(p - Vector(d).normalized() * sink)
    if extend:
        a, b = out[-2], out[-1]
        out.append(b + (b - a).normalized() * extend)
    return out


def bounded(P, lo, hi, f, far=1.0):
    """Evaluate the SDF f only inside the box lo..hi (cheap for small features on a big
    grid); `far` elsewhere."""
    lo, hi = _arr(lo), _arr(hi)
    m = np.all((P >= lo) & (P <= hi), axis=1)
    out = np.full(len(P), far, dtype=np.float32)
    if m.any():
        out[m] = f(P[m])
    return out


def sd_groove(P, pts, r_start, r_end=None, k=0.004):
    """A channel along `pts` (subtract it with smax): tapered round cones, evaluated only
    near the path."""
    r_end = r_start if r_end is None else r_end
    n = len(pts)
    radii = [r_start + (r_end - r_start) * (i / (n - 1)) ** 2 for i in range(n)]
    pts = [tuple(p) for p in pts]
    m = max(radii) + k + 0.01
    lo = np.min(np.array(pts), axis=0) - m
    hi = np.max(np.array(pts), axis=0) + m
    return bounded(P, lo, hi, lambda Q: sd_lock(Q, pts, radii, k=k))


def sph_angles(P, centre=(0, 0, 0)):
    """(theta, phi, r) per point: theta degrees from the crown, phi degrees around
    (0 = front -Y, +90 = character-left +X, ±180 = back)."""
    Q = P - _arr(centre)
    r = np.linalg.norm(Q, axis=1)
    theta = np.degrees(np.arccos(np.clip(Q[:, 2] / np.maximum(r, 1e-9), -1.0, 1.0)))
    phi = np.degrees(np.arctan2(Q[:, 0], -Q[:, 1]))
    return theta, phi, r


def sd_hairline(P, edge, r_ref=None, centre=(0, 0, 0)):
    """Negative on the hair side of a hairline: theta < edge(phi) (both degrees; `edge`
    takes a numpy array of phi). Combine with smax to cut hair along any edge curve:
    fringes, scallops, sideburns, napes."""
    theta, phi, r = sph_angles(P, centre)
    return np.radians(theta - edge(phi)) * (r_ref or (R + 0.03))


def bumps(phi, centres, width, height):
    """Sum of gaussian bumps over phi (degrees): scalloped tips along an edge."""
    out = np.zeros_like(phi, dtype=np.float32)
    for c in centres:
        d = (phi - c + 180.0) % 360.0 - 180.0
        out += height * np.exp(-(d / width) ** 2)
    return out


def ramp(x, a, b):
    """Smoothstep from 0 at a to 1 at b (vectorised)."""
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def carved(base, grooves, r0=0.002, r1=0.0085, sink=-0.001, extend=0.03, k=0.005):
    """SDF: `base` with grooves carved along (theta, phi) control paths laid on its own
    surface (paths are computed once, on first call)."""
    cache = {}

    def fn(P):
        if "paths" not in cache:
            cache["paths"] = [groove_path(base, g, samples=12, sink=sink, extend=extend)
                              for g in grooves]
        d = base(P)
        for pts in cache["paths"]:
            d = smax(d, -sd_groove(P, pts, r0, r1), k)
        return d
    return fn


def fib_dirs(n, seed=0):
    """n roughly even unit directions (Fibonacci sphere), with a little seeded jitter."""
    rnd = np.random.default_rng(seed)
    i = np.arange(n) + 0.5
    z = 1 - 2 * i / n
    a = math.pi * (1 + 5 ** 0.5) * i + rnd.uniform(-0.25, 0.25, n)
    r = np.sqrt(1 - z * z)
    return np.stack([r * np.cos(a), r * np.sin(a), z], axis=1)


def sd_spheres(P, centres, radii, k):
    """Smooth union of many spheres, each evaluated only near itself."""
    d = np.full(len(P), 1.0, dtype=np.float32)
    for c, r in zip(centres, radii):
        m = r + k + 0.004
        sd = bounded(P, np.asarray(c) - m, np.asarray(c) + m,
                     lambda Q, c=c, r=r: np.linalg.norm(Q - _arr(c), axis=1) - r)
        d = smin(d, sd, k)
    return d


def hair_mesh(name, fn, color, lo=(-0.36, -0.38, -0.26), hi=(0.36, 0.38, 0.38), target=1950,
              voxel=0.0035, rough=0.62):
    """Mesh a hair SDF (pivot = head centre), trimmed inside the head, decimated to budget."""
    return sdf_mesh(name, fn, lo, hi, m_hair(color, rough), voxel=voxel, trim=outside_head(),
                    target=target, remesh="decimate")


def sd_shell(P, r_in, r_out, centre=(0, 0, 0)):
    """Spherical shell between r_in and r_out."""
    dist = np.linalg.norm(P - _arr(centre), axis=1)
    return np.maximum(r_in - dist, dist - r_out)


def sd_plane(P, n, offset):
    """Half-space: negative where dot(P, n) < offset."""
    return P @ _arr(Vector(n).normalized()) - offset


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.minimum(a, b) - h * h * k * 0.25


def smax(a, b, k):
    return -smin(-a, -b, k)


def union(ds, k=0.0):
    d = ds[0]
    for x in ds[1:]:
        d = smin(d, x, k)
    return d


def _orient(bm, fn, voxel):
    """Normals must point where the SDF grows (outward); check a sample and flip if not."""
    bm.normal_update()
    sample = bm.faces[:][:: max(1, len(bm.faces) // 400)]
    if sample:
        c = np.array([f.calc_center_median() for f in sample], dtype=np.float32)
        n = np.array([f.normal for f in sample], dtype=np.float32)
        eps = voxel * 0.75
        grow = fn(c + n * eps) - fn(c - n * eps)
        if np.mean(grow > 0) < 0.5:
            bmesh.ops.reverse_faces(bm, faces=bm.faces[:])


def _trim(me, trim):
    """Delete faces whose every vertex is where trim(P) < 0 (buried in the head)."""
    bm = bmesh.new()
    bm.from_mesh(me)
    co = np.array([v.co for v in bm.verts], dtype=np.float32)
    inside = trim(co) < 0
    dead = [f for f in bm.faces if all(inside[v.index] for v in f.verts)]
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(me)
    bm.free()


def _quadriflow(ob, quads, symmetric):
    lib._deselect()
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    try:
        res = bpy.ops.object.quadriflow_remesh(
            use_mesh_symmetry=symmetric, use_preserve_sharp=False,
            use_preserve_boundary=False, preserve_attributes=False, smooth_normals=False,
            mode="FACES", target_faces=int(quads), seed=0)
    except RuntimeError as e:
        print("[kit] quadriflow failed:", e)
        return False
    if "FINISHED" not in res:
        print("[kit] quadriflow cancelled on", ob.name, "- decimating instead")
    return "FINISHED" in res


def sdf_mesh(name, fn, lo, hi, material, voxel=0.004, adaptivity=0.0, trim=None,
             target=None, symmetric=False, remesh="quad"):
    """Mesh the zero level of the SDF `fn(P)` (P: N×3 Blender coords) over the box lo..hi.
    `trim(P) < 0` marks points to cut away (faces entirely inside are deleted: e.g. the
    part of the hair hidden inside the head). `target`: about that many visible tris, by
    Quadriflow (`remesh="quad"`: clean even quads, smooth shading) or a Decimate modifier."""
    import openvdb as vdb
    lo = Vector(lo)
    hi = Vector(hi)
    axes = [np.arange(lo[i], hi[i] + voxel * 0.5, voxel, dtype=np.float32) for i in range(3)]
    shape = tuple(len(a) for a in axes)
    X, Y, Z = np.meshgrid(*axes, indexing="ij")
    P = np.stack([X.ravel(), Y.ravel(), Z.ravel()], axis=1)
    del X, Y, Z
    d = fn(P).astype(np.float32).reshape(shape)
    del P
    # Clamp far values so the grid is a tidy narrow band.
    band = voxel * 4
    np.clip(d, -band, band, out=d)
    g = vdb.FloatGrid(band)
    g.copyFromArray(d)
    pts, tris, quads = g.convertToPolygons(0.0, adaptivity)
    pts = np.asarray(pts, dtype=np.float64) * voxel + np.asarray(lo, dtype=np.float64)
    faces = [tuple(int(i) for i in t) for t in np.asarray(tris)]
    faces += [tuple(int(i) for i in q) for q in np.asarray(quads)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(pts.tolist(), [], faces)
    me.validate()
    bm = bmesh.new()
    bm.from_mesh(me)
    # Weld the odd sub-0.3 mm edge (Quadriflow refuses meshes with any), then make the
    # winding consistent (OpenVDB's triangles and quads don't share one) and outward.
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=3e-4)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    _orient(bm, fn, voxel)
    bm.to_mesh(me)
    bm.free()
    if material:
        me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    lib.coll().objects.link(ob)

    def tris_of(m):
        return sum(len(p.vertices) - 2 for p in m.polygons)

    def visible_fraction(m):
        if trim is None:
            return 1.0
        co = np.array([v.co for v in m.vertices], dtype=np.float32)
        inside = trim(co) < 0
        tot = vis = 0.0
        for p in m.polygons:
            tot += p.area
            if not all(inside[i] for i in p.vertices):
                vis += p.area
        return max(vis / max(tot, 1e-9), 0.15)

    done = False
    if target and remesh == "quad" and tris_of(me) > target:
        frac = visible_fraction(me)
        done = _quadriflow(ob, target / 2 / frac, symmetric)
        me = ob.data
    if trim is not None:
        _trim(me, trim)
    me.shade_smooth()
    if target and not done and tris_of(me) > target:
        mod = ob.modifiers.new("Decimate", "DECIMATE")
        mod.ratio = target / tris_of(me)
        mod.use_symmetry = symmetric
        mod.symmetry_axis = "X"
    return ob


def outside_head(margin=0.004):
    """trim() for head-worn SDF parts: cut what is buried inside the head."""
    return lambda P: head_sdf(P) + margin


def bake_away(ob, mat_names=()):
    """Shift AO bake responsibility: mark materials that should not sample the AO."""
    for m in ob.data.materials:
        if m.name.split("@")[0] in mat_names:
            m["no_ao"] = True


# ---------------------------------------------------------------- shared body builders

def head_deform(d):
    """Soft egg: the lower face/jaw a touch fuller and wider, the very bottom flatter. The
    face band (eyes, brows, mouth, cheeks) stays on the r = headR sphere so features from
    rig.ts still sit right."""
    z = d.z
    s = 1.0
    if z < -0.3:
        t = min(1.0, (-0.3 - z) / 0.45)
        s += 0.035 * t * t * (3 - 2 * t)
    if z < -0.85:
        s -= 0.25 * (-0.85 - z)
    return s


def head_mesh(name, material, cuts=11, loc=(0, 0, 0)):
    """The head surface as an evenly spread quad mesh: the rig's sphere (with a soft-egg
    jaw) or the rounded box, whichever HEAD says."""
    ob = quad_sphere(name, 1.0, material, cuts=cuts, loc=loc)
    me = ob.data
    dirs = np.array([v.co.normalized() for v in me.vertices], dtype=np.float32)
    if HEAD["shape"] == "sphere":
        t = np.array([HEAD["radius"] * head_deform(Vector(d)) for d in dirs], dtype=np.float32)
    else:
        t = ray_hits(head_sdf, np.zeros_like(dirs), dirs)
    me.vertices.foreach_set("co", (dirs * t[:, None]).ravel())
    me.update()
    return ob


def cheeks(prefix, material, at=Vector((0, 0, 0)), scale=1.0):
    """Two soft blush discs sunk into the head so only a thin cap shows."""
    out = []
    cx, cy = FACE["cheeks"]["x"], FACE["cheeks"]["y"]
    crx, cry, crz = FACE["cheeks"]["radii"]
    for s in (1, -1):
        loc, fr = on_head(s * cx, cy, -0.004)
        ob = dome(f"{prefix}Cheek{'L' if s > 0 else 'R'}", material, u=16, v=8, keep=0.3)
        ob.scale = (crx * scale, crz * scale, cry * scale)
        place(ob, at + loc, fr)
        out.append(ob)
    return out


EYE_X, EYE_Y = FACE["eyes"]["x"], FACE["eyes"]["y"]


def eye(prefix, side, M, at=Vector((0, 0, 0)), size=1.0):
    """One big glossy eye on the head at face coords (side*EYE_X, EYE_Y). Returns parts and
    the eye centre (its blink pivot)."""
    loc, fr = on_head(side * EYE_X, EYE_Y, -FACE["eyes"]["inset"])
    ex, ey, ez = FACE["eyes"]["radii"]
    rx, rz, ry = ex * size, ey * size, ez * size  # half width, height, depth
    parts = []
    body = dome(f"{prefix}Ball", M["eye"], u=28, v=16, keep=0.2)
    body.scale = (rx, ry, rz)
    place(body, at + loc, fr)
    parts.append(body)

    def on_eye(lx, lz, sx, sz, mat, nm, lift=0.0006):
        # A thin highlight disc lying on the eye's front surface at local (lx, lz).
        ly = -ry * math.sqrt(max(0.0, 1 - (lx / rx) ** 2 - (lz / rz) ** 2))
        nrm = Vector((lx / (rx * rx), ly / (ry * ry), lz / (rz * rz))).normalized()
        ob = dome(f"{prefix}{nm}", mat, u=14, v=8, keep=0.0)
        ob.scale = (sx, 0.0028 * size, sz)
        lf = frame_from(nrm)
        ob.matrix_world = Matrix.Translation(at + loc + fr @ (Vector((lx, ly, lz)) + nrm * lift)) \
            @ (fr @ lf).to_4x4() @ Matrix.Diagonal((sx, 0.0028 * size, sz, 1))
        return ob

    # Big catchlight up and toward the outside, a small one low on the other side.
    parts.append(on_eye(side * 0.011 * size, 0.021 * size, 0.0125 * size, 0.0135 * size,
                        M["shine"], "ShineBig"))
    parts.append(on_eye(-side * 0.0105 * size, -0.02 * size, 0.0062 * size, 0.0062 * size,
                        M["shine"], "ShineSmall"))
    return parts, at + loc


def brow_centre(side):
    return face_point(side * FACE["brows"]["x"], FACE["brows"]["y"])


def brow(prefix, side, material, at=Vector((0, 0, 0)), fy=None, length=0.062, thick=0.0135,
         arch=0.006, tilt=0.0):
    """A chunky, slightly arched brow lying on the head surface; its middle sits on the
    rig's brow point (face.brows)."""
    fy = FACE["brows"]["y"] - arch if fy is None else fy
    bx = FACE["brows"]["x"]
    pts = []
    n = 7
    for i in range(n):
        t = i / (n - 1) - 0.5
        fx = side * (bx + t * length)
        y = fy + arch * (1 - 4 * t * t) + tilt * t * side
        pts.append(face_point(fx, y, thick * 0.35))
    rad = lambda t: thick * (0.78 + 0.22 * math.sin(math.pi * t))
    ob = tube(f"{prefix}Brow", [at + p for p in pts], rad, material, ring=10, cap_rings=3)
    return ob


def smile(prefix, material, at=Vector((0, 0, 0)), width=None, depth=0.026, fy=None,
          thick=0.0072):
    """The rig's little smile, thicker in the middle with round ends, centred on the rig's
    mouth point (face.mouth): `width` is half the mouth width, `fy` the corners' height."""
    width = FACE["mouth"]["width"] / 2 if width is None else width
    fy = FACE["mouth"]["y"] + depth * 0.5 if fy is None else fy
    ctrl = [(-width, fy), (-width * 0.55, fy - depth * 0.72), (0, fy - depth),
            (width * 0.55, fy - depth * 0.72), (width, fy)]
    pts = catmull([(x, y, 0) for x, y in ctrl], 16)
    pts = [face_point(p.x, p.y, thick * 0.2) for p in pts]
    rad = lambda t: thick * (0.8 + 0.2 * math.sin(math.pi * t))
    return tube(f"{prefix}Smile", [at + p for p in pts], rad, material, ring=10, cap_rings=3)


def face_patch(name, outline, material, lift=lambda t: 0.002, rings=5, centre=None,
               at=Vector((0, 0, 0))):
    """A decal-like patch hugging the face: `outline` is a closed loop of face coords
    (fx, fy) around `centre`; rings shrink it to the centre and every vertex is laid on the
    head surface, `lift(t)` metres off it (t = 1 at the rim, 0 at the centre) so it can
    dome a little."""
    pts = [Vector((x, y)) for x, y in outline]
    c = Vector(centre) if centre is not None else sum(pts, Vector((0, 0))) / len(pts)
    bm = bmesh.new()
    rows = []
    for k in range(rings, 0, -1):
        t = k / rings
        rows.append([bm.verts.new(at + face_point(*(c + (p - c) * t), lift(t))) for p in pts])
    tip = bm.verts.new(at + face_point(c.x, c.y, lift(0.0)))
    n = len(pts)
    for r0, r1 in zip(rows, rows[1:]):
        for j in range(n):
            bm.faces.new((r0[j], r0[(j + 1) % n], r1[(j + 1) % n], r1[j]))
    for j in range(n):
        bm.faces.new((rows[-1][j], rows[-1][(j + 1) % n], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    # Face it outward (toward -Y, the front).
    if sum(f.normal.y for f in bm.faces) > 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return lib._link(name, bm, material)


def ellipse_pts(cx, cy, rx, ry, n=28, squash=None):
    """Closed loop of face coords; squash(theta) can flatten part of it (e.g. a D shape)."""
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n
        x, y = math.cos(a), math.sin(a)
        if squash:
            x, y = squash(x, y)
        out.append((cx + rx * x, cy + ry * y))
    return out


def torso_profile(girth=1.0, samples=48):
    pts = catmull([(r * girth, y, 0) for r, y in TORSO_CTRL], samples)
    prof = [(max(0.0, p.x), p.y) for p in pts]
    prof[0] = (0.0, prof[0][1])
    prof[-1] = (0.0, prof[-1][1])
    return prof


def torso_radius_at(y, girth=1.0):
    prof = torso_profile(girth)
    for (r0, y0), (r1, y1) in zip(prof, prof[1:]):
        if (y0 - y) * (y1 - y) <= 0:
            t = 0 if y1 == y0 else (y - y0) / (y1 - y0)
            return r0 + (r1 - r0) * t
    return 0.0


def torso_front(y, x=0.0, girth=1.0):
    """Blender -Y of the torso surface at height y above the pelvis and offset x."""
    r = torso_radius_at(y, girth)
    return -TORSO_Z * math.sqrt(max(0.0, r * r - x * x))


# ---------------------------------------------------------------- preview mannequin

MANNEQUIN = "_Mannequin"
PEDESTAL_H = 0.05
PELVIS_Z = PEDESTAL_H - 0.02 + 0.155  # bean bottom sunk a little into the pedestal
FACE_FRAME = ((-0.2, -0.33, -0.17), (0.2, -0.08, 0.15))  # preview framing for face parts
MOUNTS = {
    "head": Vector((0, 0, PELVIS_Z + HEAD_Y)),
    "torso": Vector((0, 0, PELVIS_Z)),
}


def _mannequin_mats():
    return dict(
        skin=lib.mat("_mq_skin", "#EFE6DE", rough=0.7),
        body=lib.mat("_mq_body", "#D9DEE8", rough=0.8),
        stand=lib.mat("_mq_stand", "#C6CDD9", rough=0.75),
        eye=lib.mat("_mq_eye", COL["eye"], rough=0.2),
        shine=lib.mat("_mq_shine", COL["white"], rough=0.3, emit=COL["white"]),
        cheek=translucent("_mq_cheek", COL["cheek"], 0.45),
        mouth=lib.mat("_mq_mouth", "#7A5A5A", rough=0.5),
        brow=lib.mat("_mq_brow", "#A89A92", rough=0.7),
    )


def _mq_collection():
    c = bpy.data.collections.get(MANNEQUIN)
    if c is None:
        c = bpy.data.collections.new(MANNEQUIN)
        bpy.context.scene.collection.children.link(c)
    return c


def _into_mannequin(fn):
    """Run fn() (which builds into the asset collection) and move what it made into the
    mannequin collection, so join() never sees it."""
    asset = lib.coll()
    before = set(asset.objects)
    out = fn()
    c = _mq_collection()
    for o in [o for o in asset.objects if o not in before]:
        asset.objects.unlink(o)
        c.objects.link(o)
    return out


def mannequin(torso=True, pedestal=True, head_mesh_on=True, raise_=0.0):
    """A neutral bust (pedestal, torso bean, bald head) in its own collection: the AO
    occluder and preview context for worn items. Returns the head object (or None)."""
    c = _mq_collection()
    for ob in list(c.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    _MQ["raise"] = raise_

    def make():
        M = _mannequin_mats()
        up = Vector((0, 0, raise_))
        head = (head_mesh("_mq_head", M["skin"], loc=MOUNTS["head"] + up) if head_mesh_on
                else None)
        if torso:
            t = lib.lathe("_mq_torso", torso_profile(), loc=(0, 0, PELVIS_Z + raise_),
                          material=M["body"], verts=40)
            t.scale = (1, TORSO_Z, 1)
        if pedestal:
            lib.cyl("_mq_stand", 0.3, PEDESTAL_H, (0, 0, PEDESTAL_H / 2), M["stand"], r=0.02,
                    seg=3, verts=48)
            if raise_ > 0:  # a slim post up to the raised bust
                lib.cyl("_mq_post", 0.035, raise_ + 0.04, (0, 0, PEDESTAL_H + raise_ / 2),
                        M["stand"], r=0.01, seg=2, verts=24)
        return head
    return _into_mannequin(make)


_MQ = {"raise": 0.0}


def mannequin_face(face=("eyes", "brows", "mouth", "cheeks")):
    """The mannequin's calm face (preview only: added after the AO bake so a worn item's
    AO never carries shadows of features the game may not use)."""
    def make():
        M = _mannequin_mats()
        hc = MOUNTS["head"] + Vector((0, 0, _MQ["raise"]))
        if "eyes" in face:
            for s in (1, -1):
                eye(f"_mq_eye{s}", s, M, at=hc)
        if "brows" in face:
            for s in (1, -1):
                brow(f"_mq_brow{s}", s, M["brow"], at=hc)
        if "mouth" in face:
            smile("_mq_", M["mouth"], at=hc)
        if "cheeks" in face:
            cheeks("_mq_", M["cheek"], at=hc)
    _into_mannequin(make)


# ---------------------------------------------------------------- finalize

def join(name):
    """lib.join_asset, but the root may be an Empty when every part lives in a named node
    (e.g. the eyes: EyeL / EyeR and nothing else)."""
    c = lib.coll()
    parts = [o for o in c.objects if o.type in ("MESH", "FONT", "CURVE")]
    groups = {}
    for o in parts:
        groups.setdefault(o.get("node"), []).append(o)
    root_parts = groups.pop(None, [])
    if root_parts:
        root = lib._join(root_parts, name)
    else:
        root = bpy.data.objects.new(name, None)
        c.objects.link(root)
    for node_name, objs in groups.items():
        pivot = next((Vector(o["pivot"]) for o in objs if "pivot" in o), None)
        if pivot is None:
            lo, hi = lib._world_bounds(objs)
            pivot = (lo + hi) / 2
        child = lib._join(objs, node_name, pivot)
        child.parent = root
    for ob in parts:
        bpy.data.objects.remove(ob, do_unlink=True)
    return root


def mesh_objects(root):
    return [o for o in [root] + list(root.children) if o.type == "MESH"]


def tri_count(root):
    dg = bpy.context.evaluated_depsgraph_get()
    n = 0
    for o in mesh_objects(root):
        me = o.evaluated_get(dg).to_mesh()
        n += sum(len(p.vertices) - 2 for p in me.polygons)
        o.evaluated_get(dg).to_mesh_clear()
    return n


def _bounds(objs):
    pts = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        pts += [o.matrix_world @ Vector(v) for v in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


def _proxy(lo, hi):
    """Faceless mesh spanning lo..hi: render_preview frames on it, nothing renders."""
    me = bpy.data.meshes.new("_frame")
    me.from_pydata([tuple(lo), tuple(hi)], [], [])
    ob = bpy.data.objects.new("_frame", me)
    lib.coll().objects.link(ob)
    return ob


def flip_screen_u(ob):
    """Mirror the planar `Screen` UVs (lib maps them as seen from the front, -Y): for
    screens that face the holder (+Y), so the game's canvas reads the right way round."""
    for o in mesh_objects(ob):
        me = o.data
        if "AO" not in me.uv_layers:
            continue
        idx = [i for i, m in enumerate(me.materials) if m.name.split("@")[0] == "Screen"]
        uv = me.uv_layers["AO"].data
        for p in me.polygons:
            if p.material_index in idx:
                for li in p.loop_indices:
                    uv[li].uv = (1.0 - uv[li].uv[0], uv[li].uv[1])


def finalize(name, meta, mount=None, face=("eyes", "brows", "mouth", "cheeks"), ao=True,
             ao_res=256, ao_distance=0.12, lift=None, frame_with_head=True, pad=0.0,
             frame=None, mq_head=True, preview_yaw=0.0, screen_back=False, mq_torso=True,
             mq_raise=0.0):
    """Join → (mannequin) → AO bake → export GLB at the pivot → preview → sidecar.

    mount: "head" / "torso" shows the item on the neutral mannequin bust (and bakes AO
    with it as occluder); None shows the item alone, lifted so it rests on the floor
    (`lift` overrides the preview/bake offset). `frame` = (lo, hi) to force the framing.
    `preview_yaw` (degrees) turns the item for the catalog shot only; `screen_back` mirrors
    Screen UVs for screens facing the holder."""
    ob = join(name)
    tris = tri_count(ob)
    parts = mesh_objects(ob)
    ao = ao and ob.type == "MESH"
    head = None
    if mount:
        head = mannequin(head_mesh_on=mq_head, torso=mq_torso, raise_=mq_raise)
        at = MOUNTS[mount] + Vector((0, 0, mq_raise))
        bake_at = at
    else:
        lo, hi = _bounds(parts)
        at = Vector(lift) if lift is not None else Vector((0, 0, -lo.z))
        bake_at = at + Vector((0, 0, 2.0)) if lift is None else at  # floating: no floor AO
    if ao:
        ob.location = bake_at
        bpy.context.view_layer.update()
        lib.bake_ao(ob, ao_res, ao_distance)
        if screen_back:
            flip_screen_u(ob)
    ob.location = (0, 0, 0)
    bpy.context.view_layer.update()
    glb = lib.export_glb(ob, name)
    if mount and face:
        mannequin_face(face)
    ob.location = at
    if preview_yaw:
        ob.rotation_euler = (0, 0, math.radians(preview_yaw))
        if not mount:  # re-rest on the floor after turning
            bpy.context.view_layer.update()
            lo, hi = _bounds(parts)
            ob.location.z -= lo.z
    bpy.context.view_layer.update()
    if frame is not None:
        lo, hi = Vector(frame[0]) + at, Vector(frame[1]) + at
    else:
        lo, hi = _bounds(parts)
        if head is not None and frame_with_head and mount == "head":
            hl, hh = _bounds([head])
            lo = Vector([min(lo[i], hl[i]) for i in range(3)])
            hi = Vector([max(hi[i], hh[i]) for i in range(3)])
        lo -= Vector((pad, pad, pad))
        hi += Vector((pad, pad, pad))
    proxy = _proxy(lo, hi)
    png = lib.render_preview(proxy, name)
    bpy.data.objects.remove(proxy, do_unlink=True)
    ob.location = (0, 0, 0)
    ob.rotation_euler = (0, 0, 0)
    for o in parts:
        for m in o.data.materials:
            if "@" not in m.name:
                m.name = m.name + "@" + name
        if o is not ob:
            o.name = o.name + "@" + name
    report = {"object": ob.name, "tris": tris, "glb": glb, "png": png,
              "kb": os.path.getsize(glb) // 1024}
    if meta is not None:
        m = dict(meta)
        m.setdefault("artist", "Claude Rodin")
        report["sidecar"] = lib.sidecar(name, **m)
    return report
