"""Keyboard: soft rounded tray with three rows of chunky keycaps and a fat space bar.
Origin at the bottom centre; keys face up, the space bar is at the front (-Y)."""
import lib

NAME = "keyboard"
AO_RES = 256
META = dict(
    name="Keyboard", category="desk-item", priority="P0",
    description="Chunky keyboard with big rounded keycaps",
    tags=["desk", "computer"], tintable=[],
    anchors_bl={"hands": (0, -0.02, 0.05)},
)


def materials():
    return dict(
        kb=lib.mat("Keyboard", "#E9ECF2", rough=0.6),
        keys=lib.mat("Keys", "#FFFFFF", rough=0.5),
        accent_key=lib.mat("KeyAccent", lib.P["claude"], rough=0.5),
    )


def parts(M, at=(0, 0, 0)):
    x, y, z = at
    lib.rbox("Kb_Base", (0.44, 0.16, 0.032), (x, y, z + 0.016), M["kb"], r=0.014, seg=2)
    pitch, n = 0.034, 11
    for row in range(3):
        for i in range(n):
            mat = M["accent_key"] if (row, i) == (0, n - 1) else M["keys"]
            lib.rbox(f"Kb_Key{row}_{i}", (0.028, 0.028, 0.02),
                     (x + (i - (n - 1) / 2) * pitch, y + 0.038 - row * 0.036, z + 0.038),
                     mat, r=0.007, seg=1)
    lib.rbox("Kb_Space", (0.17, 0.028, 0.02), (x, y - 0.07, z + 0.038), M["keys"], r=0.007,
             seg=1)


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
