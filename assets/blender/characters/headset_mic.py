"""Headset with mic: the support-desk look. A slim band over the crown, a padded cup on
the left ear and a small pad on the right, and a bendy boom mic sweeping forward to the
corner of the mouth with a fat foam tip. Cups `Accent`. Pivot at the head centre."""
import math

from mathutils import Vector

from characters import _kit as kit

import lib

NAME = "headset_mic"
COLOR = "#3D7CFF"
CUP_X = kit.HX + 0.028
MIC_TIP = kit.face_point(0.075, -0.1, 0.04)
META = dict(
    name="Headset with mic", category="character-accessory", priority="P0",
    description="Slim call-centre headset with a boom mic and foam tip",
    tags=["headset", "mic", "support", "head"], tintable=["Accent"],
    anchors_bl={"micTip": tuple(MIC_TIP), "headTop": (0, 0.01, kit.HZ + 0.05)},
)


def build():
    lib.begin(NAME)
    M = dict(cup=kit.m_accent(COLOR, rough=0.5), band=kit.flat("Band", "#3B4252", 0.5),
             pad=kit.flat("Cushion", "#2B2D42", 0.85), foam=kit.flat("Foam", "#2B2D42", 0.95))
    pts = []
    for i in range(17):
        a = math.radians(-80 + 160 * i / 16)
        pts.append(Vector(((kit.HX + 0.03) * math.sin(a), 0.01,
                           (kit.HZ + 0.032) * math.cos(a))))
    kit.tube("Band", pts, 0.0095, M["band"], ring=8, cap_rings=2)
    rot = (0, math.pi / 2, 0)
    lib.cyl("CupL", 0.056, 0.042, (CUP_X, 0.01, -0.004), M["cup"], r=0.016, seg=3, verts=18,
            rot=rot)
    lib.cyl("CushionL", 0.05, 0.022, (CUP_X - 0.026, 0.01, -0.004), M["pad"], r=0.009, seg=2,
            verts=16, rot=rot)
    lib.cyl("CushionR", 0.044, 0.026, (-(kit.HX + 0.012), 0.01, -0.004), M["pad"], r=0.009,
            seg=2, verts=16, rot=rot)
    lib.cyl("PadR", 0.04, 0.012, (-(kit.HX + 0.028), 0.01, -0.004), M["cup"], r=0.005, seg=2,
            verts=16, rot=rot)
    # Boom: out of the left cup, forward and down to the corner of the mouth.
    boom = [Vector((CUP_X + 0.012, -0.02, -0.02)), Vector((CUP_X - 0.005, -0.12, -0.075)),
            Vector((0.2, -0.24, -0.1)), MIC_TIP + Vector((0.012, 0.0, 0.0))]
    kit.tube("Boom", kit.catmull(boom, 12), 0.0065, M["band"], ring=6, cap_rings=2)
    lib.sphere("MicFoam", 1.0, tuple(MIC_TIP), M["foam"], scale=(0.022, 0.018, 0.018), u=14,
               v=8)


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.05)
