"""Glass partition: a 2 m wall module of frosted glass (see-through `Glass`, alpha blended) in a
chunky rounded white frame with an `Accent` kick rail and a frosted privacy band at eye
level. Tiles along X; origin at the floor centre of the module."""
import lib

NAME = "glass_partition"
AO_RES = 256
L, H, T = 2.0, 2.3, 0.08
META = dict(
    name="Glass partition", category="building", priority="P0",
    description="Frosted glass wall module (2 m) with a chunky frame; tiles along its length",
    tags=["team-room", "wall", "glass"], tintable=["Accent"],
    anchors_bl={}, module=dict(length=L, height=H, axis="x"),
)


def materials():
    return dict(
        frame=lib.mat("Frame", lib.P["deskTop"], rough=0.5),
        accent=lib.mat("Accent", lib.P["wallAccent"] if "wallAccent" in lib.P else "#8FE0C8",
                       rough=0.55),
        glass=lib.mat("Glass", "#DFF3FF", rough=0.15, alpha=0.38),
        band=lib.mat("FrostBand", "#FFFFFF", rough=0.6, alpha=0.8),
    )


def frame(M):
    p = 0.07
    for s in (-1, 1):
        lib.rbox(f"GP_Post{s}", (p, T, H), (s * (L / 2 - p / 2), 0, H / 2), M["frame"], r=0.03,
                 seg=2)
    lib.rbox("GP_Top", (L, T, p), (0, 0, H - p / 2), M["frame"], r=0.03, seg=2)
    lib.rbox("GP_Kick", (L - 0.02, T + 0.01, 0.14), (0, 0, 0.07), M["accent"], r=0.03, seg=2)


def glass(M):
    gh = H - 0.14 - 0.07
    lib.rbox("GP_Glass", (L - 0.14, 0.02, gh), (0, 0, 0.14 + gh / 2), M["glass"], r=0.006,
             seg=1)
    lib.rbox("GP_Band", (L - 0.14, 0.024, 0.18), (0, 0, 1.25), M["band"], r=0.006, seg=1)


STEPS = [frame, glass]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
