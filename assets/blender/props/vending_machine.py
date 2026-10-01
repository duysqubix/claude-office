"""Vending machine: chunky red machine with a "SNACKS" header, a framed window of colourful
snacks and cans on four shelves (glass is suggested by white glare streaks, no
transparency), a keypad column with a coin slot, and a pickup flap. Front faces -Y."""
import math
import random

import lib

NAME = "vending_machine"
AO_RES = 512
W, D, H = 0.92, 0.78, 1.86
SNACK_COLOURS = ["#FF6B6B", "#FFD93D", "#4D96FF", "#6BCB77", "#FF9F45", "#B983FF", "#FF7EB6",
                 "#00C2C7"]
META = dict(
    name="Vending machine", category="appliance", priority="P1",
    description="Red snack vending machine with colourful snacks behind glass",
    tags=["break-room", "food", "interactable"], tintable=[],
    anchors_bl={"pickup": (-0.1, -0.45, 0.3), "keypad": (0.33, -0.42, 1.1)},
)


def materials():
    M = dict(
        body=lib.mat("Body", "#FF5A5F", rough=0.45),
        trim=lib.mat("Trim", lib.P["paper"], rough=0.5),
        inside=lib.mat("Inside", "#2B2D42", rough=0.8),
        shelf=lib.mat("Shelf", lib.P["metal"], rough=0.35, metal=0.3),
        glare=lib.mat("Glare", "#FFFFFF", rough=0.2),
        keypad=lib.mat("Keypad", lib.P["chairBase"], rough=0.5),
        key=lib.mat("Key", lib.P["paper"], rough=0.5),
        letters=lib.mat("Letters", "#FFFFFF", rough=0.5),
    )
    M["snacks"] = [lib.mat(f"Snack{i}", c, rough=0.45) for i, c in enumerate(SNACK_COLOURS)]
    return M


WIN_X, WIN_W, WIN_Z0, WIN_Z1 = -0.1, 0.6, 0.55, 1.6


def body(M):
    lib.rbox("VM_Body", (W, D, H - 0.06), (0, 0, 0.06 + (H - 0.06) / 2), M["body"], r=0.07,
             seg=3)
    lib.rbox("VM_Plinth", (W - 0.08, D - 0.08, 0.07), (0, 0, 0.035), M["keypad"], r=0.02,
             seg=1)
    lib.rbox("VM_Header", (W - 0.1, 0.03, 0.16), (0, -D / 2 - 0.005, H - 0.14), M["trim"],
             r=0.03, seg=2)
    lib.text("VM_Title", "SNACKS", 0.09, (0, -D / 2 - 0.022, H - 0.14), M["body"],
             extrude=0.004, bevel=0, res=2)


def window(M):
    y = -D / 2
    cx, cz = WIN_X, (WIN_Z0 + WIN_Z1) / 2
    h = WIN_Z1 - WIN_Z0
    lib.rbox("VM_Inside", (WIN_W, 0.03, h), (cx, y + 0.02, cz), M["inside"], r=0.01, seg=1)
    t = 0.05
    for i, (sx, sz, ww, hh) in enumerate(((0, h / 2 + t / 2, WIN_W + 2 * t, t),
                                           (0, -h / 2 - t / 2, WIN_W + 2 * t, t),
                                           (-WIN_W / 2 - t / 2, 0, t, h),
                                           (WIN_W / 2 + t / 2, 0, t, h))):
        lib.rbox(f"VM_Frame{i}", (ww, 0.05, hh), (cx + sx, y - 0.01, cz + sz), M["trim"],
                 r=0.02, seg=2)
    for i, (dx, dz, length) in enumerate(((-0.12, 0.2, 0.5), (0.05, 0.05, 0.3))):
        lib.rbox(f"VM_Glare{i}", (0.025, 0.004, length), (cx + dx, y - 0.03, cz + dz),
                 M["glare"], r=0.0018, seg=1, rot=(0, math.radians(-28), 0))


def snacks(M):
    rnd = random.Random(3)
    y = -D / 2 + 0.0
    rows = 4
    for r in range(rows):
        z = WIN_Z0 + 0.04 + r * (WIN_Z1 - WIN_Z0) / rows
        lib.rbox(f"VM_ShelfLip{r}", (WIN_W - 0.02, 0.03, 0.015), (WIN_X, y - 0.005, z),
                 M["shelf"], r=0.006, seg=1)
        for c in range(5):
            x = WIN_X - WIN_W / 2 + 0.07 + c * 0.115
            mat = M["snacks"][rnd.randrange(len(M["snacks"]))]
            if (r + c) % 3 == 0:
                lib.cyl(f"VM_Can{r}_{c}", 0.032, 0.12, (x, y + 0.0, z + 0.07), mat, r=0.008,
                        seg=1, verts=12)
            else:
                lib.rbox(f"VM_Bag{r}_{c}", (0.085, 0.03, 0.15), (x, y + 0.0, z + 0.085), mat,
                         r=0.014, seg=1)


def controls(M):
    x = 0.34
    y = -D / 2 - 0.01
    lib.rbox("VM_KeyPanel", (0.16, 0.03, 0.5), (x, y, 1.12), M["keypad"], r=0.025, seg=2)
    for r in range(4):
        for c in range(3):
            lib.rbox(f"VM_Key{r}_{c}", (0.034, 0.016, 0.034),
                     (x - 0.045 + c * 0.045, y - 0.02, 1.27 - r * 0.05), M["key"], r=0.008,
                     seg=1)
    lib.rbox("VM_Coin", (0.012, 0.012, 0.06), (x, y - 0.02, 0.98), M["inside"], r=0.004, seg=1)
    lib.rbox("VM_Pickup", (0.6, 0.04, 0.2), (WIN_X, -D / 2 - 0.005, 0.28), M["keypad"],
             r=0.03, seg=2)
    lib.rbox("VM_Flap", (0.52, 0.02, 0.12), (WIN_X, -D / 2 - 0.028, 0.29), M["inside"],
             r=0.02, seg=1)


STEPS = [body, window, snacks, controls]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
