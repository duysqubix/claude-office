"""Computer mouse on a pad. A long rounded mouse (about 1.7:1) in light grey, narrower and
lower at the nose, highest just behind the middle, flat underneath; two graphite buttons
split by a groove from the nose to about 45% back, ending in a stepped seam; a thin dark
ribbed scroll wheel set in a slot in the groove; a short curved cord leaving the nose. It
sits on a rounded pad (`Accent`, tinted per desk) on a thin graphite base plate. The buttons and cord point +Y (away
from the sitter, towards the monitor); origin at the pad's bottom centre. desk_setup
reuses materials() and parts()."""
import math

from mathutils import Vector

import lib
from decor import _decor as D

NAME = "computer_mouse"
AO_RES = 256
AO_DISTANCE = 0.02
PAD_W, PAD_D, PAD_T = 0.22, 0.19, 0.008
L, W, H = 0.104, 0.062, 0.034  # body length (Y), width (X), height above its base
PLATE_T, PLATE_OUT = 0.0026, 0.0009  # graphite base plate peeking out under the shell
Y_OFF = -0.004                 # body centre on the pad (a little towards the sitter)
SEAM_T, NOSE_T = 0.1, 0.93     # buttons run from the seam (t) to just short of the nose
GAP = 0.0055                   # groove between the buttons
WHEEL_T, WHEEL_R, WHEEL_W = 0.52, 0.0085, 0.0042
CORD_R = 0.0021
META = dict(
    name="Computer mouse", category="desk-item", priority="P0",
    description="Two-tone computer mouse (split buttons, scroll wheel, curved cord) on a "
                "rounded mouse pad",
    tags=["desk", "computer"], tintable=["Accent"],
    anchors_bl={"hand": (0, Y_OFF - 0.012, PAD_T + H)},
)


def materials():
    return dict(
        mouseShell=lib.mat("MouseShell", "#E4E8EF", rough=0.45),
        mouseGraphite=lib.mat("MouseGraphite", "#3A404C", rough=0.72),
        mouseWheel=lib.mat("MouseWheel", "#1F232B", rough=0.6),
        pad=lib.mat("Accent", lib.P["deskAccents"][2], rough=0.85),
    )


# ---------------------------------------------------------------- the shell surface

def _half_w(t):
    return W / 2 * (1 - 0.14 * (t + 1) / 2)  # narrower towards the nose (+Y)


def _top_h(t):
    return H * (0.56 + 0.44 * math.exp(-((t + 0.2) / 0.8) ** 2))


def _r(t):
    return max(0.0, 1 - abs(t) ** 2.6) ** (1 / 2.6)  # blunt rounded ends in plan


def surface(t, phi):
    """Point on the shell: t in [-1, 1] back to nose, phi in [0, pi] from the right base
    edge (+X) over the top to the left base edge."""
    c, s = math.cos(phi), math.sin(phi)
    xh = math.copysign(abs(c) ** (2 / 2.5), c)  # full shoulders, not a round dome
    zh = abs(s) ** (2 / 2.5)
    r = _r(t)
    return Vector((_half_w(t) * r * xh, t * L / 2, _top_h(t) * r ** 0.45 * zh))


def normal(t, phi, e=1e-4):
    du = surface(min(1 - 1e-6, t + e), phi) - surface(max(-1 + 1e-6, t - e), phi)
    dv = surface(t, phi + e) - surface(t, phi - e)
    n = du.cross(dv)  # outward: along the length × over the top
    return n.normalized() if n.length > 1e-12 else Vector((0, 0, 1))


def _phi_at_x(t, x):
    """phi (right half) where the shell's X equals x: bisect on the monotone cos side."""
    lo, hi = 0.0, math.pi / 2
    for _ in range(40):
        mid = (lo + hi) / 2
        if surface(t, mid).x > x:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def body(M, base):
    import bmesh
    n_t, n_phi = 20, 16
    ts = [-math.cos(math.pi * k / n_t) for k in range(1, n_t)]  # dense near the ends
    phis = [math.pi * j / n_phi for j in range(n_phi + 1)]
    bm = bmesh.new()
    rows = [[bm.verts.new(base + surface(t, p)) for p in phis] for t in ts]
    back = bm.verts.new(base + Vector((0, -L / 2, 0)))
    nose = bm.verts.new(base + Vector((0, L / 2, 0)))
    for a, b in zip(rows, rows[1:]):
        for j in range(n_phi):
            bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
    for j in range(n_phi):
        bm.faces.new((back, rows[0][j + 1], rows[0][j]))
        bm.faces.new((nose, rows[-1][j], rows[-1][j + 1]))
    # Flat base: right edge back to front, nose, left edge front to back, back point.
    outline = [r[0] for r in rows] + [nose] + [r[-1] for r in reversed(rows)] + [back]
    bm.faces.new(outline)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return D.bm_object("Mouse_Body", bm, M["mouseShell"], sharp=55)


