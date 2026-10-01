"""Pizza slice: a chunky triangular slice. Golden puffy crust along the back, saucy edge,
melty cheese top with a drip off the tip, and fat pepperoni discs. Tip points -Y; origin at
the bottom centre (lies flat on a plate or table)."""
import math

import lib

NAME = "pizza_slice"
AO_RES = 256
L, W = 0.24, 0.2
META = dict(
    name="Pizza slice", category="food", priority="P2", artist="Claude Monet",
    description="Chunky pepperoni pizza slice",
    tags=["party", "event", "food", "snack"], tintable=[],
    anchors_bl={"grip": (0, L / 2 - 0.02, 0.03)},
)


def materials():
    return dict(
        base=lib.mat("Base", "#F2C27B", rough=0.7),
        crust=lib.mat("Crust", "#D9963F", rough=0.65),
        sauce=lib.mat("Sauce", "#E2462E", rough=0.5),
        cheese=lib.mat("Cheese", "#FFD86B", rough=0.4),
        pep=lib.mat("Pepperoni", "#B8322A", rough=0.45),
    )


def parts(M):
    tip, back = (0, -L / 2), L / 2
    lib.slab("PZ_Base", [tip, (W / 2, back), (-W / 2, back)], 0.0, 0.016, material=M["base"],
             r=0.004, seg=1)
    lib.slab("PZ_Sauce", [(0, -L / 2 + 0.008), (W / 2 - 0.01, back - 0.012),
                          (-W / 2 + 0.01, back - 0.012)], 0.016, 0.02, material=M["sauce"],
             r=0.002, seg=1)
    ch = lib.slab("PZ_Cheese", [(0, -L / 2 + 0.018), (W / 2 - 0.02, back - 0.022),
                               (-W / 2 + 0.02, back - 0.022)], 0.019, 0.028,
                  material=M["cheese"], r=0.003, seg=1)
    lib.subsurf(ch, 1)
    lib.cyl("PZ_Crust", 0.024, W + 0.02, (0, back - 0.01, 0.022), M["crust"], r=0.012, seg=2,
            verts=16, rot=(0, math.pi / 2, 0))
    for i, (x, y) in enumerate(((0.0, 0.0), (-0.035, 0.06), (0.04, 0.055), (0.0, -0.06))):
        lib.cyl(f"PZ_Pep{i}", 0.022, 0.008, (x, y, 0.031), M["pep"], r=0.003, seg=1, verts=16)
    lib.sphere("PZ_Drip", 0.012, (0, -L / 2 + 0.004, 0.012), M["cheese"], scale=(1, 1, 1.6),
               u=10, v=6)


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
