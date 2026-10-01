"""Smartphone: a chunky phone lying face up in a tintable `Accent` case, dark glass front,
emissive `Screen` (planar 0..1 UVs: u along +X, v towards the phone's top) with a little
camera pill, and side buttons. 0.076 × 0.152 × 0.012 m; origin at the desk-contact centre;
the phone's top points away from the user (+Y Blender, -Z three.js)."""
import lib
from decor import _decor as D

NAME = "smartphone"
AO_RES = 256
AO_DISTANCE = 0.02
PW, PL, PT = 0.076, 0.152, 0.012
SW, SL = 0.064, 0.136
META = dict(
    name="Smartphone", category="desk-item", priority="P1",
    description="Chunky smartphone lying face up in a colourful case; Screen for game content",
    tags=["desk", "phone", "screen", "gadget"], tintable=["Accent", "Screen"],
    anchors_bl={"screenCenter": (0, 0, PT + 0.0008)},
    screen=dict(width=SW, height=SL, facing="up (+Y three.js); top edge towards -Z three.js"),
)


def materials():
    return dict(
        case=D.mat("Accent", "pink", rough=0.55),
        glass=D.mat("Glass", "#1B2330", rough=0.3),
        screen=lib.mat("Screen", lib.P["screenOff"], rough=0.4, emit=lib.P["screenGlow"]),
    )


def build():
    lib.begin(NAME)
    M = materials()
    D.prism("Case", D.rrect_pts(PW, PL, 0.014, steps=5), PT, M["case"], r=0.0045, seg=2,
            angle=30)
    D.face("Glass", D.rrect_pts(PW - 0.006, PL - 0.006, 0.011, steps=5), M["glass"],
           loc=(0, 0, PT + 0.0003))
    D.face("Screen", D.rrect_pts(SW, SL, 0.008, steps=4), M["screen"], loc=(0, 0, PT + 0.0006))
    D.face("Pill", D.rrect_pts(0.017, 0.0048, 0.0024, steps=3), M["glass"],
           loc=(0, SL / 2 - 0.007, PT + 0.0009))
    for name, x, y, ln in (("Power", PW / 2, 0.025, 0.022), ("VolUp", -PW / 2, 0.03, 0.014),
                           ("VolDown", -PW / 2, 0.012, 0.014)):
        lib.rbox(f"Btn_{name}", (0.004, ln, 0.005), (x, y, PT / 2), M["case"], r=0.0018, seg=1)


def sample_screen():
    """Preview only: a home screen of app icons and the time."""
    z = PT + 0.0009
    cols = ["#FF7A6B", "#FFC94A", "#6EDC9A", "#5CC8FF", "#B48CFF", "#FF9DCB", "#FF9F45",
            "#2EC4B6", "#3D7CFF", "#9B5DE5"]
    D.text("_Pv_Time", "9:41", 0.011, D.mat("_PvWhite", "paper"), loc=(0, 0.052, z), rot=(0, 0, 0),
           depth=0, res=2)
    k = 0
    for row in range(4):
        for col in range(4):
            x = (col - 1.5) * 0.0145
            y = 0.03 - row * 0.016
            D.face(f"_Pv_App{row}{col}", D.rrect_pts(0.0105, 0.0105, 0.003, steps=2),
                   D.mat(f"_PvApp{k % len(cols)}", cols[k % len(cols)], rough=0.5), loc=(x, y, z))
            k += 1
    D.face("_Pv_Dock", D.rrect_pts(0.058, 0.016, 0.006, steps=3), D.mat("_PvDock", "#3A4A66"),
           loc=(0, -0.052, z - 0.0001))


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META, planar=("Screen",),
                      preview=sample_screen)
