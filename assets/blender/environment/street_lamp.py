"""Street lamp: a chunky stepped base, a tapered slate post with sunny collar rings and a big
glowing globe under a domed cap with a ball finial. 3.2 m tall. The globe is emissive
(`LampGlow`); put a warm PointLight at the `light` anchor. Origin at the ground centre."""
import lib
from environment import _env

NAME = "street_lamp"
AO_RES = 512
AO_DISTANCE = 0.3

GLOBE_Z = 2.92
GLOBE_R = 0.24


def materials():
    return dict(
        post=lib.mat("Post", _env.P["doorFrame"], rough=0.5),
        ring=lib.mat("Ring", "#FFC94A", rough=0.5),
        glow=_env.glow("LampGlow", "#FFE7A8", strength=2.0),
    )


def post(M):
    base = [(0.0, 0.0), (0.24, 0.0), (0.25, 0.03), (0.24, 0.1), (0.2, 0.12), (0.17, 0.16),
            (0.17, 0.26), (0.13, 0.3), (0.1, 0.36), (0.0, 0.36)]
    lib.lathe("Base", base, material=M["post"], verts=28)
    _env.tube("Post", (0, 0, 0.3), (0, 0, GLOBE_Z - GLOBE_R - 0.08), 0.07, 0.055, M["post"],
              verts=16, round_ends=False)
    for i, z in enumerate((0.42, 1.3, GLOBE_Z - GLOBE_R - 0.2)):
        lib.torus(f"Collar{i}", 0.075 - i * 0.006, 0.026, (0, 0, z), M["ring"], seg=24, ring=8)


def head(M):
    cup = [(0.0, -0.02), (0.07, -0.02), (0.11, 0.02), (0.16, 0.08), (0.17, 0.11), (0.14, 0.12),
           (0.0, 0.12)]
    lib.lathe("Cup", cup, loc=(0, 0, GLOBE_Z - GLOBE_R - 0.08), material=M["post"], verts=28)
    lib.sphere("Globe", GLOBE_R, (0, 0, GLOBE_Z), M["glow"], u=28, v=16)
    cap = [(0.0, 0.0), (0.2, 0.0), (0.25, 0.03), (0.24, 0.07), (0.17, 0.13), (0.08, 0.17),
           (0.0, 0.18)]
    lib.lathe("Cap", cap, loc=(0, 0, GLOBE_Z + GLOBE_R - 0.05), material=M["post"], verts=28)
    lib.sphere("Finial", 0.05, (0, 0, GLOBE_Z + GLOBE_R + 0.16), M["ring"], u=14, v=8)


def build():
    lib.begin(NAME)
    M = materials()
    post(M)
    head(M)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE)
