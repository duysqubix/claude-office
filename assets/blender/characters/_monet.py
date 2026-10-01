"""Claude Monet's helpers for head- and torso-worn character items, on top of Rodin's _kit.

Head items pivot at the head centre (Blender origin = head centre, front -Y, character-left
+X); torso items pivot at the torso origin (the pelvis), see _kit.MOUNTS. Hats are mostly
lathed (smooth, cheap, easy to read) and tilted a touch back like Wobbly Life hats."""
import math

from characters import _kit as kit

import lib


def meta(name, category, description, tags, tintable=("Accent",), anchors_bl=None, **extra):
    return dict(name=name, category=category, priority=extra.pop("priority", "P1"),
                description=description, tags=list(tags), tintable=list(tintable),
                anchors_bl=anchors_bl or {}, artist="Claude Monet", **extra)


def hat_lathe(name, profile, material, z=0.0, tilt=-0.12, roll=0.0, verts=32, sub=0,
              deform=None, loc_xy=(0.0, 0.0)):
    """Lathe a (radius, z) hat profile around the head's vertical axis, optionally deform
    each vertex (deform(co) edits co in place, in the hat's own frame before tilting), then
    tilt it back (`tilt` radians about X; negative lifts the front) and roll it sideways."""
    ob = lib.lathe(name, profile, (loc_xy[0], loc_xy[1], z), material, verts=verts,
                   rot=(tilt, roll, 0))
    if deform is not None:
        for v in ob.data.vertices:
            deform(v.co)
    if sub:
        lib.subsurf(ob, sub)
    return ob


def tilted(loc, tilt=-0.12, roll=0.0):
    """A point given in the hat's own frame (before tilt) → head-centre frame."""
    from mathutils import Euler, Vector
    return tuple(Euler((tilt, roll, 0)).to_matrix() @ Vector(loc))


def finalize_head(name, META, **kw):
    kw.setdefault("ao_distance", 0.08)
    return kit.finalize(name, META, mount="head", **kw)


def finalize_torso(name, META, **kw):
    kw.setdefault("ao_distance", 0.1)
    return kit.finalize(name, META, mount="torso", face=("eyes", "brows", "mouth", "cheeks"),
                        **kw)


def band_materials(color, band="#2B2D42", rough=0.7):
    return dict(hat=kit.m_accent(color, rough=rough), band=kit.flat("Band", band, rough=0.6))


def star_outline(r_out, r_in, n=5):
    pts = []
    for i in range(2 * n):
        a = math.pi / 2 + i * math.pi / n
        rr = r_out if i % 2 == 0 else r_in
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    return pts


# ---------------------------------------------------------------- glasses

def glasses(loop, rim_mat, lens_mat, rim_r=0.009, out=0.03, eye_y=None, temple=True):
    """Two rims (loop = [(x, z), ...] around each eye, in the eye's surface frame), lenses as
    fans just behind the rims, a bridge, and temples that run back along the head to the ears.
    Returns nothing; parts land in the asset collection."""
    from mathutils import Vector
    ey = kit.EYE_Y if eye_y is None else eye_y
    lens_mat.use_backface_culling = False      # thin lenses read from both sides
    inner, outer = {}, {}
    for s in (1, -1):
        tag = "L" if s > 0 else "R"
        loc, fr = kit.on_head(s * kit.EYE_X, ey, out=out)
        pts = [loc + fr @ Vector((x, 0.0, z)) for x, z in loop]
        kit.ring_tube(f"Rim{tag}", pts, rim_r, rim_mat, ring=8)
        lens = [loc + fr @ Vector((x * 0.97, 0.002, z * 0.97)) for x, z in loop]
        c = sum(lens, Vector((0, 0, 0))) / len(lens)
        n = len(lens)
        faces = [(n, i, (i + 1) % n) if s > 0 else (n, (i + 1) % n, i) for i in range(n)]
        kit.mesh_from(f"Lens{tag}", lens + [c], faces, lens_mat)
        inner[s] = min(pts, key=lambda p: abs(p.x))
        outer[s] = max(pts, key=lambda p: abs(p.x) - abs(p.z - loc.z) * 0.5)
    a, b = inner[1], inner[-1]
    mid = (a + b) / 2 + Vector((0, -0.012, 0.012))
    kit.tube("Bridge", [a, mid, b], rim_r * 0.9, rim_mat, ring=8)
    if temple:
        for s in (1, -1):
            tag = "L" if s > 0 else "R"
            p0 = outer[s]
            ear = kit.head_point((s * 1.0, 0.12, 0.02), out=0.012)
            mid = kit.head_point((s * 0.85, -0.45, 0.04), out=0.014)
            kit.tube(f"Temple{tag}", kit.catmull([p0, mid, ear], samples=10), rim_r * 0.75,
                     rim_mat, ring=8)


# ---------------------------------------------------------------- torso-worn

def torso_patch(name, half_width, ys, material, out=0.012, back=False, nu=10, thick=0.008,
                inner=None, bulge=None):
    """A cloth panel hugging the shirt bean (pelvis space): rows at heights `ys` (top → down),
    each spanning x in ±half_width(y). `bulge(u, v)` adds extra lift (u in -1..1 across,
    v in 0..1 down). Solidified `thick`; `inner` material goes on the inside/edges."""
    from characters import _body as B
    verts, faces = [], []
    n = len(ys)
    for j, y in enumerate(ys):
        hw = half_width(y)
        for i in range(nu + 1):
            u = -1 + 2 * i / nu
            r = kit.torso_radius_at(y)
            x = max(-r * 0.98, min(r * 0.98, u * hw))
            p, nrm = B.torso_surface(x, y, back=back)
            lift = out + (bulge(u, j / max(n - 1, 1)) if bulge else 0.0)
            verts.append(p + nrm * lift)
    w = nu + 1
    for j in range(n - 1):
        for i in range(nu):
            a, b = j * w + i, j * w + i + 1
            c, d = b + w, a + w
            faces.append((a, d, c, b) if not back else (a, b, c, d))
    ob = kit.mesh_from(name, verts, faces, material)
    # Faces must point away from the body (solidify then grows inward).
    poly = ob.data.polygons[len(ob.data.polygons) // 2]
    from mathutils import Vector
    c = poly.center
    away = Vector((c.x, c.y / (kit.TORSO_Z ** 2), 0)).normalized()
    if poly.normal.dot(away) < 0:
        ob.data.flip_normals()
    if inner is not None:
        ob.data.materials.append(inner)
    m = ob.modifiers.new("Solidify", "SOLIDIFY")
    m.thickness = thick
    m.offset = -1.0
    m.material_offset = 1 if inner is not None else 0
    m.material_offset_rim = 1 if inner is not None else 0
    return ob


def finalize_torso_item(name, META, **kw):
    kw.setdefault("ao_distance", 0.06)
    return kit.finalize(name, META, mount="torso", **kw)
