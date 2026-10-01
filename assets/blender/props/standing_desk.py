"""Standing desk: white rounded top at standing height on two chunky two-stage telescopic
legs (`Accent` lower stage) with T-feet, plus a little up/down control pad. Front faces -Y;
origin at the floor centre."""
import lib

NAME = "standing_desk"
AO_RES = 512
TOP = 1.05
META = dict(
    name="Standing desk", category="furniture", priority="P1",
    description="Standing desk on chunky telescopic legs",
    tags=["desk", "workstation"], tintable=["Accent"],
    anchors_bl={"top": (0, 0, TOP), "monitor": (0, 0.12, TOP), "keyboard": (0, -0.18, TOP),
                "stand": (0, -0.6, 0)},
)


def materials():
    return dict(
        top=lib.mat("DeskTop", lib.P["deskTop"], rough=0.6),
        accent=lib.mat("Accent", lib.P["deskAccents"][3], rough=0.55),
        upper=lib.mat("Upper", lib.P["metal"], rough=0.35, metal=0.3),
        dark=lib.mat("Dark", lib.P["chairBase"], rough=0.6),
    )


def parts(M):
    lib.rbox("SD_Top", (1.4, 0.72, 0.06), (0, 0, TOP - 0.03), M["top"], r=0.028, seg=3)
    lib.rbox("SD_Beam", (1.1, 0.08, 0.06), (0, 0.05, TOP - 0.09), M["dark"], r=0.02, seg=1)
    for s in (-1, 1):
        x = s * 0.56
        lib.rbox(f"SD_Lower{s}", (0.1, 0.1, 0.5), (x, 0.05, 0.3), M["accent"], r=0.035, seg=2)
        lib.rbox(f"SD_Upper{s}", (0.075, 0.075, 0.48), (x, 0.05, 0.75), M["upper"], r=0.025,
                 seg=2)
        lib.rbox(f"SD_Foot{s}", (0.09, 0.66, 0.05), (x, 0.0, 0.03), M["accent"], r=0.022,
                 seg=2)
        lib.rbox(f"SD_Bracket{s}", (0.12, 0.6, 0.03), (x, 0.0, TOP - 0.075), M["dark"],
                 r=0.012, seg=1)
    lib.rbox("SD_Pad", (0.12, 0.05, 0.025), (0.5, -0.36, TOP - 0.075), M["dark"], r=0.01,
             seg=1)
    for i, x in enumerate((0.47, 0.53)):
        lib.sphere(f"SD_Btn{i}", 0.011, (x, -0.385, TOP - 0.075), M["accent"], u=8, v=4)


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
