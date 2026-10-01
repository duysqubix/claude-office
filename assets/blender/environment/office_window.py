"""Office window: a big, soft, round-cornered frame that wraps the wall opening, a chunky cross
mullion, a deep sill ledge on both faces and one glass pane. Fits the east/west wall bays in
client/src/world/building.ts (opening 2.2 m wide, 1.17 m tall from the 0.95 m sill, wall
0.3 m thick); scale X for narrower or wider bays.

Origin: bottom centre of the opening (the sill line), centred in the wall thickness, so it
sits at wallPoint(side, mid, 0.95). Front (-Y, three.js +Z) is the outside face."""
import lib
from environment import _env

NAME = "office_window"
AO_RES = 512
AO_DISTANCE = 0.25

OPEN_W = 2.2
OPEN_H = 1.17
WALL_T = 0.3
MULLION_Z = 0.65  # the transom bar, 1.6 m above the floor


def materials():
    return dict(
        trim=lib.mat("Trim", "#F8F3EA", rough=0.55),
        sill=lib.mat("Sill", "#F1E9DC", rough=0.6),
        glass=lib.mat("Glass", _env.P["glass"], rough=0.05, alpha=0.35),
    )


def frame(M):
    depth = WALL_T + 0.08
    _env.rr_ring("Frame", (OPEN_W + 0.22, OPEN_H + 0.22, 0.17), (OPEN_W - 0.08, OPEN_H - 0.08, 0.1),
                 depth, (0, 0, OPEN_H / 2), M["trim"], seg=8, bevel=0.035)
    # Cross mullion, slimmer than the frame and set into the wall's middle.
    lib.rbox("MullionV", (0.11, 0.12, OPEN_H - 0.04), (0, 0, OPEN_H / 2), M["trim"], r=0.035,
             seg=3)
    lib.rbox("MullionH", (OPEN_W - 0.04, 0.12, 0.1), (0, 0, MULLION_Z), M["trim"], r=0.035,
             seg=3)
    # Sill ledge: sticks out on both faces, slightly wider than the frame.
    _env.rr_prism("SillLedge", OPEN_W + 0.36, WALL_T + 0.26, 0.075, 0.06, (0, 0, -0.07),
                  M["sill"], seg=5, bevel=0.03, bseg=3)


def pane(M):
    lib.rbox("Glass", (OPEN_W - 0.06, 0.02, OPEN_H - 0.06), (0, 0.0, OPEN_H / 2), M["glass"],
             r=0.006, seg=1)


def build():
    lib.begin(NAME)
    M = materials()
    frame(M)
    pane(M)


META = dict(
    name="Office window",
    category="building",
    priority="P0",
    description=("Big round-cornered white frame with a chunky cross mullion, deep sill ledge and "
                 "one glass pane"),
    tags=["window", "wall", "glass"],
    tintable=[],
    anchors={"glassCenter": [0, 0.585, 0]},
    mount=("wall opening: origin at the bottom centre of a 2.2 x 1.17 m opening (the 0.95 m sill "
           "line), centred in the 0.3 m wall. Place at wallPoint(side, mid, 0.95); scale X for "
           "other widths."),
    notes="Glass material is 'Glass' (alpha 0.35); swap it for the game's glare glass by name.",
)


def finalize(name):
    # It sits in a wall opening: nothing to bake contact shadow against.
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, ground=None)
