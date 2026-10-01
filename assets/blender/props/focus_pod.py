"""Focus pod: a one-person phone booth. Rounded `Accent` shell (back, sides, roof, floor), a
felt-lined interior with a little shelf desk, a plump stool cushion and a glowing ceiling
light, and a glass front door as node `Door`, hinged on its left edge. Front faces -Y;
origin at the floor centre."""
import lib

NAME = "focus_pod"
AO_RES = 512
W, D, H = 1.1, 1.1, 2.25
T = 0.08
HINGE = (-W / 2 + T, -D / 2 + 0.02, 0)
META = dict(
    name="Focus pod", category="furniture", priority="P1",
    description="Phone booth for heads-down focus, with a swing-open glass door",
    tags=["team-room", "focus", "booth"], tintable=["Accent"],
    anchors_bl={"inside": (0, 0.05, 0), "front": (0, -0.85, 0)},
    nodes={"Door": "pivot on the hinge (left edge); rotate about +Y (three) to open"},
)


def materials():
    return dict(
        shell=lib.mat("Accent", lib.P["deskAccents"][4], rough=0.5),
        felt=lib.mat("Felt", "#4B3F72", rough=0.95),
        top=lib.mat("Shelf", "#E8BE84", rough=0.55),
        cushion=lib.mat("Cushion", lib.P["chairs"][2], rough=0.8),
        light=lib.mat("Light", "#FFF4D6", rough=0.4, emit="#FFE9B8", strength=2.0),
        frame=lib.mat("DoorFrame", "#2B2D42", rough=0.5),
        glass=lib.mat("Glass", "#DFF3FF", rough=0.1, alpha=0.3),
        handle=lib.mat("Handle", lib.P["metal"], rough=0.3, metal=0.4),
    )


def shell(M):
    lib.rbox("FP_Back", (W, T, H), (0, D / 2 - T / 2, H / 2), M["shell"], r=0.04, seg=2)
    for s in (-1, 1):
        lib.rbox(f"FP_Side{s}", (T, D, H), (s * (W / 2 - T / 2), 0, H / 2), M["shell"], r=0.04,
                 seg=2)
    lib.rbox("FP_Roof", (W + 0.04, D + 0.04, 0.12), (0, 0, H - 0.04), M["shell"], r=0.05, seg=3)
    lib.rbox("FP_Floor", (W, D, 0.08), (0, 0, 0.04), M["shell"], r=0.03, seg=2)
    lib.rbox("FP_Lining", (W - 2 * T - 0.01, 0.02, H - 0.3), (0, D / 2 - T - 0.01, H / 2),
             M["felt"], r=0.01, seg=1)


def interior(M):
    lib.rbox("FP_Desk", (W - 2 * T - 0.02, 0.32, 0.05), (0, D / 2 - T - 0.17, 1.0), M["top"],
             r=0.02, seg=2)
    c = lib.rbox("FP_Stool", (0.42, 0.36, 0.12), (0, 0.05, 0.5), M["cushion"], r=0.05, seg=1)
    lib.subsurf(c, 1)
    lib.cyl("FP_StoolPost", 0.04, 0.4, (0, 0.05, 0.27), M["frame"], r=0.01, seg=1, verts=12)
    lib.cyl("FP_Lamp", 0.16, 0.03, (0, 0, H - 0.115), M["light"], r=0.01, seg=1, verts=24)


def door(M):
    y = -D / 2 + 0.02
    dw, dh = W - 2 * T - 0.01, H - 0.2
    zc = 0.08 + dh / 2
    parts = [lib.rbox("FP_DoorGlass", (dw - 0.06, 0.02, dh - 0.06), (0, y, zc), M["glass"],
                      r=0.006, seg=1)]
    f = 0.05
    for i, (sx, sz, w, h) in enumerate(((0, dh / 2 - f / 2, dw, f), (0, -dh / 2 + f / 2, dw, f),
                                        (-dw / 2 + f / 2, 0, f, dh), (dw / 2 - f / 2, 0, f, dh))):
        parts.append(lib.rbox(f"FP_DoorFrame{i}", (w, 0.05, h), (sx, y, zc + sz), M["frame"],
                              r=0.02, seg=1))
    parts.append(lib.rbox("FP_Handle", (0.03, 0.05, 0.36), (dw / 2 - 0.09, y - 0.05, 1.05),
                          M["handle"], r=0.013, seg=1))
    for p in parts:
        lib.node(p, "Door", pivot=HINGE)


STEPS = [shell, interior, door]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
