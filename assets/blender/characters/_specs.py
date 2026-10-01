"""Shared glasses builder for glasses_round / glasses_square / sunglasses: rims around a
lens shape, the lenses, an arched bridge and temples that wrap back along the head. Lenses
sit at rig.ts's spot (face coords ±0.09, -0.004), 2.8 cm off the face."""
import math

from mathutils import Vector

from characters import _kit as kit

import lib

LENS_X, LENS_Y, OUT = 0.09, -0.004, 0.028


def materials(frame_hex, dark_lens=False):
    M = dict(frame=kit.m_accent(frame_hex, rough=0.45))
    if dark_lens:
        M["lens"] = kit.flat("Lens", "#1C2030", rough=0.08)
        M["glint"] = kit.translucent("Glint", "#FFFFFF", 0.75, rough=0.2)
    else:
        M["lens"] = kit.translucent("Lens", "#DDF4FF", 0.22, rough=0.05)
    return M


def _fan(name, centre, ring, material):
    """A slightly domed lens filling a rim loop."""
    import bmesh
    bm = bmesh.new()
    c = bm.verts.new(centre)
    vs = [bm.verts.new(p) for p in ring]
    for i in range(len(vs)):
        bm.faces.new((c, vs[i], vs[(i + 1) % len(vs)]))
    bm.normal_update()
    if sum(f.normal.y for f in bm.faces) > 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return lib._link(name, bm, material)


def frames(M, rim, tube=0.011, centre_y=0.0, browbar=False, glint=False):
    """`rim`: closed loop of (x, z) offsets around the character-left lens centre (mirrored
    for the right lens)."""
    zs = [z for _, z in rim]
    xs = [x for x, _ in rim]
    tops = {}
    for side in (1, -1):
        loc, fr = kit.on_head(side * LENS_X, LENS_Y + centre_y, OUT)
        pts = [loc + fr @ Vector((side * x, 0, z)) for x, z in rim]
        kit.ring_tube(f"Rim{side}", pts, tube, M["frame"], ring=8)
        inset = [loc + fr @ Vector((side * x * 0.94, -0.001, z * 0.94)) for x, z in rim]
        _fan(f"Lens{side}", loc + fr @ Vector((0, -0.004, 0)), inset, M["lens"])
        if glint:
            a = loc + fr @ Vector((side * -0.03, -0.006, 0.006))
            b = loc + fr @ Vector((side * -0.008, -0.006, 0.034))
            kit.tube(f"Glint{side}", [a, (a + b) / 2, b], 0.0045, M["glint"], ring=6,
                     cap_rings=2)
        # The rim's top arc, outer to inner, for the browbar.
        top = sorted([(side * x, z) for x, z in rim if z > 0.55 * max(zs)],
                     key=lambda p: -side * p[0])
        tops[side] = [loc + fr @ Vector((x, -0.004, z + 0.004)) for x, z in top]
        # Temple: from the rim's outer edge back along the side of the head, ending
        # tucked into it where an ear would be.
        outer = loc + fr @ Vector((side * max(xs), 0, 0.006))
        path = [outer]
        for phi, out in ((50, 0.01), (64, 0.007), (78, 0.003), (90, -0.006)):
            path.append(kit.head_point(kit.sph_dir(88, side * phi), out=out))
        kit.tube(f"Temple{side}", kit.catmull(path, 10), tube * 0.7, M["frame"], ring=6,
                 cap_rings=2)
    # Bridge: arched between the inner edges.
    inner = LENS_X + min(xs)
    top = LENS_Y + centre_y
    bridge = [kit.face_point(fx, top + dy, OUT + 0.002)
              for fx, dy in ((inner + 0.004, 0.006), (0.0, 0.02), (-inner - 0.004, 0.006))]
    kit.tube("Bridge", kit.catmull(bridge, 8), tube * 0.8, M["frame"], ring=6, cap_rings=2)
    if browbar:
        bar = tops[1] + list(reversed(tops[-1]))
        kit.tube("Browbar", bar, tube * 1.05, M["frame"], ring=8, cap_rings=3)
