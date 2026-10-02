"""Baseball cap: an oversized six-panel crown (seams carved in, a button on top, a snapback
strap at the back) with a chunky curved bill, worn a little high at the front. `Accent`.
Sized like Wobbly Life hats, about 1.15× the head, so short hair hides under it. Pivot at
the head centre. hat_cap_backwards reuses cap()."""
import numpy as np

from characters import _kit as kit

import lib

NAME = "hat_cap"
COLOR = "#FF5A5F"
META = dict(
    name="Cap", category="character-hat", priority="P0",
    description="Oversized baseball cap with a chunky curved bill",
    tags=["hat", "cap"], tintable=["Accent"],
    anchors_bl={"hatBand": (0, -0.31, 0.149), "headTop": (0, 0.01, 0.36)},
)
CENTRE = (0.0, 0.01, 0.03)
# The opening is a tilted plane z = z0 + slope * y, high enough at the front that the brows
# (rig face.brows) stay in view, like the rig's hatBand ring tilted back.
BAND = {False: (0.075, -0.24), True: (0.095, -0.15)}
RADII = (kit.HX + 0.048, kit.HY + 0.05, kit.HZ + 0.035)


def crown_sdf(back=False):
    """The dome, cut flat along the tilted band plane."""
    z0, slope = BAND[back]

    def crown(P):
        d = kit.sd_ellipsoid(P, CENTRE, RADII)
        return kit.smax(d, (z0 + slope * P[:, 1]) - P[:, 2], 0.016)
    return crown


def cap_sdf(back=False):
    s = 1.0 if back else -1.0               # which way the bill points along y
    z0, slope = BAND[back]
    yr = s * 0.3
    zr = z0 + slope * yr                    # where the bill leaves the band
    tilt = 0.12 if back else -0.2           # bill pitch as it reaches out
    crown = crown_sdf(back)

    def bill(P):
        reach = s * P[:, 1] - 0.3
        zb = zr + tilt * reach - 0.55 * P[:, 0] ** 2
        d = np.abs(P[:, 2] - zb) - 0.0105
        ell = (np.sqrt((P[:, 0] / 0.18) ** 2 + ((P[:, 1] - yr) / 0.19) ** 2) - 1.0) * 0.18
        d = kit.smax(d, ell, 0.008)
        return kit.smax(d, 0.24 - s * P[:, 1], 0.004)

    seams = [[(6, ph), (36, ph), (end, ph)] for ph, end in
             ((0, 57), (60, 63), (120, 78), (180, 87), (240, 78), (300, 63))]
    if back:
        seams = [[(t, (p + 180) % 360) for t, p in g] for g in seams]
    shell = kit.carved(crown, seams, r0=0.002, r1=0.0042, sink=0.0, extend=0.0, k=0.003)
    return lambda P: kit.smin(shell(P), bill(P), 0.012)


def cap(M, back=False):
    s = 1.0 if back else -1.0
    kit.sdf_mesh("Cap", cap_sdf(back), (-0.36, -0.52, -0.12), (0.36, 0.52, 0.4), M["cap"],
                 voxel=0.0035, trim=kit.outside_head(), target=1680, remesh="decimate")
    top = CENTRE[2] + RADII[2]
    lib.sphere("Button", 0.022, (0, CENTRE[1], top - 0.004), M["cap"], scale=(1, 1, 0.55),
               u=14, v=8)
    # Snapback strap on the side opposite the bill, sitting on the dome just above the band.
    z0, slope = BAND[back]
    crown = crown_sdf(back)
    zs = z0 + slope * (-s * 0.3) + 0.026
    p = kit.surface_point(crown, (0, -s, 0), centre=(0, CENTRE[1], zs))
    n = kit.sdf_normal(crown, p)
    strap = lib.rbox("Strap", (0.085, 0.012, 0.022), (0, 0, 0), M["strap"], r=0.005, seg=2)
    kit.place(strap, p + n * 0.002, kit.frame_from(n))


def materials():
    return dict(cap=kit.m_accent(COLOR, rough=0.75), strap=kit.flat("Strap", "#3B4252", 0.6))


def build():
    lib.begin(NAME)
    cap(materials())


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.08)
