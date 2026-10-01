"""Computer mouse on a pad: soft pebble mouse with a button seam and scroll wheel, sitting on a
rounded pad (`Accent`). Origin at the pad's bottom centre; the mouse points -Y."""
import lib

NAME = "computer_mouse"
AO_RES = 256
META = dict(
    name="Computer mouse", category="desk-item", priority="P0",
    description="Pebble mouse with a scroll wheel on a rounded mouse pad",
    tags=["desk", "computer"], tintable=["Accent"],
    anchors_bl={"hand": (0, 0.0, 0.045)},
)


def materials():
    return dict(
        shell=lib.mat("MouseShell", "#E9ECF2", rough=0.55),
        wheel=lib.mat("MouseWheel", lib.P["ink"], rough=0.6),
        pad=lib.mat("Accent", lib.P["deskAccents"][2], rough=0.85),
    )


def parts(M, at=(0, 0, 0), pad=True):
    x, y, z = at
    if pad:
        lib.rbox("Mouse_Pad", (0.22, 0.19, 0.008), (x, y, z + 0.004), M["pad"], r=0.004, seg=1)
        z += 0.008
    lib.blob("Mouse", 0.04, (x, y, z + 0.024), M["shell"], scale=(0.95, 1.35, 0.62))
    lib.cyl("Mouse_Wheel", 0.008, 0.008, (x, y - 0.026, z + 0.047), M["wheel"], r=0.003,
            seg=1, verts=12, rot=(0, 1.5708, 0))

def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
