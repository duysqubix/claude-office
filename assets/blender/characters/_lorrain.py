"""Claude Lorrain's helpers for the hair styles and pets I build, on top of Rodin's _kit.

Hair pivots at the head centre (Blender origin = head centre, front -Y, character-left +X)
and is SDF-sculpted like Rodin's: a snug helmet cut along a hairline, plus locks. Two things
differ from the bob's recipe because these helmets hug the scalp:
- grooves are wide, shallow channels laid just above the surface (soft_carve, lock_rails),
  which survive decimation without dark sliver triangles;
- locks (ponytail, pigtails) are swept along a dense Catmull-Rom curve with smoothly
  interpolated radii (smooth_lock), so they read as one fat lock, not a string of beads.
"""
from mathutils import Vector

from characters import _kit as kit

ARTIST = "Claude Lorrain"


def meta(name, category, priority, description, tags, tintable, **extra):
    return dict(name=name, category=category, priority=priority, description=description,
                tags=list(tags), tintable=list(tintable), artist=ARTIST, **extra)


def soft_carve(base, grooves, r0=0.004, r1=0.0068):
    """kit.carved with wide, shallow channels that stop where their paths end (no notch)."""
    return kit.carved(base, grooves, r0=r0, r1=r1, sink=-0.0028, extend=0.0, k=0.005)


def smooth_lock(ctrl, radii, samples=22):
    """A lock's centreline as a dense smooth curve (Vectors) with smoothstepped radii."""
    pts = kit.catmull([tuple(p) for p in ctrl], samples)
    n = len(ctrl) - 1
    out = []
    for i in range(len(pts)):
        u = i / (len(pts) - 1) * n
        k = min(int(u), n - 1)
        f = u - k
        f = f * f * (3 - 2 * f)
        out.append(radii[k] + (radii[k + 1] - radii[k]) * f)
    return [Vector(p) for p in pts], out


def lock_rails(pts, radii, away_from, start=3, lift=0.002):
    """Three groove rails along a lock: its two flanks (±X of the curve's frame) and its
    outer face (the side facing away from `away_from`), `lift` m above the surface."""
    rails = ([], [], [])
    for i in range(start, len(pts) - 2):
        p, r = pts[i], radii[i]
        t = (pts[i + 1] - pts[i - 1]).normalized()
        side = t.cross(Vector((0, 0, 1)))
        side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0))
        out = t.cross(side).normalized()
        if out.dot(p - Vector(away_from)) < 0:
            out = -out
        for k, v in enumerate((side, -side, out)):
            rails[k].append(tuple(p + v * (r + lift)))
    return [r for r in rails if len(r) > 2]


def sd_grooved_lock(P, pts, radii, rails, k=0.01):
    """A smooth lock with shallow channels along `rails`."""
    d = kit.sd_lock(P, [tuple(p) for p in pts], radii, k=k)
    for rail in rails:
        d = kit.smax(d, -kit.sd_groove(P, rail, 0.0055, 0.0065), 0.004)
    return d


def sd_scrunchie(P, at, axis, major=0.044, minor=0.022):
    """A plump hair tie around `axis` at `at`."""
    return kit.sd_torus(P, tuple(at), major, minor, kit.look(axis))


# ---------------------------------------------------------------- pets

def pet_materials(fur, light, dark):
    """Coat colours (recolour by name for other breeds), the kit's glossy eyes, and the
    tintable `Accent` collar."""
    import lib
    return dict(
        fur=lib.mat("Fur", fur, rough=0.75),
        light=lib.mat("FurLight", light, rough=0.75),
        dark=lib.mat("FurDark", dark, rough=0.75),
        eye=kit.m_eye(),
        shine=kit.m_shine(),
        nose=lib.mat("Nose", "#3B2A20", rough=0.3),
        pink=lib.mat("InnerEar", "#FFB3C1", rough=0.6),
        mouth=lib.mat("Mouth", kit.COL["mouth"], rough=0.5),
        collar=kit.m_accent(),
        gold=lib.mat("Gold", "#FFC93C", rough=0.35, metal=0.3),
    )


def sculpt(name, fn, lo, hi, material, target, voxel=0.004):
    """An organic pet part: the SDF meshed and decimated to `target` tris."""
    return kit.sdf_mesh(name, fn, lo, hi, material, voxel=voxel, target=target,
                        remesh="decimate")


def blob(name, loc, radii, material, facing=(0, -1, 0), roll=0.0, u=20, v=12):
    """A soft ellipsoid whose local -Y faces `facing` (eyes, noses, patches, paws)."""
    import math

    import lib
    from mathutils import Matrix
    f = Vector(facing).normalized()
    q = (-f).to_track_quat("Y", "Z")
    rot = (q.to_matrix() @ Matrix.Rotation(math.radians(roll), 3, "Y")).to_euler()
    return lib.sphere(name, 1.0, tuple(loc), material, scale=tuple(radii), u=u, v=v, rot=rot)


def eye(prefix, centre, facing, M, size=1.0):
    """A big glossy pet eye; the catchlight sits up and to the character's right on both
    eyes, as on the mannequin (one light, so the eyes read as looking the same way)."""
    f = Vector(facing).normalized()
    blob(prefix, centre, (0.025 * size, 0.012 * size, 0.031 * size), M["eye"], f, u=16, v=10)
    glint = Vector(centre) + f * 0.0105 * size + Vector((-0.004, 0, 0.013)) * size
    blob(prefix + "Shine", glint, (0.0072 * size,) * 3, M["shine"], f, u=8, v=5)
