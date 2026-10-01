"""Coffee cup: takeaway paper cup with a domed lid (sip slot at the front) and a tintable
`Accent` sleeve (kraft by default) printed with a little heart. 0.118 m tall; origin at the
desk-contact centre."""
import lib
from decor import _decor as D

NAME = "coffee_cup"
AO_RES = 256
AO_DISTANCE = 0.035
META = dict(
    name="Coffee cup", category="food", priority="P0",
    description="Takeaway paper cup with a domed lid and a kraft sleeve printed with a heart",
    tags=["desk", "coffee", "drink"], tintable=["Accent"],
    anchors_bl={"lidTop": (0, 0, 0.118), "sip": (0, -0.0408, 0.118)},
)

R0, Z0, R1, Z1 = 0.0328, 0.005, 0.0418, 0.098  # straight tapered wall


def body_r(z):
    return R0 + (R1 - R0) * (z - Z0) / (Z1 - Z0)


def materials():
    return dict(
        cup=D.mat("Cup", "paper", rough=0.65),
        lid=D.mat("Lid", "white", rough=0.45),
        sleeve=D.mat("Accent", "kraft", rough=0.85),
        print=D.mat("Print", "coral", rough=0.6),
        slot=D.mat("Slot", "ink", rough=0.5),
    )


def cup(M):
    prof = [(0.0, 0.0), (0.029, 0.0), (0.0318, 0.0015), (R0, Z0), (R1, Z1), (0.0432, 0.0995),
            (0.0438, 0.1012), (0.043, 0.103), (0.0, 0.103)]
    lib.lathe("Cup_Body", prof, material=M["cup"], verts=32)


def lid(M):
    prof = [(0.0, 0.1), (0.043, 0.1), (0.0458, 0.1005), (0.0467, 0.103), (0.0467, 0.1075),
            (0.0459, 0.1102), (0.0446, 0.1118), (0.0438, 0.1158), (0.0418, 0.1178),
            (0.0392, 0.1172), (0.0372, 0.1148), (0.0352, 0.1128), (0.0, 0.1128)]
    lib.lathe("Lid_Body", prof, material=M["lid"], verts=32)
    D.prism("Lid_Slot", D.rrect_pts(0.012, 0.0038, 0.0018), 0.0005, M["slot"],
            loc=(0, -0.0408, 0.1176), back=False)


def sleeve(M):
    za, zb = 0.03, 0.074
    out = 0.0028
    prof = [(body_r(za - 0.002) - 0.001, za - 0.002), (body_r(za) + out * 0.6, za + 0.0004),
            (body_r(za + 0.002) + out, za + 0.0025), (body_r(zb - 0.002) + out, zb - 0.0025),
            (body_r(zb) + out * 0.6, zb - 0.0004), (body_r(zb + 0.002) - 0.001, zb + 0.002)]
    lib.lathe("Sleeve", prof, material=M["sleeve"], verts=32)
    z = (za + zb) / 2
    r = body_r(z) + out - 0.0002
    h = D.prism("Sleeve_Heart", D.heart_pts(0.017, 32), 0.0009, M["print"], loc=(0, -r, z),
                rot=D.FRONT, back=False)
    D.bake_xform(h)
    D.wrap_cylinder(h, lambda zz: body_r(zz) + out - 0.0002, base=r)


def build():
    lib.begin(NAME)
    M = materials()
    cup(M)
    lid(M)
    sleeve(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
