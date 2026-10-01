"""DJ booth: the party centrepiece. A chunky rounded console whose audience-facing front (-Y)
glows with a rainbow equalizer and a big "DJ" disc; on top, two turntables whose platters are
nodes `PlatterL` / `PlatterR` (pivot at the spindle, spin about the vertical axis) with
coloured vinyl labels and chrome tonearms, a mixer in the middle with colourful knobs, faders
and LED meters, two little monitor speakers and a pair of headphones. The DJ stands on the
+Y side. Origin at the floor centre."""
import math

import lib

NAME = "dj_booth"
AO_RES = 512
W, D, H = 1.7, 0.72, 0.98
TT_X, TT_Y = 0.48, 0.02
PLATTER_Z = H + 0.07
RAINBOW = ["#FF5A5F", "#FF9F45", "#FFD93D", "#6BCB77", "#00C2C7", "#4D96FF", "#B983FF",
           "#FF7EB6"]
META = dict(
    name="DJ booth", category="furniture", priority="P1",
    description="Glowing DJ booth with spinning turntables, mixer and headphones",
    tags=["game-room", "party", "music", "fun", "interactable"], tintable=["Accent"],
    anchors_bl={"dj": (0, 0.75, 0), "platterL": (-TT_X, TT_Y, PLATTER_Z),
                "platterR": (TT_X, TT_Y, PLATTER_Z), "mixer": (0, 0.02, H + 0.06),
                "crowd": (0, -1.4, 0)},
    nodes={"PlatterL": "spin about +Y (three) at ~33 rpm", "PlatterR": "spin about +Y (three)"},
)


def materials():
    M = dict(
        shell=lib.mat("Shell", "#2B2D42", rough=0.45),
        top=lib.mat("Deck", "#3B4252", rough=0.5),
        trim=lib.mat("Accent", "#FF7EB6", rough=0.3, emit="#FF7EB6", strength=1.8),
        disc=lib.mat("DJDisc", "#FFFFFF", rough=0.4, emit="#E9F7FF", strength=1.2),
        letters=lib.mat("DJLetters", "#2B2D42", rough=0.5),
        tt=lib.mat("Turntable", "#C8D0DC", rough=0.35, metal=0.3),
        rubber=lib.mat("Mat", "#22272F", rough=0.8),
        vinyl=lib.mat("Vinyl", "#15151C", rough=0.25),
        labelL=lib.mat("LabelL", "#FF5A5F", rough=0.5),
        labelR=lib.mat("LabelR", "#00C2C7", rough=0.5),
        chrome=lib.mat("Chrome", lib.P["metal"], rough=0.2, metal=0.5),
        mixer=lib.mat("Mixer", "#1E2230", rough=0.45),
        cups=lib.mat("Headphones", "#FFD93D", rough=0.45),
        cushion=lib.mat("EarPad", "#2B2D42", rough=0.8),
        cone=lib.mat("Woofer", "#4C566A", rough=0.5),
    )
    M["bars"] = [lib.mat(f"EQ{i}", c, rough=0.3, emit=c, strength=2.0)
                 for i, c in enumerate(RAINBOW)]
    return M


def console(M):
    lib.slab("DJ_Body", lib.rounded_rect(W, D, 0.16, 6), 0.0, H - 0.04, material=M["shell"],
             r=0.04, seg=3)
    lib.slab("DJ_Deck", lib.rounded_rect(W + 0.04, D + 0.04, 0.18, 6), H - 0.05, H,
             material=M["top"], r=0.025, seg=2)
    lib.slab("DJ_TrimTop", lib.rounded_rect(W + 0.05, D + 0.05, 0.185, 6), H - 0.075, H - 0.055,
             material=M["trim"], r=0.006, seg=1)
    lib.slab("DJ_TrimBot", lib.rounded_rect(W + 0.01, D + 0.01, 0.165, 6), 0.03, 0.05,
             material=M["trim"], r=0.006, seg=1)


