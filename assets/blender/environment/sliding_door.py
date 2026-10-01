"""Sliding glass entrance doors: a chunky slate frame (two posts, a header with a little
glowing motion sensor, a threshold strip) and two glass panels as separate nodes `DoorL` and
`DoorR` that the game slides into the wall. Fits the south-wall opening in
client/src/world/layout.ts (3.0 m wide, 2.25 m high, wall 0.3 m thick).

Origin: floor centre of the opening, centred in the wall thickness. Front (-Y, three.js +Z)
faces outside. Each panel's pivot is its own bottom centre in the closed position; open by
moving DoorL along -X and DoorR along +X by OPEN_TRAVEL."""
import lib
from environment import _env

NAME = "sliding_door"
AO_RES = 512
AO_DISTANCE = 0.3

OPEN_W = 3.0     # opening width (OFFICE.doorHalf * 2)
OPEN_H = 2.25    # opening height (OFFICE.doorH)
WALL_T = 0.3     # OFFICE.wallT
PANEL_W = OPEN_W / 2 + 0.03
PANEL_H = OPEN_H - 0.02
OPEN_TRAVEL = PANEL_W - 0.06
RAIL = 0.07


def materials():
    return dict(
        frame=lib.mat("Frame", _env.P["doorFrame"], rough=0.5),
        sill=lib.mat("Threshold", "#566275", rough=0.6),
        metal=lib.mat("Metal", _env.P["metal"], rough=0.4, metal=0.4),
        glass=lib.mat("Glass", _env.P["glass"], rough=0.05, alpha=0.35),
        dots=lib.mat("Decal", "#EAF4FA", rough=0.6),
        stripe=lib.mat("Stripe", _env.P["wallAccent"], rough=0.6),
        bezel=lib.mat("SensorBezel", "#2B3442", rough=0.45),
        sensor=_env.glow("Sensor", _env.P["stateWorking"], strength=2.0),
    )


def frame(M):
    depth = WALL_T + 0.14
    for s in (-1, 1):
        x = s * (OPEN_W / 2 + 0.04)
        lib.rbox(f"Post{'LR'[s > 0]}", (0.16, depth, OPEN_H + 0.12), (x, 0, (OPEN_H + 0.12) / 2),
                 M["frame"], r=0.05, seg=3)
        # Rubber bumper feet so the posts don't just stop at the floor.
        lib.rbox(f"PostFoot{'LR'[s > 0]}", (0.2, depth + 0.04, 0.06), (x, 0, 0.03), M["frame"],
                 r=0.025, seg=2)
    # Header with the slider motor inside, wider and deeper than the posts.
    lib.rbox("Header", (OPEN_W + 0.28, depth + 0.06, 0.24), (0, 0, OPEN_H + 0.12), M["frame"],
             r=0.07, seg=3)
    # Mint stripe along both faces of the header (the wall's wainscot colour).
    for s, side in ((-1, "Out"), (1, "In")):
        lib.rbox(f"Stripe{side}", (OPEN_W + 0.1, 0.03, 0.06),
                 (0, s * (depth / 2 + 0.03), OPEN_H + 0.2), M["stripe"], r=0.014, seg=2)
    # Motion sensor: a dark puck with a glowing dome, on both faces.
    for s, side in ((-1, "Out"), (1, "In")):
        y = s * (depth / 2 + 0.03)
        lib.cyl(f"Sensor{side}", 0.07, 0.04, (0, y + s * 0.01, OPEN_H + 0.07), M["bezel"],
                r=0.015, seg=2, verts=24, rot=(1.5708, 0, 0))
        lib.sphere(f"SensorDome{side}", 0.038, (0, y + s * 0.032, OPEN_H + 0.07), M["sensor"],
                   scale=(1, 0.6, 1), u=16, v=8)
    lib.rbox("Threshold", (OPEN_W, depth, 0.022), (0, 0, 0.011), M["sill"], r=0.008, seg=2)


def panel(M, node, sx):
    """One glass panel; sx = -1 for the left one (its meeting edge is at x = 0)."""
    cx = sx * PANEL_W / 2
    w, h = PANEL_W, PANEL_H
    lib.rbox(f"{node}_RailTop", (w, RAIL, RAIL), (cx, 0, h - RAIL / 2), M["frame"], r=0.025,
             seg=2)
    lib.rbox(f"{node}_RailBottom", (w, RAIL, RAIL * 1.7), (cx, 0, RAIL * 0.85), M["frame"],
             r=0.025, seg=2)
    for e in (-1, 1):
        lib.rbox(f"{node}_Stile{e + 1}", (RAIL, RAIL, h), (cx + e * (w / 2 - RAIL / 2), 0, h / 2),
                 M["frame"], r=0.025, seg=2)
    gw, gh = w - 2 * RAIL + 0.02, h - RAIL * 2.7 + 0.02
    lib.rbox(f"{node}_Glass", (gw, 0.02, gh), (cx, 0, RAIL * 1.7 + gh / 2 - 0.01), M["glass"],
             r=0.006, seg=1)
    # Frosted safety dots at a Wobbly's eye level, on both faces.
    for i in range(4):
        x = cx + (i - 1.5) * 0.26
        for s in (-1, 1):
            lib.cyl(f"{node}_Dot{i}{'ab'[s > 0]}", 0.06, 0.006, (x, s * 0.013, 1.15),
                    M["dots"], r=0, verts=16, rot=(1.5708, 0, 0))
    # Pull handle near the meeting edge, on both faces.
    hx = -sx * 0.17
    for s in (-1, 1):
        lib.rbox(f"{node}_Handle{'ab'[s > 0]}", (0.045, 0.04, 0.62), (hx, s * 0.075, 1.05),
                 M["metal"], r=0.02, seg=2)
        for z in (0.8, 1.3):
            lib.cyl(f"{node}_Standoff{'ab'[s > 0]}{z}", 0.015, 0.05, (hx, s * 0.045, z), M["metal"],
                    r=0, verts=8, rot=(1.5708, 0, 0))
    # The whole panel becomes one child node, pivoting at its bottom centre.
    for o in lib.coll().objects:
        if o.name.startswith(node + "_"):
            lib.node(o, node, pivot=(cx, 0.0, 0.0))


def build():
    lib.begin(NAME)
    M = materials()
    frame(M)
    panel(M, "DoorL", -1)
    panel(M, "DoorR", 1)


META = dict(
    name="Sliding glass doors",
    category="building",
    priority="P0",
    description=("Chunky slate door frame with a mint stripe and a glowing motion sensor; two "
                 "glass panels slide apart"),
    tags=["entrance", "door", "glass", "animated"],
    tintable=[],
    anchors={"outside": [0, 0, 0.8], "inside": [0, 0, -0.8], "sensor": [0, 2.32, 0.27]},
    nodes={
        "DoorL": ("glass panel; pivot at its bottom centre, x = -0.765 when closed; open by moving "
                  "-X by 1.47"),
        "DoorR": ("glass panel; pivot at its bottom centre, x = +0.765 when closed; open by moving "
                  "+X by 1.47"),
    },
    mount=("wall opening: origin at the floor centre of a 3.0 x 2.25 m opening, centred in the 0.3 "
           "m wall; +Z (front) faces outside. Panels slide into the wall."),
    notes=("Glass material is 'Glass' (alpha 0.35, shared by both panels); swap it for the game's "
           "glare glass by name."),
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
