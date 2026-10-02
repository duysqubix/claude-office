"""Held phone: a chunky smartphone in a bright rounded case (`Accent`), a glowing `Screen`
facing the holder (UVs mirrored so the game's canvas reads right), a camera bump on the
back. Pivot = hand grip: the mitten holds it from behind, low down; the phone leans back a
little so the screen tips up toward the holder's face at +Y. Front faces -Y."""
import math

from mathutils import Matrix

from characters import _kit as kit

import lib

NAME = "held_phone"
PW, PT, PH = 0.078, 0.013, 0.152
LEAN = math.radians(14)
META = dict(
    name="Phone (held)", category="character-held", priority="P0",
    description="Chunky smartphone in a bright case; Screen faces the holder; pivot at the rig's handGrip",
    tags=["held", "phone", "screen"], tintable=["Accent"],
    anchors_bl={"handGrip": (0, 0, 0), "handCentre": tuple(kit.hand_from_grip())},
)


def materials():
    return dict(
        case=kit.m_accent("#FF7EB6", rough=0.55),
        bezel=kit.flat("Bezel", "#2B2D42", rough=0.4),
        screen=lib.mat("Screen", lib.P["screenGlow"], rough=0.3, emit=lib.P["screenGlow"],
                       strength=1.2),
        lens=kit.flat("Lens", "#1E1B2E", rough=0.15),
        ring=kit.flat("LensRing", "#C8D0DC", rough=0.3, metal=0.4),
    )


def build():
    lib.begin(NAME)
    M = materials()
    # Built standing at the origin with the screen toward +Y, then leaned and lifted
    # onto the grip.
    lib.rbox("Case", (PW, PT, PH), (0, 0, PH / 2), M["case"], r=0.011, seg=3)
    lib.rbox("Bezel", (PW - 0.008, 0.003, PH - 0.008), (0, PT / 2, PH / 2), M["bezel"],
             r=0.008, seg=2)
    lib.rbox("Screen", (PW - 0.016, 0.003, PH - 0.03), (0, PT / 2 + 0.0008, PH / 2 + 0.002),
             M["screen"], r=0.006, seg=2)
    lib.rbox("Speaker", (0.016, 0.003, 0.003), (0, PT / 2 + 0.001, PH - 0.009), M["lens"],
             r=0.0014, seg=1)
    # Camera bump on the back (-Y), top left as seen from behind.
    lib.rbox("Bump", (0.03, 0.004, 0.03), (0.015, -PT / 2 - 0.0015, PH - 0.024), M["bezel"],
             r=0.007, seg=2)
    for i, (x, z) in enumerate([(0.0085, PH - 0.017), (0.0085, PH - 0.031)]):
        lib.cyl(f"LensRing{i}", 0.0055, 0.003, (x, -PT / 2 - 0.0042, z), M["ring"], r=0.0012,
                seg=1, verts=16, rot=(math.pi / 2, 0, 0))
        lib.cyl(f"Lens{i}", 0.0038, 0.003, (x, -PT / 2 - 0.0052, z), M["lens"], r=0.001,
                seg=1, verts=16, rot=(math.pi / 2, 0, 0))
    lib.sphere("Flash", 0.0028, (0.024, -PT / 2 - 0.0035, PH - 0.024), M["ring"], u=10, v=6)
    # The mitten (r ≈ 0.08) holds it from behind and below: the phone sits between the
    # hand and the holder (+Y), clear of the mitten.
    tf = Matrix.Translation((0, 0.078, -0.035)) @ Matrix.Rotation(LEAN, 4, "X")
    kit.transform(lib.coll().objects, tf)
    kit.regrip()  # origin: the rig's handGrip (3 cm below, 6 cm ahead of the mitten centre)


def finalize(name):
    return kit.finalize(name, META, ao_distance=0.03, screen_back=True, preview_yaw=180)
