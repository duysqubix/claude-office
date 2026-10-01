"""Held clipboard: a chunky wooden board with a big chrome clip, a sheet of paper with
scribbled lines and checkboxes (two ticked), and a pen tucked under the clip. Held by its
bottom edge (pivot = hand grip, the mitten's centre just below that edge), leaning back so
the paper faces up toward the holder at +Y. Front faces -Y."""
import math

from mathutils import Matrix

from characters import _kit as kit

import lib

NAME = "held_clipboard"
BW, BT, BH = 0.23, 0.014, 0.31     # board
LEAN = math.radians(28)             # top leans away from the holder
GRIP_DROP = 0.035                   # hand centre below the bottom edge
META = dict(
    name="Clipboard (held)", category="character-held", priority="P0",
    description="Wooden clipboard with a checklist and a pen; held by its bottom edge",
    tags=["held", "clipboard", "planning", "paper"], tintable=["Accent"],
    anchors_bl={"handGrip": (0, 0, 0)},
)


def materials():
    return dict(
        board=kit.flat("Masonite", "#C98F5A", rough=0.6),
        chrome=kit.flat("Chrome", "#C8D0DC", rough=0.3, metal=0.4),
        paper=kit.flat("Paper", kit.COL["paper"], rough=0.7),
        ink=kit.flat("Ink", "#8A8FA8", rough=0.6),
        tick=kit.flat("Tick", "#4ADE80", rough=0.5),
        pen=kit.m_accent("#FF7A6B", rough=0.5),
        pen_cap=kit.flat("PenCap", "#2B2D42", rough=0.5),
    )


def build():
    lib.begin(NAME)
    M = materials()
    face = BT / 2  # the board's face toward the holder is +Y
    lib.rbox("Board", (BW, BT, BH), (0, 0, BH / 2), M["board"], r=0.012, seg=3)
    lib.rbox("Paper", (BW - 0.03, 0.002, BH - 0.06), (0, face + 0.001, BH / 2 - 0.012),
             M["paper"], r=0.004, seg=1)
    # Scribbles: a title bar, then checkbox rows with lines of different lengths.
    # Laid out as the holder reads it (from +Y, so their left is +X).
    lib.rbox("Title", (0.12, 0.0015, 0.012), (0.03, face + 0.0025, BH - 0.075), M["ink"],
             r=0.003, seg=1)
    for i, (ln, ticked) in enumerate([(0.12, True), (0.1, True), (0.13, False), (0.08, False),
                                      (0.11, False)]):
        z = BH - 0.11 - i * 0.034
        lib.rbox(f"Box{i}", (0.016, 0.0015, 0.016), (0.075, face + 0.0025, z), M["ink"],
                 r=0.003, seg=1)
        lib.rbox(f"Line{i}", (ln, 0.0015, 0.007), (0.06 - ln / 2, face + 0.0025, z),
                 M["ink"], r=0.0025, seg=1)
        if ticked:
            pts = [(0.083, face + 0.004, z + 0.001), (0.077, face + 0.004, z - 0.006),
                   (0.064, face + 0.004, z + 0.011)]
            kit.tube(f"Tick{i}", pts, 0.0028, M["tick"], ring=6, cap_rings=1)
    # The clip: a rounded base plate, the lever arch and its rivets.
    lib.rbox("ClipPlate", (0.1, 0.008, 0.034), (0, face + 0.004, BH - 0.02), M["chrome"],
             r=0.004, seg=2)
    lib.torus("ClipLever", 0.026, 0.0045, (0, face + 0.013, BH - 0.012), M["chrome"], seg=20,
              ring=8, rot=(0, 0, 0), sweep=math.pi).rotation_euler = (math.pi / 2, 0, 0)
    for s in (-1, 1):
        lib.sphere(f"Rivet{s}", 0.005, (s * 0.038, face + 0.009, BH - 0.02), M["chrome"],
                   u=10, v=6)
    # A pen tucked under the clip.
    pen_dir = Matrix.Rotation(math.radians(24), 3, "Y")
    a = (-0.07, face + 0.012, BH - 0.06)
    lib.cyl("Pen", 0.0065, 0.13, a, M["pen"], r=0.003, seg=1, verts=12,
            rot=pen_dir.to_euler())
    lib.cyl("PenCap", 0.007, 0.03, (a[0] + 0.045 * math.sin(math.radians(24)), a[1],
                                    a[2] + 0.045 * math.cos(math.radians(24))),
            M["pen_cap"], r=0.003, seg=1, verts=12, rot=pen_dir.to_euler())
    # Lean the whole board back about its bottom edge, and drop it onto the grip.
    tf = Matrix.Translation((0, 0, GRIP_DROP)) @ Matrix.Rotation(LEAN, 4, "X")
    kit.transform(lib.coll().objects, tf)


def finalize(name):
    return kit.finalize(name, META, ao_distance=0.04, preview_yaw=180)
