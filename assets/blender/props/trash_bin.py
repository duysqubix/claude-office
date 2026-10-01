"""Trash bin: soft tapered office bin with a fat rolled rim and a crumpled paper ball peeking
out. Origin at the floor centre."""
import lib

NAME = "trash_bin"
AO_RES = 256
META = dict(
    name="Trash bin", category="furniture", priority="P1",
    description="Chunky office waste bin with a crumpled paper ball",
    tags=["office", "clutter"], tintable=["Accent"], anchors_bl={"mouth": (0, 0, 0.36)},
)


def materials():
    return dict(
        bin=lib.mat("Accent", "#6B7A8F", rough=0.6),
        inner=lib.mat("Inner", "#3B4252", rough=0.8),
        paper=lib.mat("Paper", "#FFFFFF", rough=0.85),
    )


def parts(M):
    prof = [(0.0, 0.0), (0.12, 0.0), (0.13, 0.01), (0.155, 0.32), (0.155, 0.33), (0.145, 0.33),
            (0.13, 0.06), (0.0, 0.06)]
    lib.lathe("TB_Body", prof, material=M["bin"], verts=28)
    lib.cyl("TB_Floor", 0.13, 0.01, (0, 0, 0.065), M["inner"], r=0, verts=28)
    lib.torus("TB_Rim", 0.152, 0.018, (0, 0, 0.335), M["bin"], seg=28, ring=8)
    lib.blob("TB_Paper", 0.05, (0.03, -0.02, 0.33), M["paper"], scale=(1, 0.9, 0.85))
    lib.blob("TB_Paper2", 0.04, (-0.05, 0.04, 0.3), M["paper"], scale=(1, 1, 0.9))


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
