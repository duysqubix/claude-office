"""Desk: thick rounded white top on fat slab legs, a coloured modesty panel and drawer pod
(`Accent`, tinted per desk), accent feet. Front (where you sit) faces -Y; origin at the floor
centre. Desk items sit on top at z = TOP."""
import lib

NAME = "desk"
AO_RES = 512
TOP = 0.75
META = dict(
    name="Desk", category="furniture", priority="P0",
    description="Modular rounded white desk with a tintable accent panel and drawer pod",
    tags=["desk", "workstation"], tintable=["Accent"],
    anchors_bl={"top": (0, 0, TOP), "monitor": (0, 0.12, TOP), "keyboard": (-0.06, -0.19, TOP),
                "mouse": (0.3, -0.17, TOP), "mug": (0.5, 0.06, TOP), "chair": (0, -0.7, 0)},
)


def materials():
    return dict(
        top=lib.mat("DeskTop", lib.P["deskTop"], rough=0.65),
        accent=lib.mat("Accent", lib.P["deskAccents"][2], rough=0.7),
        knob=lib.mat("Knob", lib.P["deskTop"], rough=0.5),
    )


def parts(M, at=(0, 0, 0)):
    x, y, z = at
    lib.rbox("Desk_Top", (1.40, 0.75, 0.07), (x, y, z + TOP - 0.035), M["top"], r=0.032, seg=3)
    for s in (-1, 1):
        lib.rbox(f'Desk_Leg{"L" if s < 0 else "R"}', (0.08, 0.66, 0.67),
                 (x + s * 0.6, y, z + 0.365), M["top"], r=0.035, seg=3)
    lib.rbox("Desk_AccentPanel", (1.14, 0.05, 0.40), (x, y + 0.27, z + 0.46), M["accent"],
             r=0.022, seg=3)
    lib.rbox("Desk_Drawers", (0.36, 0.58, 0.30), (x + 0.37, y, z + 0.53), M["accent"], r=0.03,
             seg=3)
    lib.rbox("Desk_DrawerSeam", (0.33, 0.012, 0.012), (x + 0.37, y - 0.293, z + 0.53),
             M["knob"], r=0.005, seg=1)
    for name, kz in (("Top", 0.61), ("Bot", 0.45)):
        lib.sphere(f"Desk_DrawerKnob{name}", 0.022, (x + 0.37, y - 0.29, z + kz), M["knob"],
                   scale=(1, 0.7, 1), u=12, v=6)
    for s in (-1, 1):
        for t in (-1, 1):
            lib.cyl(f"Desk_Foot{s}{t}", 0.05, 0.03, (x + s * 0.6, y + t * 0.28, z + 0.015),
                    M["accent"], r=0.012, seg=2, verts=16)


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