def glow_front(M):
    y = -D / 2 - 0.006
    face_on = (math.pi / 2, 0, 0)
    lib.cyl("DJ_DiscRing", 0.2, 0.03, (0, y - 0.005, 0.5), M["trim"], r=0.01, seg=1, verts=24,
            rot=face_on)
    lib.cyl("DJ_Disc", 0.17, 0.03, (0, y - 0.012, 0.5), M["disc"], r=0.01, seg=1, verts=24,
            rot=face_on)
    lib.text("DJ_Letters", "DJ", 0.18, (0, y - 0.03, 0.5), M["letters"], extrude=0,
             bevel=0, res=2)
    # Rainbow equalizer bars either side of the disc.
    heights = [0.18, 0.32, 0.46, 0.38, 0.26, 0.42, 0.3, 0.2]
    for side in (-1, 1):
        for i, h in enumerate(heights):
            x = side * (0.3 + i * 0.065)
            if abs(x) > W / 2 - 0.12:
                continue
            mat = M["bars"][i % len(M["bars"])]
            lib.rbox(f"DJ_EQ{side}_{i}", (0.045, 0.02, h), (x, y - 0.004, 0.16 + h / 2), mat,
                     r=0.014, seg=1)


def turntable(M, side):
    tag = "L" if side < 0 else "R"
    x = side * TT_X
    lib.rbox(f"DJ_TT{tag}", (0.5, 0.46, 0.06), (x, TT_Y, H + 0.03), M["tt"], r=0.03, seg=2)
    node = f"Platter{tag}"
    c = (x, TT_Y, PLATTER_Z)
    parts = [
        lib.cyl(f"DJ_Platter{tag}", 0.17, 0.025, (x, TT_Y, PLATTER_Z - 0.005), M["chrome"],
                r=0.008, seg=1, verts=24),
        lib.cyl(f"DJ_Vinyl{tag}", 0.155, 0.008, (x, TT_Y, PLATTER_Z + 0.011), M["vinyl"],
                r=0.002, seg=1, verts=24),
        lib.cyl(f"DJ_Label{tag}", 0.052, 0.01, (x, TT_Y, PLATTER_Z + 0.013),
                M["labelL" if side < 0 else "labelR"], r=0, verts=20),
        lib.cyl(f"DJ_Spindle{tag}", 0.007, 0.03, (x, TT_Y, PLATTER_Z + 0.02), M["chrome"], r=0,
                verts=8),
        # A little sticker dot so the spin reads.
        lib.cyl(f"DJ_Dot{tag}", 0.012, 0.012, (x + 0.11, TT_Y, PLATTER_Z + 0.014),
                M["trim"], r=0, verts=10),
    ]
    for p in parts:
        lib.node(p, node, pivot=c)
    # Tonearm on the outer back corner, resting across the record.
    bx, by = x + side * 0.19, TT_Y + 0.16
    lib.cyl(f"DJ_ArmBase{tag}", 0.035, 0.04, (bx, by, H + 0.08), M["chrome"], r=0.01, seg=1,
            verts=14)
    a = math.atan2(TT_Y - 0.03 - by, x - side * 0.03 - bx)
    lib.rbox(f"DJ_Arm{tag}", (0.24, 0.016, 0.016), (bx + math.cos(a) * 0.12,
             by + math.sin(a) * 0.12, H + 0.1), M["chrome"], r=0.006, seg=1, rot=(0, 0, a))
    lib.rbox(f"DJ_Head{tag}", (0.04, 0.025, 0.02), (bx + math.cos(a) * 0.24,
             by + math.sin(a) * 0.24, H + 0.095), M["rubber"], r=0.006, seg=1, rot=(0, 0, a))
    lib.cyl(f"DJ_Weight{tag}", 0.022, 0.035, (bx - math.cos(a) * 0.05, by - math.sin(a) * 0.05,
            H + 0.1), M["rubber"], r=0.006, seg=1, verts=12, rot=(0, math.pi / 2, a))


