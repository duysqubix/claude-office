"""Floor lamp: chunky round base, a slim pole with a fat collar, and a big soft drum shade
in a warm emissive `Shade` material. Origin at the floor centre."""
import lib

NAME = "floor_lamp"
AO_RES = 256
H = 1.62
META = dict(
    name="Floor lamp", category="furniture", priority="P1",
    description="Floor lamp with a warm glowing drum shade",
    tags=["lighting", "lounge"], tintable=[], anchors_bl={"light": (0, 0, H - 0.15)},
)


def materials():
    return dict(
        metal=lib.mat("Metal", lib.P["ink"], rough=0.45),
        shade=lib.mat("Shade", "#FFE7A8", rough=0.7, emit="#FFD98A", strength=1.4),
        brass=lib.mat("Brass", "#F2C14E", rough=0.35, metal=0.4),
    )


def parts(M):
    lib.cyl("FL_Base", 0.19, 0.05, (0, 0, 0.025), M["metal"], r=0.02, seg=2, verts=28)
    lib.cyl("FL_Pole", 0.018, H - 0.3, (0, 0, (H - 0.3) / 2 + 0.05), M["metal"], r=0, verts=12)
    lib.cyl("FL_Collar", 0.03, 0.05, (0, 0, 0.75), M["brass"], r=0.012, seg=1, verts=14)
    lib.cyl("FL_Socket", 0.035, 0.06, (0, 0, H - 0.27), M["brass"], r=0.01, seg=1, verts=14)
    prof = [(0.0, H - 0.3), (0.215, H - 0.3), (0.235, H - 0.29), (0.2, H - 0.02),
            (0.18, H), (0.0, H)]
    lib.lathe("FL_Shade", prof, material=M["shade"], verts=32)


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
