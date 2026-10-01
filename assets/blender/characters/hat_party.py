"""Party hat: a jaunty striped cone perched on the crown, tipped to one side, with a fluffy
rim and a pom-pom on top. `Accent` stripes alternate with white. Pivot at the head centre."""
import math

from mathutils import Euler, Vector

from characters import _kit as kit
from characters import _monet as mo

import lib

NAME = "hat_party"
COLOR = "#B983FF"
ROLL = 0.28                      # tipped toward character-left
BASE_Z = 0.215
H = 0.34
META = mo.meta("Party hat", "character-hat", "Striped party cone with a pom-pom",
               ["hat", "party", "celebration"],
               anchors_bl={"headTop": (math.sin(ROLL) * (H + 0.05), 0.0, BASE_Z + math.cos(ROLL) * (H + 0.05))})


def build():
    lib.begin(NAME)
    hat = kit.m_accent(COLOR, rough=0.6)
    white = kit.flat("Stripe", "#FFFFFF", rough=0.6)
    fluff = kit.flat("Fluff", "#FFF6E8", rough=0.9)
    prof = [(0.0, 0.0), (0.135, 0.0)]
    n = 10
    for i in range(1, n + 1):
        t = i / n
        prof.append((0.135 * (1 - t) + 0.008 * t, H * t))
    prof.append((0.0, H + 0.004))
    cone = lib.lathe("Cone", prof, (0, 0, BASE_Z), hat, verts=28, rot=(0, ROLL, 0))
    cone.data.materials.append(white)
    for p in cone.data.polygons:                        # alternate stripes by height
        if 0 < p.center.z < H and int(p.center.z / (H / 5)) % 2 == 1:
            p.material_index = 1
    # The cone turns about its own base centre, so rim and pom must too.
    base = Vector((0, 0, BASE_Z))
    roll = Euler((0, ROLL, 0)).to_matrix()
    lib.torus("Rim", 0.135, 0.022, tuple(base + roll @ Vector((0, 0, 0.005))), fluff, seg=28,
              ring=8, rot=(0, ROLL, 0))
    lib.sphere("Pom", 0.042, tuple(base + roll @ Vector((0, 0, H + 0.02))), fluff, u=14, v=8)


def finalize(name):
    return mo.finalize_head(name, META)