def base_plate(M, base):
    """Thin graphite chassis under the shell, a hair wider, so the body has a crisp bottom
    edge like a real device rather than a soft dome."""
    ts = [-math.cos(math.pi * k / 22) for k in range(1, 22)]
    right = [surface(t, 0.0) for t in ts]
    outline = ([(p.x, p.y) for p in right] + [(0.0, L / 2)]
               + [(-p.x, p.y) for p in reversed(right)] + [(0.0, -L / 2)])
    grown = []
    for x, y in outline:
        d = math.hypot(x / (W / 2), y / (L / 2)) or 1.0
        grown.append((x + PLATE_OUT * x / (W / 2) / d, y + PLATE_OUT * y / (L / 2) / d))
    D.prism("Mouse_Plate", grown, PLATE_T, M["mouseGraphite"], loc=tuple(base), r=0.0008, seg=1,
            angle=50)


def buttons(M, base, off=0.0011, n_t=7, n_phi=6, phi_side=0.5):
    """Two button shells standing `off` proud of the shell, with a lip down to it."""
    import bmesh
    ts = [SEAM_T + (NOSE_T - SEAM_T) * k / n_t for k in range(n_t + 1)]
    for side in (1, -1):
        bm = bmesh.new()
        grid, inner = [], []
        for t in ts:
            p_gap = _phi_at_x(t, GAP / 2)
            phis = [phi_side + (p_gap - phi_side) * j / n_phi for j in range(n_phi + 1)]
            row_o, row_i = [], []
            for p in phis:
                pt, n = surface(t, p), normal(t, p)
                po, pi = pt + n * off, pt - n * 0.0004
                if side < 0:
                    po, pi = Vector((-po.x, po.y, po.z)), Vector((-pi.x, pi.y, pi.z))
                row_o.append(bm.verts.new(base + po))
                row_i.append(bm.verts.new(base + pi))
            grid.append(row_o)
            inner.append(row_i)
        for a, b in zip(grid, grid[1:]):
            for j in range(n_phi):
                bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
        # Lip: the patch's border, offset shell down to just inside the body.
        border_o = [r[0] for r in grid] + grid[-1][1:] + [r[-1] for r in reversed(grid)][1:] + grid[0][::-1][1:-1]
        border_i = [r[0] for r in inner] + inner[-1][1:] + [r[-1] for r in reversed(inner)][1:] + inner[0][::-1][1:-1]
        for k in range(len(border_o)):
            k2 = (k + 1) % len(border_o)
            bm.faces.new((border_o[k], border_o[k2], border_i[k2], border_i[k]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for f in bm.faces:  # keep them facing out of the mouse
            f.normal_update()
            c = f.calc_center_median() - base
            if f.normal.dot(Vector((c.x, 0, c.z + 0.01))) < 0:
                f.normal_flip()
        D.bm_object(f"Mouse_Button{'R' if side > 0 else 'L'}", bm, M["mouseGraphite"], sharp=60)


def wheel(M, base):
    yw = WHEEL_T * L / 2
    ztop = surface(WHEEL_T, math.pi / 2).z
    # The wheel: a thin ribbed disc standing in the light groove (so it reads against it),
    # its axis across the mouse (X), sunk so only the top third shows.
    teeth = []
    for k in range(36):
        a = 2 * math.pi * k / 36
        rr = WHEEL_R if k % 2 == 0 else WHEEL_R - 0.0009
        teeth.append((rr * math.cos(a), rr * math.sin(a)))
    D.prism("Mouse_Wheel", teeth, WHEEL_W, M["mouseWheel"],
            loc=tuple(base + Vector((-WHEEL_W / 2, yw, ztop - 0.0034))),
            rot=(0, math.pi / 2, 0), r=0.0005, seg=1, angle=50)


def cord(M, base):
    y0 = L / 2
    # Strain relief poking out of the nose, then a short S-curved tail lying on the pad.
    D.tube("Mouse_Relief", [(0, y0 - 0.008, 0.0062), (0, y0 + 0.006, 0.0048)], 0.0034,
           M["mouseGraphite"], verts=10, caps="round", loc=tuple(base))
    D.tube("Mouse_Cord", [(0, y0 + 0.002, 0.0048), (0.0, y0 + 0.012, 0.0032),
                          (0.006, y0 + 0.024, CORD_R), (0.02, y0 + 0.033, CORD_R),
                          (0.036, y0 + 0.039, CORD_R), (0.05, y0 + 0.0445, CORD_R)],
           CORD_R, M["mouseGraphite"], verts=6, smooth=3, caps="round", loc=tuple(base))


def parts(M, at=(0, 0, 0), pad=True):
    """The mouse (and its pad) with the pad's bottom centre at `at`."""
    x, y, z = at
    if pad:
        D.prism("Mouse_Pad", D.rrect_pts(PAD_W, PAD_D, 0.03, steps=4), PAD_T, M["pad"],
                loc=(x, y, z), r=0.0028, seg=2)
        z += PAD_T
    base = Vector((x, y + Y_OFF, z))
    base_plate(M, base)
    body(M, base)
    buttons(M, base)
    wheel(M, base)
    cord(M, base)


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
