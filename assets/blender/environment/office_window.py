"""Office window: a big, soft, round-cornered frame that wraps the wall opening, a chunky cross
mullion with the transom at 55 % of the height, a deep sill ledge on both faces and one glass
pane. Sized from client/src/world/dimensions.json (`window`: 2.2 m wide, sill 0.95 to head
2.45, wall 0.3 m), like the east/west bays in client/src/world/building.ts; scale X for
narrower or wider bays. The clerestory above it is clerestory_window.

Origin: bottom centre of the opening (the sill line), centred in the wall thickness, so it
sits at wallPoint(side, mid, sill). Front (-Y, three.js +Z) is the outside face."""
import lib
from environment import _env

NAME = "office_window"
AO_RES = 512
AO_DISTANCE = 0.25

WIN = _env.DIMS["window"]
OPEN_W = WIN["w"]
OPEN_H = WIN["head"] - WIN["sill"]
WALL_T = _env.DIMS["building"]["wallT"]
TRANSOM = 0.55  # fraction of the height, as in building.ts


def materials():
    return dict(
        trim=lib.mat("Trim", "#F8F3EA", rough=0.55),
        sill=lib.mat("Sill", "#F1E9DC", rough=0.6),
        glass=lib.mat("Glass", _env.P["glass"], rough=0.05, alpha=0.35),
    )


def build():
    lib.begin(NAME)
    _env.wall_window(materials(), OPEN_W, OPEN_H, transom=TRANSOM, wall_t=WALL_T)


META = dict(
    name="Office window",
    category="building",
    priority="P0",
    description=("Big round-cornered white frame with a chunky cross mullion, deep sill ledge and "
                 "one glass pane"),
    tags=["window", "wall", "glass"],
    tintable=[],
    anchors={"glassCenter": [0, round(OPEN_H / 2, 3), 0]},
    mount=(f"wall opening: origin at the bottom centre of the {OPEN_W:g} x {OPEN_H:g} m main "
           f"window opening (sill {WIN['sill']:g}, head {WIN['head']:g}), centred in the "
           f"{WALL_T:g} m wall. Place at wallPoint(side, mid, {WIN['sill']:g}); scale X for "
           "other bay widths. Transom at 55 % of the height."),
    notes="Glass material is 'Glass' (alpha 0.35); swap it for the game's glare glass by name.",
)


def finalize(name):
    # It sits in a wall opening: nothing to bake contact shadow against.
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, ground=None)
