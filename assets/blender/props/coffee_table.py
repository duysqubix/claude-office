"""Coffee table: chunky rounded honey-wood top on four fat tapered legs, with a lower shelf.
Origin at the floor centre."""
import lib

NAME = "coffee_table"
AO_RES = 256
TOP = 0.42
META = dict(
    name="Coffee table", category="furniture", priority="P1",
    description="Chunky low wooden coffee table with a lower shelf",
    tags=["lounge", "break-room", "table"], tintable=[],
    anchors_bl={"top": (0, 0, TOP)},
)


def materials():
    return dict(
        top=lib.mat("Wood", "#E8BE84", rough=0.55),
        legs=lib.mat("WoodDark", lib.P["wood"], rough=0.6),
    )


def parts(M):
    lib.rbox("CT_Top", (1.0, 0.56, 0.06), (0, 0, TOP - 0.03), M["top"], r=0.028, seg=3)
    lib.rbox("CT_Shelf", (0.82, 0.4, 0.035), (0, 0, 0.13), M["top"], r=0.016, seg=2)
    for s in (-1, 1):
        for t in (-1, 1):
            lib.cyl(f"CT_Leg{s}{t}", 0.04, TOP - 0.06, (s * 0.42, t * 0.2, (TOP - 0.06) / 2),
                    M["legs"], radius2=0.05, r=0.015, seg=2, verts=16)


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
