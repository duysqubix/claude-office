"""Food-set helpers (Claude Cézanne's food batch; underscore file, build.py skips it): donuts
with drippy icing and sprinkles, cake drips, pizza layers, cookies, and decals fine enough
to wrap round a can or bottle.

Conventions as _decor.py: metres, Z-up, front faces -Y, origin at the desk-contact point.
"""
import math
import random

import bmesh
from mathutils import Matrix, Vector

import lib
from decor import _decor as D

DOUGH = "#E8B26A"
CHEESE = "#FFD25E"
CHEESE_DARK = "#EDB447"
CRUST = "#E3A256"
PEPPERONI = "#C8463A"
CHOC = "#7A4A2E"
COOKIE = "#E0A458"
CHIP = "#5A3A24"


# ---------------------------------------------------------------- decals on curved things

def fine(ob, max_edge):
    """Triangulate a flat part and split its long edges until none is longer than max_edge,
    so it can be bent round a cylinder without sinking into it."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    for _ in range(8):
        long = [e for e in bm.edges if e.calc_length() > max_edge]
        if not long:
            break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def wrap_decal(ob, radius, z, max_edge=0.003):
    """A front-facing decal built at y = -radius(z) (flat face or depth-0 text, rotation
    already baked), refined and bent round the vertical axis."""
    D.bake_xform(ob)
    fine(ob, max_edge)
    base = radius(z) if callable(radius) else radius
    return D.wrap_cylinder(ob, radius, base=base)


# ---------------------------------------------------------------- donuts

def icing(name, major, minor, material, loc=(0, 0, 0), seg=18, rows=5, seed=0, lift=0.0022):
    """Icing on a donut (torus in the XY plane at `loc`): covers the top and spills a little
    over both sides; the outer edge is wavy with a few drips. Open shell, normals outward."""
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 2 * math.pi) for _ in range(3)]
    bm = bmesh.new()
    cols = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        drip = (max(0.0, math.sin(3 * a + ph[0])) ** 3 * 0.55
                + max(0.0, math.sin(5 * a + ph[1])) ** 4 * 0.35)
        b0 = -0.32 - drip                                   # outer edge, below the equator
        b1 = math.pi + 0.3 + 0.12 * math.sin(4 * a + ph[2])  # inner edge, down the hole
        radial = Vector((math.cos(a), math.sin(a), 0))
        col = []
        for k in range(rows + 1):
            b = b0 + (b1 - b0) * k / rows
            rr = minor + (lift if 0 < k < rows else lift * 0.1)
            col.append(bm.verts.new(radial * (major + rr * math.cos(b)) + Vector((0, 0, rr * math.sin(b)))))
        cols.append(col)
    for i in range(seg):
        c0, c1 = cols[i], cols[(i + 1) % seg]
        for k in range(rows):
            bm.faces.new((c0[k], c1[k], c1[k + 1], c0[k + 1]))
    return lib._link(name, bm, material, loc)


def sprinkles(name, n, major, minor, mats, loc=(0, 0, 0), seed=0, lift=0.0022):
    """Little rod sprinkles lying on a donut's icing (same torus as icing())."""
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        a = rnd.uniform(0, 2 * math.pi)
        b = rnd.uniform(0.45, 2.6)
        radial = Vector((math.cos(a), math.sin(a), 0))
        nrm = radial * math.cos(b) + Vector((0, 0, math.sin(b)))
        p = radial * (major + (minor + lift + 0.0007) * math.cos(b)) + Vector((0, 0, (minor + lift + 0.0007) * math.sin(b)))
        out.append(rod(f"{name}{i}", Vector(loc) + p, nrm, rnd.uniform(0, math.pi), mats[i % len(mats)]))
    return out


def rod(name, pos, nrm, spin, material, size=(0.0075, 0.0022, 0.0022)):
    """One sprinkle lying on a surface with normal `nrm`, turned `spin` about it."""
    nrm = Vector(nrm).normalized()
    ref = Vector((0, 0, 1)) if abs(nrm.z) < 0.95 else Vector((1, 0, 0))
    t = (ref - nrm * ref.dot(nrm)).normalized()
    t = Matrix.Rotation(spin, 3, nrm) @ t
    m = Matrix((t, nrm.cross(t), nrm)).transposed()
    return lib.rbox(name, size, tuple(pos), material, r=0, rot=m.to_euler())


def donut(prefix, M, icing_key, loc, seed, major=0.03, minor=0.0145, n_sprinkles=7, yaw=0.0):
    """Dough ring + icing (+ sprinkles if n_sprinkles) lying on the surface at loc."""
    x, y, z = loc
    c = (x, y, z + minor)
    lib.torus(f"{prefix}_Dough", major, minor, c, M["dough"], seg=16, ring=8,
              rot=(0, 0, yaw))
    icing(f"{prefix}_Icing", major, minor, M[icing_key], loc=c, seed=seed)
    if n_sprinkles:
        sprinkles(f"{prefix}_Spr", n_sprinkles, major, minor, M["sprinkles"], loc=c, seed=seed + 7)