def turntables(M):
    turntable(M, -1)
    turntable(M, 1)


def mixer(M):
    z = H + 0.03
    lib.rbox("DJ_Mixer", (0.3, 0.36, 0.06), (0, TT_Y, z), M["mixer"], r=0.025, seg=2)
    knob_cols = ["#FF5A5F", "#FFD93D", "#6BCB77", "#4D96FF", "#B983FF", "#FF9F45"]
    for i, col in enumerate(knob_cols):
        r_, c_ = divmod(i, 3)
        km = lib.mat(f"Knob{i}", col, rough=0.4)
        lib.cyl(f"DJ_Knob{i}", 0.016, 0.022, ((c_ - 1) * 0.08, TT_Y + 0.13 - r_ * 0.05, z + 0.04),
                km, r=0.006, seg=1, verts=12)
    for i in range(3):
        x = (i - 1) * 0.08
        lib.rbox(f"DJ_Slot{i}", (0.012, 0.11, 0.004), (x, TT_Y - 0.03, z + 0.031), M["rubber"],
                 r=0.002, seg=1)
        lib.rbox(f"DJ_Fader{i}", (0.03, 0.02, 0.022), (x, TT_Y - 0.03 + (i - 1) * 0.025,
                 z + 0.042), M["chrome"], r=0.007, seg=1)
    lib.rbox("DJ_XSlot", (0.16, 0.012, 0.004), (0, TT_Y - 0.14, z + 0.031), M["rubber"],
             r=0.002, seg=1)
    lib.rbox("DJ_XFader", (0.024, 0.032, 0.022), (0.03, TT_Y - 0.14, z + 0.042), M["trim"],
             r=0.007, seg=1)
    for side in (-1, 1):
        for k in range(5):
            lib.rbox(f"DJ_LED{side}_{k}", (0.012, 0.01, 0.006),
                     (side * 0.125, TT_Y + 0.1 - k * 0.022, z + 0.032),
                     M["bars"][3 if k < 3 else (2 if k == 3 else 0)], r=0.002, seg=1)


def extras(M):
    for side in (-1, 1):
        x = side * (W / 2 - 0.08)
        lib.rbox(f"DJ_Speaker{side}", (0.16, 0.16, 0.24), (x, TT_Y + 0.22, H + 0.12),
                 M["shell"], r=0.035, seg=1)
        lib.cyl(f"DJ_Woofer{side}", 0.05, 0.02, (x, TT_Y + 0.14 - 0.005, H + 0.1), M["cone"],
                r=0.008, seg=1, verts=16, rot=(math.pi / 2, 0, 0))
        lib.cyl(f"DJ_Tweeter{side}", 0.022, 0.02, (x, TT_Y + 0.14 - 0.005, H + 0.19),
                M["cone"], r=0.006, seg=1, verts=12, rot=(math.pi / 2, 0, 0))
    # Headphones resting on the deck, front-left.
    hx, hy, hz = -0.12, -0.24, H + 0.035
    lib.torus("DJ_Band", 0.09, 0.016, (hx, hy, hz), M["cups"], seg=16, ring=8,
              sweep=math.pi, rot=(0, 0, math.radians(20)))
    for s in (-1, 1):
        a = math.radians(20) + (0 if s > 0 else math.pi)
        cx, cy = hx + 0.09 * math.cos(a), hy + 0.09 * math.sin(a)
        lib.cyl(f"DJ_Cup{s}", 0.045, 0.035, (cx, cy, hz), M["cups"], r=0.014, seg=1, verts=16)
        lib.cyl(f"DJ_Pad{s}", 0.038, 0.02, (cx, cy, hz + 0.022), M["cushion"], r=0.008, seg=1,
                verts=16)


STEPS = [console, glow_front, turntables, mixer, extras]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
