"""Headphones: big cushy over-ear cans: a chunky padded band arching over the crown, fat
rounded cups (`Accent`) with cream face plates and soft dark ear cushions, little sliders
where the band meets the cups. Sized to sit over most hair. Pivot at the head centre."""
import math

from mathutils import Vector

from characters import _kit as kit

import lib

NAME = "headphones"
COLOR = "#9B5DE5"
CUP_X = kit.HX + 0.04
CUP_Z = -0.005
BAND_R = (kit.HX + 0.07, kit.HZ + 0.075)
META = dict(
    name="Headphones", category="character-accessory", priority="P0",
    description="Big cushy over-ear headphones with a padded band",
    tags=["headphones", "music", "focus", "head"], tintable=["Accent"],
    anchors_bl={"headTop": (0, 0.01, BAND_R[1] + 0.02), "cupL": (CUP_X, 0.01, CUP_Z),
                "cupR": (-CUP_X, 0.01, CUP_Z)},
)


def band_pts(a0, a1, n, rx, rz, y=0.012):
    out = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / max(n, 1))
        out.append(Vector((rx * math.sin(a), y, rz * math.cos(a) + CUP_Z * 0.3)))
    return out


def build():
    lib.begin(NAME)
    M = dict(shell=kit.m_accent(COLOR, rough=0.5), plate=kit.flat("Plate", "#FFF6E8", 0.5),
             pad=kit.flat("Cushion", "#3B4252", rough=0.85))
    kit.tube("Band", band_pts(-72, 72, 20, *BAND_R), 0.018, M["shell"], ring=10)
    kit.tube("BandPad", band_pts(-38, 38, 10, BAND_R[0] - 0.025, BAND_R[1] - 0.025), 0.021,
             M["pad"], ring=8)
    for s in (1, -1):
        x = s * CUP_X
        rot = (0, math.pi / 2, 0)
        lib.cyl(f"Cup{s}", 0.088, 0.064, (x + s * 0.006, 0.01, CUP_Z), M["shell"], r=0.024,
                seg=2, verts=22, rot=rot)
        lib.cyl(f"Plate{s}", 0.062, 0.012, (x + s * 0.04, 0.01, CUP_Z), M["plate"], r=0.005,
                seg=1, verts=20, rot=rot)
        lib.cyl(f"Cushion{s}", 0.078, 0.032, (x - s * 0.032, 0.01, CUP_Z), M["pad"], r=0.014,
                seg=2, verts=20, rot=rot)
        # Slider from the band's end down into the top of the cup.
        top = band_pts(s * 72, s * 72, 0, *BAND_R)[0]
        kit.tube(f"Slider{s}", [top, Vector((x + s * 0.006, 0.01, CUP_Z + 0.08))], 0.013,
                 M["shell"], ring=8, cap_rings=2)


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.06)