# ---------------------------------------------------------------- cake

def drip_band(name, radius, z_top, inner_r, material, seg=36, seed=0, depth=0.016,
              lift=0.0018, edge_r=0.006):
    """Icing on a round cake tier: covers the top from inner_r out, rolls over the rounded
    edge (radius edge_r) and runs down the side in drips of up to `depth`."""
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 2 * math.pi) for _ in range(2)]
    bm = bmesh.new()
    cols = []
    rows_top, rows_side = 2, 4
    for i in range(seg):
        a = 2 * math.pi * i / seg
        d = depth * (0.35 + 0.65 * max(0.0, math.sin(4 * a + ph[0])) ** 2
                     * (0.6 + 0.4 * math.sin(7 * a + ph[1]) ** 2))
        radial = Vector((math.cos(a), math.sin(a), 0))
        col = []
        # across the top
        for k in range(rows_top + 1):
            r = inner_r + (radius - edge_r - inner_r) * k / rows_top
            col.append(radial * r + Vector((0, 0, z_top + lift)))
        # over the rounded edge
        for k in range(1, 4):
            t = (math.pi / 2) * k / 3
            col.append(radial * (radius - edge_r + (edge_r + lift) * math.sin(t))
                       + Vector((0, 0, z_top - edge_r + (edge_r + lift) * math.cos(t))))
        # down the side
        for k in range(1, rows_side + 1):
            zz = z_top - edge_r - (d - edge_r) * k / rows_side
            out = lift if k < rows_side else lift * 0.2
            col.append(radial * (radius + out) + Vector((0, 0, zz)))
        cols.append([bm.verts.new(p) for p in col])
    n = len(cols[0])
    for i in range(seg):
        c0, c1 = cols[i], cols[(i + 1) % seg]
        for k in range(n - 1):
            bm.faces.new((c0[k], c0[k + 1], c1[k + 1], c1[k]))
    # Close the middle of the top with a fan when the icing covers it.
    if inner_r < 1e-6:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bm.normal_update()
    if sum(f.normal.z for f in bm.faces) < 0:
        for f in bm.faces:
            f.normal_flip()
    return lib._link(name, bm, material)


# ---------------------------------------------------------------- pizza

def pie_pts(radius, a0, a1, n=28):
    """Pie-slice outline: centre plus an arc from a0 to a1 (radians, CCW)."""
    return [(0.0, 0.0)] + [(radius * math.cos(a0 + (a1 - a0) * i / n),
                            radius * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


def pizza(prefix, M, R, a0, a1, z=0.0, n=28, crust_r=0.0125):
    """Bread base, cheese and a fat round-ended crust along the arc from a0 to a1."""
    D.prism(f"{prefix}_Bread", pie_pts(R - 0.006, a0, a1, n), 0.007, M["bread"],
            loc=(0, 0, z), r=0.002, seg=1)
    D.prism(f"{prefix}_Cheese", pie_pts(R - 0.016, a0, a1, n), 0.0045, M["cheese"],
            loc=(0, 0, z + 0.0065), r=0.0018, seg=1)
    rc = R - crust_r
    arc = [(rc * math.cos(a0 + (a1 - a0) * i / n), rc * math.sin(a0 + (a1 - a0) * i / n),
            z + 0.0095) for i in range(n + 1)]
    D.tube(f"{prefix}_Crust", arc, crust_r, M["crust"], verts=8, caps="round",
           radii=[0.92] + [1.0] * (n - 1) + [0.92])


def pepperoni(name, M, x, y, z, r=0.02):
    return lib.cyl(name, r, 0.0042, (x, y, z + 0.0021), M["pepperoni"], r=0.0016, seg=1,
                   verts=12)


def basil(name, M, x, y, z, yaw):
    return lib.sphere(name, 1.0, (x, y, z + 0.0012), M["basil"], scale=(0.009, 0.015, 0.0022),
                      u=10, v=4, rot=(0, 0, yaw))


# ---------------------------------------------------------------- cookies

def cookie(prefix, M, r=0.03, chips=5, seed=0):
    """A chunky chocolate-chip cookie lying at the origin (pair with D.place)."""
    rnd = random.Random(seed)
    D.prism(f"{prefix}_Cookie", D.circle_pts(r, 16), 0.009, M["cookie"], r=0.0032, seg=2)
    for i in range(chips):
        a = rnd.uniform(0, 2 * math.pi)
        d = rnd.uniform(0.15, 0.72) * r
        lib.sphere(f"{prefix}_Chip{i}", 0.0042, (d * math.cos(a), d * math.sin(a), 0.0088),
                   M["chip"], scale=(1, 1, 0.55), u=8, v=4)
