"""Jukebox: a classic arched jukebox. Cherry-wood body with a rounded arch top, a cream face,
glowing bubble tubes in the emissive `Accent` (arch + side pillars, the game can pulse them),
a glass record window with a spinning-ready vinyl, a row of selection buttons, a chrome
speaker grille and a crown. Front faces -Y; origin at the floor centre."""
import math

import lib

NAME = "jukebox"
AO_RES = 512
W, D, RECT_H = 0.8, 0.5, 1.15
R = W / 2
META = dict(
    name="Jukebox", category="appliance", priority="P1",
    description="Glowing arched jukebox with a record window",
    tags=["game-room", "lounge", "music", "fun"], tintable=["Accent"],
    anchors_bl={"front": (0, -0.6, 0), "record": (0, -D / 2 - 0.03, 1.05)},
)


def outline(w, rect_h, segs=16):
    r = w / 2
    pts = [(-r, 0.0), (r, 0.0), (r, rect_h)]
    for i in range(1, segs):
        a = math.pi * i / segs
        pts.append((r * math.cos(a), rect_h + r * math.sin(a)))
    pts.append((-r, rect_h))
    return pts


def materials():
    return dict(
        wood=lib.mat("Wood", "#B5532E", rough=0.5),
        face=lib.mat("Face", "#FFF3DE", rough=0.5),
        glow=lib.mat("Accent", "#FF7EB6", rough=0.3, emit="#FF7EB6", strength=2.2),
        glow2=lib.mat("GlowGold", "#FFD93D", rough=0.3, emit="#FFD93D", strength=1.8),
        chrome=lib.mat("Chrome", lib.P["metal"], rough=0.22, metal=0.5),
        grille=lib.mat("Grille", "#2B2D42", rough=0.7),
        glass=lib.mat("Glass", "#E6F7FF", rough=0.05, alpha=0.25),
        vinyl=lib.mat("Vinyl", "#1B1B24", rough=0.3),
        label=lib.mat("RecordLabel", "#FF5A5F", rough=0.5),
        btns=[lib.mat(f"Btn{i}", c, rough=0.4) for i, c in
              enumerate(("#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#B983FF"))],
    )


def body(M):
    up = (math.pi / 2, 0, 0)            # outline (x, height) stands up; extrudes along -Y
    lib.slab("JB_Body", outline(W, RECT_H), -D / 2, D / 2, (0, 0, 0), M["wood"], r=0.04, seg=3,
             rot=up)
    lib.slab("JB_Face", outline(W - 0.16, RECT_H - 0.02), 0.0, 0.03, (0, -D / 2 + 0.005, 0.06),
             M["face"], r=0.012, seg=2, rot=up)
    lib.rbox("JB_Plinth", (W + 0.04, D + 0.04, 0.08), (0, 0, 0.04), M["chrome"], r=0.025, seg=2)


def glow(M):
    y = -D / 2 - 0.035
    lib.torus("JB_Arch", R - 0.04, 0.03, (0, y, RECT_H), M["glow"], seg=24, ring=10,
              sweep=math.pi, rot=(math.pi / 2, 0, 0))
    for s in (-1, 1):
        lib.cyl(f"JB_Pillar{s}", 0.03, RECT_H - 0.12, (s * (R - 0.04), y, (RECT_H - 0.12) / 2 + 0.12),
                M["glow"], r=0, verts=12)
    lib.torus("JB_InnerArch", R - 0.14, 0.018, (0, y + 0.01, RECT_H), M["glow2"], seg=20,
              ring=8, sweep=math.pi, rot=(math.pi / 2, 0, 0))
    lib.sphere("JB_Crown", 0.06, (0, 0, RECT_H + R + 0.02), M["chrome"], scale=(1.4, 1, 0.8),
               u=14, v=7)


def front(M):
    y = -D / 2 - 0.03
    lib.cyl("JB_Window", 0.17, 0.02, (0, y, 1.08), M["glass"], r=0.006, seg=1, verts=28,
            rot=(math.pi / 2, 0, 0))
    lib.cyl("JB_Vinyl", 0.13, 0.008, (0, y + 0.02, 1.08), M["vinyl"], r=0.002, seg=1, verts=28,
            rot=(math.pi / 2, 0, 0))
    lib.cyl("JB_Label", 0.045, 0.01, (0, y + 0.015, 1.08), M["label"], r=0, verts=16,
            rot=(math.pi / 2, 0, 0))
    for i in range(5):
        lib.rbox(f"JB_Btn{i}", (0.07, 0.03, 0.04), ((i - 2) * 0.085, y - 0.005, 0.8),
                 M["btns"][i], r=0.012, seg=1)
    lib.rbox("JB_GrilleBack", (0.5, 0.02, 0.4), (0, y + 0.005, 0.4), M["grille"], r=0.03, seg=2)
    for i in range(6):
        lib.cyl(f"JB_Bar{i}", 0.012, 0.36, ((i - 2.5) * 0.08, y - 0.01, 0.4), M["chrome"], r=0,
                verts=8)


STEPS = [body, glow, front]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
