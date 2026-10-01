"""Gift box: a chunky wrapped present in `Accent` paper with a ribbon cross and a big puffy
bow. The lid (with the bow) is its own node `Lid`, pivot at the lid's centre, so the game can
pop it off. Origin at the bottom centre."""
import math

import lib

NAME = "gift_box"
AO_RES = 256
S, H = 0.3, 0.24
META = dict(
    name="Gift box", category="decor", priority="P2", artist="Claude Monet",
    description="Wrapped present with a big bow and a pop-off lid (node Lid)",
    tags=["party", "event", "reward", "shop"], tintable=["Accent"],
    anchors_bl={"lidTop": (0, 0, H + 0.1)},
    nodes={"Lid": "pivot at the lid centre; lift / tumble it to open"},
)


def materials():
    return dict(
        wrap=lib.mat("Accent", "#4D96FF", rough=0.45),
        ribbon=lib.mat("Ribbon", "#FFD93D", rough=0.35),
    )


def parts(M):
    lib.rbox("GB_Box", (S, S, H - 0.04), (0, 0, (H - 0.04) / 2), M["wrap"], r=0.02, seg=2)
    for k in range(2):
        lib.rbox(f"GB_Band{k}", (S + 0.006 if k == 0 else 0.05, 0.05 if k == 0 else S + 0.006,
                 H - 0.04), (0, 0, (H - 0.04) / 2), M["ribbon"], r=0.01, seg=1)
    zl = H - 0.02
    lid = [lib.rbox("GB_Lid", (S + 0.02, S + 0.02, 0.06), (0, 0, zl), M["wrap"], r=0.022, seg=2)]
    for k in range(2):
        lid.append(lib.rbox(f"GB_LidBand{k}", (S + 0.026 if k == 0 else 0.052,
                            0.052 if k == 0 else S + 0.026, 0.064), (0, 0, zl), M["ribbon"],
                            r=0.012, seg=1))
    for s in (-1, 1):
        loop = lib.torus(f"GB_Loop{s}", 0.055, 0.02, (s * 0.05, 0, zl + 0.075), M["ribbon"],
                         seg=16, ring=8, rot=(math.pi / 2, s * 0.5, 0))
        loop.scale = (1.0, 1.0, 0.75)
        lid.append(loop)
        lid.append(lib.rbox(f"GB_Tail{s}", (0.04, 0.012, 0.09), (s * 0.04, -0.04, zl + 0.0),
                            M["ribbon"], r=0.005, seg=1, rot=(0.3, 0, s * 0.4)))
    lid.append(lib.sphere("GB_Knot", 0.03, (0, 0, zl + 0.05), M["ribbon"], u=12, v=6))
    for p in lid:
        lib.node(p, "Lid", pivot=(0, 0, zl))


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
