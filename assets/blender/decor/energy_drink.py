"""Energy drink: a chunky can, tintable `Accent` (electric purple by default) printed with a
fat yellow lightning bolt and "MAX TOKENS", with a chrome lid, ring pull and drinking slot.
0.12 m tall; origin at the desk-contact centre; the print faces -Y."""
import lib
from decor import _decor as D
from decor import _food as F

NAME = "energy_drink"
AO_RES = 256
AO_DISTANCE = 0.03
R = 0.034
TOP = 0.1185  # lid surface (the rim stands a little proud of it)
META = dict(
    name="Energy drink", category="food", priority="P1",
    description="Chunky \"MAX TOKENS\" energy drink can with a big lightning bolt",
    tags=["drink", "desk", "energy", "clutter"], tintable=["Accent"],
    anchors_bl={"top": (0, 0, 0.1212), "sip": (0, -0.014, TOP)},
)
# (radius, z): domed chrome bottom, straight wall, shoulder, neck, rolled rim, sunken lid.
PROFILE = [(0.0, 0.003), (0.022, 0.0), (0.0275, 0.0025), (0.0315, 0.008), (R, 0.0155),
           (R, 0.104), (0.0315, 0.1115), (0.0288, 0.1155), (0.0286, 0.1178), (0.0296, 0.1195),
           (0.0288, 0.1212), (0.027, 0.1205), (0.0262, 0.1188), (0.0, TOP)]
BOLT = [(-0.004, 0.03), (0.012, 0.03), (0.003, 0.006), (0.013, 0.006), (-0.008, -0.03),
        (-0.002, -0.004), (-0.012, -0.004)]


def materials():
    return dict(
        can=D.mat("Accent", "purple", rough=0.35),
        metal=D.mat("Chrome", "chrome", rough=0.3, metal=0.4),
        bolt=D.mat("Bolt", "yellow", rough=0.4),
        print=D.mat("Print", "paper", rough=0.45),
        slot=D.mat("Slot", "ink", rough=0.5),
    )


def can(M):
    body = D.lathe("Can", PROFILE, M["metal"], verts=36, sharp=60)
    D.paint(body, M["can"], lambda c, n: 0.0145 < c.z < 0.112 and abs(n.z) < 0.9)


def prints(M):
    r = R + 0.0005
    bolt = D.face("Print_Bolt", D.rounded_pts(BOLT, 0.0016, steps=2), M["bolt"],
                  loc=(0, -r, 0.073), rot=D.FRONT)
    F.wrap_decal(bolt, r, 0.073)
    for word, size, z in (("MAX", 0.0175, 0.035), ("TOKENS", 0.0088, 0.0205)):
        t = D.text(f"Print_{word}", word, size, M["print"], loc=(0, -r, z), depth=0, res=2)
        F.wrap_decal(t, r, z, max_edge=0.0025)


def lid(M):
    z = TOP + 0.0003
    D.face("Lid_Slot", D.rrect_pts(0.0135, 0.0075, 0.0035, steps=3), M["slot"],
           loc=(0, -0.0145, z))
    D.band("Lid_Tab", D.rrect_pts(0.0175, 0.0215, 0.0065, steps=3),
           D.rrect_pts(0.008, 0.0085, 0.003, steps=3), M["metal"], loc=(0, 0.003, z + 0.0006))
    lib.cyl("Lid_Rivet", 0.0022, 0.0012, (0, -0.0042, z + 0.0008), M["metal"], r=0.0005, seg=1,
            verts=10)


def build():
    lib.begin(NAME)
    M = materials()
    can(M)
    prints(M)
    lid(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
