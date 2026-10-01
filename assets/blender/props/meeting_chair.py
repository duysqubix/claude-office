"""Meeting chair: chunky moulded shell chair. Puffy seat pad and rounded back in `Seat`, on
four fat splayed chrome legs. Front faces -Y; origin at the floor centre."""
import math

import lib

NAME = "meeting_chair"
AO_RES = 256
META = dict(
    name="Meeting chair", category="furniture", priority="P1",
    description="Chunky moulded shell chair on four splayed legs",
    tags=["seating", "meeting-room"], tintable=["Seat"],
    anchors_bl={"seat": (0, -0.02, 0.48)},
)


def materials():
    return dict(
        seat=lib.mat("Seat", lib.P["chairs"][2], rough=0.6),
        legs=lib.mat("Chrome", lib.P["metal"], rough=0.3, metal=0.4),
    )


def parts(M):
    s = lib.rbox("MC_Seat", (0.48, 0.46, 0.09), (0, 0, 0.44), M["seat"], r=0.04, seg=1)
    lib.subsurf(s, 1)
    b = lib.rbox("MC_Back", (0.46, 0.08, 0.36), (0, 0.24, 0.7), M["seat"], r=0.04, seg=1,
                 rot=(math.radians(-10), 0, 0))
    lib.subsurf(b, 1)
    lib.rbox("MC_Spine", (0.12, 0.05, 0.16), (0, 0.22, 0.5), M["seat"], r=0.02, seg=1,
             rot=(math.radians(-10), 0, 0))
    for sx in (-1, 1):
        for sy in (-1, 1):
            lib.cyl(f"MC_Leg{sx}{sy}", 0.022, 0.44, (sx * 0.18, sy * 0.16, 0.2), M["legs"],
                    radius2=0.018, r=0.008, seg=1, verts=12,
                    rot=(sy * math.radians(8), -sx * math.radians(8), 0))


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
