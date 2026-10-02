"""Mug, manager edition: the desk mug a size up in cream, "WORLD'S OKAYEST MANAGER" printed
in red around the front, a gold band under the lip. 0.11 m tall; origin at the
desk-contact centre. Not tintable."""
import math

import lib
from decor import _decor as D
from decor import mug

NAME = "mug_manager"
AO_RES = 256
AO_DISTANCE = 0.035
S = 1.1
META = dict(
    name="Manager's mug", category="desk-item", priority="P0",
    description="The manager's \"WORLD'S OKAYEST MANAGER\" mug, cream with red print and a gold band",
    tags=["desk", "coffee", "manager"], tintable=[],
    anchors_bl={"coffee": (0, 0, mug.COFFEE_Z * S), "handle": (0.075 * S, 0, 0.056 * S)},
)


def materials():
    return dict(
        glaze=D.mat("Glaze", "paper", rough=0.4),
        inside=D.mat("GlazeInside", "#FFF7EC", rough=0.4),
        coffee=D.mat("Coffee", "#7A4A2E", rough=0.45),
        foam=D.mat("Foam", "foam", rough=0.6),
        ink=D.mat("Print", "red", rough=0.45),
        gold=D.mat("Gold", "gold", rough=0.3, metal=0.35),
    )


def lettering(M):
    # Flat print floating 0.5 mm off the glaze, following the wall's gentle taper. The block
    # spans about ±33° and sits 6° round towards the handle, so from a 3/4 view no letter
    # wraps past the silhouette (from straight ahead it still reads as centred).
    def radius(z):
        return mug.outer_r(z / S) * S + 0.0005

    parts = D.snapshot()
    for i, word in enumerate(("WORLD'S", "OKAYEST", "MANAGER")):
        z = (0.0717 - i * 0.0132) * S
        t = D.text(f"Print_{word}", word, 0.0105 * S, M["ink"], loc=(0, -radius(z), z),
                   depth=0, res=2)
        D.wrap_cylinder(t, radius, base=radius(z))
    D.place(D.since(parts), rot=(0, 0, math.radians(6)))


def rim(M):
    lib.torus("Rim_Gold", mug.outer_r(0.0975) * S, 0.0016 * S, (0, 0, 0.0975 * S), M["gold"],
              seg=32, ring=6)


def build():
    lib.begin(NAME)
    M = materials()
    mug.make(M, s=S, heart=False)
    lettering(M)
    rim(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
