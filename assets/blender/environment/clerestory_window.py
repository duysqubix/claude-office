"""Clerestory window: the high strip window above each main window, in the same soft
round-cornered frame as office_window but with a single chunky vertical mullion. Sized from
client/src/world/dimensions.json (`window` width 2.2 m, `clerestory` sill 3.15 to head 3.85,
wall 0.3 m), like the high windows in client/src/world/building.ts; scale X for the wider
north-wall bays and the south shop-front bays.

Origin: bottom centre of the opening (the sill line), centred in the wall thickness, so it
sits at wallPoint(side, mid, sill). Front (-Y, three.js +Z) is the outside face."""
import lib
from environment import _env

NAME = "clerestory_window"
AO_RES = 512
AO_DISTANCE = 0.2

HIGH = _env.DIMS["clerestory"]
OPEN_W = _env.DIMS["window"]["w"]
OPEN_H = HIGH["head"] - HIGH["sill"]
WALL_T = _env.DIMS["building"]["wallT"]


def materials():
    return dict(
        trim=lib.mat("Trim", "#F8F3EA", rough=0.55),
        sill=lib.mat("Sill", "#F1E9DC", rough=0.6),
        glass=lib.mat("Glass", _env.P["glass"], rough=0.05, alpha=0.35),
    )


def build():
    lib.begin(NAME)
    _env.wall_window(materials(), OPEN_W, OPEN_H, transom=None, wall_t=WALL_T)


META = dict(
    name="Clerestory window",
    category="building",
    priority="P0",
    description=("High strip window: the office window's soft round-cornered frame with a single "
                 "chunky mullion, sill ledge and one glass pane"),
    tags=["window", "wall", "glass", "clerestory"],
    tintable=[],
    anchors={"glassCenter": [0, round(OPEN_H / 2, 3), 0]},
    mount=(f"wall opening: origin at the bottom centre of the {OPEN_W:g} x {OPEN_H:g} m "
           f"clerestory opening (sill {HIGH['sill']:g}, head {HIGH['head']:g}), centred in the "
           f"{WALL_T:g} m wall. Place at wallPoint(side, mid, {HIGH['sill']:g}); scale X for "
           "other widths (north bays are about 2.9-3.0 m)."),
    notes="Glass material is 'Glass' (alpha 0.35); swap it for the game's glare glass by name.",
)


def finalize(name):
    # It sits in a wall opening: nothing to bake contact shadow against.
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, ground=None)
