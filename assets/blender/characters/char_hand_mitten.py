"""Hand: a chunky mitten (palm 0.148 wide, 0.168 tall) with a fat thumb pointing forward
and a soft wrist, sculpted as one smooth piece. `Skin`. Pivot at the wrist; the mitten's
centre sits hand.offset below it (rig-dimensions.json). Symmetric, so it serves both hands."""
from characters import _body as B
from characters import _kit as kit

import lib

NAME = "char_hand_mitten"
META = dict(
    name="Mitten hand", category="character-body", priority="P0",
    description="Chunky mitten hand with a forward thumb; pivot at the wrist",
    tags=["body", "hand", "mitten"], tintable=["Skin"],
    anchors_bl={"handCentre": (0, 0, -B.L["hand"]["offset"]),
                "handGrip": tuple(kit.Vector((0, 0, -B.L["hand"]["offset"])) +
                                  kit.bl(*kit.GRIP_FROM_HAND))},
)


def build():
    lib.begin(NAME)
    B.mitten(B.materials())


def finalize(name):
    # Turned for the catalog shot so the thumb shows in silhouette.
    return kit.finalize(name, META, ao=False, preview_yaw=143)
