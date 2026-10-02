"""Lava lamp: the classic rocket silhouette. Tintable `Accent` base and cap, a translucent
glowing magenta bottle (glTF alpha BLEND) with plump emissive orange wax blobs inside: a
pool at the bottom, one rising, one floating near the top. 0.34 m tall; origin at the
desk-contact centre."""
import lib
from decor import _decor as D

NAME = "lava_lamp"
AO_RES = 256
AO_DISTANCE = 0.05
META = dict(
    name="Lava lamp", category="decor", priority="P1",
    description="Groovy lava lamp: translucent glowing bottle with emissive orange wax blobs",
    tags=["desk", "lamp", "glow", "retro"], tintable=["Accent"],
    anchors_bl={"glow": (0, 0, 0.2)},
    transparent=["Glass"],
)
GLASS = [(0.0, 0.112), (0.034, 0.112), (0.04, 0.13), (0.0455, 0.165), (0.046, 0.185),
         (0.042, 0.22), (0.034, 0.26), (0.026, 0.29), (0.0235, 0.298), (0.0, 0.298)]


def materials():
    return dict(
        shell=D.mat("Accent", "purple", rough=0.35, metal=0.15),
        glass=lib.mat("Glass", "#E9A6FF", rough=0.12, emit="#C96BFF", strength=0.55, alpha=0.42),
        wax=lib.mat("Wax", "#FF8A3D", rough=0.4, emit="#FF7A2E", strength=1.6),
        trim=D.mat("Trim", "gold", rough=0.3, metal=0.35),
    )


def build():
    lib.begin(NAME)
    M = materials()
    D.lathe("Base", [(0.0, 0.0), (0.062, 0.0), (0.0655, 0.004), (0.064, 0.012),
                     (0.0395, 0.104), (0.0365, 0.112), (0.0, 0.112)], M["shell"], verts=32,
            sharp=50)
    lib.torus("Base_Trim", 0.0368, 0.0035, (0, 0, 0.111), M["trim"], seg=28, ring=6)
    D.lathe("Glass", GLASS, M["glass"], verts=32)
    D.lathe("Cap", [(0.0, 0.296), (0.025, 0.296), (0.0255, 0.302), (0.0175, 0.336),
                    (0.015, 0.34), (0.0, 0.341)], M["shell"], verts=28, sharp=50)
    # Wax: a pool on the bottom, a blob pulling away from it, one rising, one near the top.
    lib.sphere("Wax_Pool", 0.03, (0, 0, 0.122), M["wax"], scale=(1.18, 1.18, 0.5), u=20, v=10)
    lib.sphere("Wax_Neck", 0.014, (0.004, 0.0, 0.142), M["wax"], scale=(1, 1, 1.4), u=14, v=8)
    lib.sphere("Wax_Rise", 0.0175, (-0.008, 0.004, 0.19), M["wax"], scale=(1.0, 1.0, 1.25),
               u=16, v=10)
    lib.sphere("Wax_Top", 0.0135, (0.006, -0.003, 0.245), M["wax"], scale=(1.05, 1.0, 0.9),
               u=14, v=8)
    lib.sphere("Wax_Drop", 0.007, (-0.006, 0.004, 0.272), M["wax"], u=10, v=6)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
