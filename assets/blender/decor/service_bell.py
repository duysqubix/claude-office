"""Service bell: reception "ding!" bell, a fat glossy gold dome on a cherry-red base with a
chrome plunger and round button. 0.136 m across, 0.075 m tall; origin at the
desk-contact centre."""
import lib
from decor import _decor as D

NAME = "service_bell"
AO_RES = 256
AO_DISTANCE = 0.03
META = dict(
    name="Service bell", category="desk-item", priority="P0",
    description="Chunky gold reception bell on a red base (hops and dings when someone is hired)",
    tags=["reception", "desk", "sound"], tintable=["Accent"],
    anchors_bl={"button": (0, 0, 0.075)},
)


def materials():
    return dict(
        base=D.mat("Accent", "red", rough=0.45),
        gold=D.mat("Gold", "gold", rough=0.25, metal=0.4),
        chrome=D.mat("Chrome", "chrome", rough=0.25, metal=0.4),
    )


def build():
    lib.begin(NAME)
    M = materials()
    # Flat-topped disc with a soft rolled edge (not a doughnut).
    D.lathe("Bell_Base", [(0.0, 0.0), (0.063, 0.0), (0.0668, 0.0022), (0.0682, 0.0065),
                          (0.0673, 0.0105), (0.0645, 0.0128), (0.06, 0.0136), (0.0, 0.0138)],
            M["base"], verts=40, sharp=70)
    D.lathe("Bell_Dome", [(0.0, 0.0134), (0.0465, 0.0134), (0.0485, 0.0175), (0.0475, 0.0235),
                          (0.044, 0.031), (0.038, 0.0395), (0.029, 0.0465), (0.017, 0.0515),
                          (0.006, 0.0535), (0.0, 0.0538)], M["gold"], verts=40)
    lib.cyl("Bell_Stem", 0.0042, 0.016, (0, 0, 0.0605), M["chrome"], r=0.001, seg=1, verts=14)
    D.lathe("Bell_Button", [(0.0, 0.066), (0.0102, 0.0662), (0.0119, 0.0688),
                            (0.0112, 0.0735), (0.0068, 0.0764), (0.0, 0.077)], M["chrome"],
            verts=32)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
