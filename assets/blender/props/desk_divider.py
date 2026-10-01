"""Desk divider: a soft, pillowy fabric privacy panel (`Accent`) in a rounded white frame,
standing on two clamp feet. Sits on the desk top between two facing desks; origin at the
centre of its base (desk surface)."""
import lib

NAME = "desk_divider"
AO_RES = 256
META = dict(
    name="Desk divider", category="furniture", priority="P0",
    description="Pillowy fabric privacy panel between facing desks",
    tags=["desk", "pod"], tintable=["Accent"], anchors_bl={},
)


def materials():
    return dict(
        fabric=lib.mat("Accent", lib.P["deskAccents"][2], rough=0.9),
        frame=lib.mat("Frame", lib.P["deskTop"], rough=0.6),
    )


def parts(M, at=(0, 0, 0)):
    x, y, z = at
    p = lib.rbox("Div_Panel", (1.30, 0.06, 0.40), (x, y, z + 0.25), M["fabric"], r=0.025, seg=2)
    lib.subsurf(p, 1)
    lib.rbox("Div_Cap", (1.40, 0.08, 0.045), (x, y, z + 0.465), M["frame"], r=0.022, seg=2)
    for s in (-1, 1):
        lib.rbox(f"Div_Post{s}", (0.05, 0.08, 0.46), (x + s * 0.675, y, z + 0.235), M["frame"],
                 r=0.022, seg=2)
        lib.rbox(f"Div_Foot{s}", (0.09, 0.22, 0.03), (x + s * 0.5, y, z + 0.015), M["frame"],
                 r=0.012, seg=2)
        lib.rbox(f"Div_Leg{s}", (0.04, 0.05, 0.06), (x + s * 0.5, y, z + 0.04), M["frame"],
                 r=0.015, seg=1)


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
