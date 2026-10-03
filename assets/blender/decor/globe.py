"""Globe: a chunky desk globe. Sky-blue ocean with plump rounded continents and ice caps,
tilted 23.4° on a gold half-meridian arc over a turned wooden base. The sphere is the
separate node `Globe` (pivot at its centre) so the game can spin it about the tilted pole
axis. 0.33 m tall; origin at the desk-contact centre; front faces -Y."""
import math

import bmesh
from mathutils import Vector

import lib
from decor import _decor as D

NAME = "globe"
AO_RES = 256
AO_DISTANCE = 0.05
R = 0.09
CENTRE = Vector((0.0, 0.0, 0.222))
TILT = math.radians(23.4)  # pole leans towards +X
AXIS = Vector((math.sin(TILT), 0.0, math.cos(TILT)))
META = dict(
    name="Globe", category="desk-item", priority="P1",
    description="Chunky desk globe with blobby continents on a gold meridian; the globe spins",
    tags=["desk", "decor", "animated"], tintable=[],
    anchors_bl={"centre": tuple(CENTRE)},
    nodes={"Globe": "pivot at the sphere centre; spin with "
                    "node.rotateOnAxis(new Vector3(0.397, 0.918, 0), angle) — the tilted pole "
                    "axis in three.js (Blender (0.397, 0, 0.918))"},
)
# (name, lat, lon, size, (stretch east, stretch north), lobe seed, colour)
# lon 0 faces the front (-Y), +90 is the right (+X).
CONTINENTS = [
    ("NAmerica", 44, -12, 0.03, (1.15, 0.85), 1, "land"),
    ("SAmerica", -18, 28, 0.022, (0.78, 1.3), 2, "land"),
    ("Africa", 4, 96, 0.026, (0.95, 1.2), 3, "land"),
    ("Eurasia", 48, 135, 0.036, (1.6, 0.75), 4, "land"),
    ("Australia", -26, 205, 0.016, (1.25, 0.85), 5, "sand"),
    ("Greenland", 70, 40, 0.011, (0.9, 1.1), 6, "ice"),
]


def materials():
    return dict(
        ocean=D.mat("Ocean", "sky", rough=0.35),
        land=D.mat("Land", "leafLight", rough=0.5),
        sand=D.mat("Sand", "#F6C177", rough=0.55),
        ice=D.mat("Ice", "white", rough=0.45),
        wood=D.mat("Wood", "woodDark", rough=0.55),
        gold=D.mat("Gold", "gold", rough=0.3, metal=0.35),
    )


def blob_pts(size, stretch, seed, n=18):
    """Soft irregular outline: a circle with a few low-frequency lobes."""
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        r = 1 + 0.16 * math.cos(2 * t + seed * 1.7) + 0.1 * math.cos(3 * t + seed * 2.9) \
            + 0.06 * math.cos(5 * t + seed * 0.7)
        pts.append((size * r * stretch[0] * math.cos(t), size * r * stretch[1] * math.sin(t)))
    return pts


def direction(lat, lon):
    la, lo = math.radians(lat), math.radians(lon)
    return Vector((math.cos(la) * math.sin(lo), -math.cos(la) * math.cos(lo), math.sin(la)))


def patch(name, lat, lon, outline, material, height=0.0028):
    """A raised continent conformed to the (untilted) sphere at the origin."""
    c = direction(lat, lon)
    if abs(c.z) > 0.999:
        east, north = Vector((1, 0, 0)), Vector((0, 1, 0)) * (1 if c.z > 0 else -1)
    else:
        east = Vector((0, 0, 1)).cross(c).normalized()
        north = c.cross(east).normalized()
    onto = lambda u, v, rad: (c * R + east * u + north * v).normalized() * rad  # noqa: E731
    bm = bmesh.new()
    top = R + height
    centre = bm.verts.new(onto(0, 0, top))
    rings = []
    for f in (0.45, 0.8, 1.0):
        rings.append([bm.verts.new(onto(u * f, v * f, top)) for u, v in outline])
    bottom = [bm.verts.new(onto(u, v, R - 0.004)) for u, v in outline]
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((centre, rings[0][i], rings[0][j]))
        for a, b in ((rings[0], rings[1]), (rings[1], rings[2])):
            bm.faces.new((a[i], b[i], b[j], a[j]))
        bm.faces.new((rings[2][i], bottom[i], bottom[j], rings[2][j]))
    bm.normal_update()
    for f in bm.faces:
        p = f.calc_center_median()
        radial = p.normalized()
        if abs(f.normal.dot(radial)) > 0.5:  # top: face away from the sphere centre
            out = radial
        else:  # rim wall: face away from the patch's own axis
            out = p - c * p.dot(c)
        if f.normal.dot(out) < 0:
            f.normal_flip()
    return D.bm_object(name, bm, material, sharp=50)


def globe(M):
    parts = [lib.sphere("Globe_Sea", R, (0, 0, 0), M["ocean"], u=28, v=14)]
    for name, lat, lon, size, stretch, seed, mat in CONTINENTS:
        parts.append(patch(f"Globe_{name}", lat, lon, blob_pts(size, stretch, seed), M[mat]))
    parts.append(patch("Globe_IceN", 90, 0, D.circle_pts(0.02, 16), M["ice"]))
    parts.append(patch("Globe_IceS", -90, 0, D.circle_pts(0.028, 18), M["ice"]))
    D.place(parts, loc=tuple(CENTRE), rot=(0, TILT, 0))
    for p in parts:
        lib.node(p, "Globe", pivot=tuple(CENTRE))


def stand(M):
    D.lathe("Base", [(0.0, 0.0), (0.066, 0.0), (0.0705, 0.004), (0.0712, 0.013),
                     (0.064, 0.022), (0.042, 0.029), (0.02, 0.033), (0.0, 0.034)], M["wood"],
            verts=32, sharp=60)
    rr = R + 0.013
    bottom = CENTRE + Vector((0, 0, -rr))
    lib.cyl("Stem", 0.0085, bottom.z - 0.03 + 0.004, (0, 0, (bottom.z + 0.03) / 2), M["gold"],
            r=0.002, seg=1, verts=14)
    lib.sphere("Stem_Knob", 0.012, tuple(bottom), M["gold"], u=12, v=6)
    # Half meridian from the north pole, down the right side, under the globe, to the south.
    a_n = math.pi / 2 - TILT
    pts = [CENTRE + rr * Vector((math.cos(a), 0, math.sin(a)))
           for a in [a_n - math.pi * i / 20 for i in range(21)]]
    D.tube("Meridian", pts, 0.0048, M["gold"], verts=8, caps="round")
    for s in (1, -1):
        lib.sphere(f"Pole{s}", 0.0065, tuple(CENTRE + AXIS * s * (R + 0.006)), M["gold"],
                   u=10, v=5)


def build():
    lib.begin(NAME)
    M = materials()
    stand(M)
    globe(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META, rebake=True)
