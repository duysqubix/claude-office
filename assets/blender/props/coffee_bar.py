"""Coffee bar: a cosy espresso bar counter. Rounded wooden slatted front (`Accent` kick band),
a cream stone top, a chunky twin-group espresso machine, a bean grinder with a hopper of
beans, a stack of cups, a glass pastry dome with pink donuts and a little A-frame "COFFEE"
chalk sign on the counter. Customers stand on -Y, the barista on +Y. Origin at the floor
centre."""
import math

import lib

NAME = "coffee_bar"
AO_RES = 512
L, D, TOP = 2.0, 0.62, 1.02
META = dict(
    name="Coffee bar", category="furniture", priority="P1",
    description="Espresso bar counter with machine, grinder, cups and donuts",
    tags=["break-room", "kitchen", "coffee", "interactable"], tintable=["Accent"],
    anchors_bl={"customer": (0, -0.75, 0), "barista": (0, 0.7, 0), "pickup": (0.1, -0.2, TOP)},
)


def materials():
    return dict(
        slat=lib.mat("Wood", lib.P["wood"], rough=0.6),
        body=lib.mat("Body", "#8C5A3A", rough=0.6),
        kick=lib.mat("Accent", "#2EC4B6", rough=0.5),
        top=lib.mat("Stone", "#FFF3DE", rough=0.35),
        chrome=lib.mat("Chrome", lib.P["metal"], rough=0.22, metal=0.5),
        red=lib.mat("Machine", "#FF5A5F", rough=0.4),
        dark=lib.mat("Dark", "#2B2D42", rough=0.55),
        bean=lib.mat("Beans", lib.P["coffee"], rough=0.6),
        cup=lib.mat("Cup", "#FFFFFF", rough=0.45),
        glass=lib.mat("Glass", "#E6F7FF", rough=0.05, alpha=0.25),
        dough=lib.mat("Dough", "#E8BE84", rough=0.6),
        icing=lib.mat("Icing", "#FF9DCB", rough=0.45),
        chalk=lib.mat("Chalk", "#2F3B34", rough=0.85),
        letters=lib.mat("ChalkText", "#FFFFFF", rough=0.8),
    )


def counter(M):
    lib.rbox("CB_Body", (L - 0.04, D - 0.06, TOP - 0.06), (0, 0.02, (TOP - 0.06) / 2), M["body"],
             r=0.03, seg=2)
    n = 12
    for i in range(n):
        x = -L / 2 + 0.07 + i * (L - 0.14) / (n - 1)
        lib.rbox(f"CB_Slat{i}", (0.135, 0.03, TOP - 0.2), (x, -D / 2 + 0.005, 0.1 + (TOP - 0.2) / 2),
                 M["slat"], r=0.014, seg=1)
    lib.rbox("CB_Kick", (L, D - 0.02, 0.1), (0, 0.01, 0.05), M["kick"], r=0.03, seg=2)
    lib.slab("CB_Top", lib.rounded_rect(L + 0.08, D + 0.08, 0.06, 4), TOP - 0.06, TOP,
             material=M["top"], r=0.025, seg=2)


def machine(M):
    x, y, z = -0.55, 0.08, TOP
    lib.rbox("CB_Machine", (0.56, 0.36, 0.34), (x, y, z + 0.17), M["red"], r=0.05, seg=3)
    lib.rbox("CB_MachineTop", (0.58, 0.38, 0.03), (x, y, z + 0.355), M["chrome"], r=0.012,
             seg=1)
    for s in (-1, 1):
        gx = x + s * 0.13
        lib.cyl(f"CB_Group{s}", 0.045, 0.05, (gx, y - 0.2, z + 0.2), M["chrome"], r=0.012, seg=1,
                verts=16)
        lib.rbox(f"CB_Handle{s}", (0.03, 0.12, 0.03), (gx, y - 0.29, z + 0.17), M["dark"],
                 r=0.012, seg=1, rot=(math.radians(10), 0, 0))
        lib.cyl(f"CB_ShotCup{s}", 0.025, 0.05, (gx, y - 0.2, z + 0.045), M["cup"], r=0.006,
                seg=1, verts=12)
    lib.rbox("CB_Tray", (0.44, 0.12, 0.02), (x, y - 0.22, z + 0.01), M["chrome"], r=0.008, seg=1)


def bits(M):
    # Grinder with a bean hopper.
    gx, gy = -0.12, 0.12
    lib.rbox("CB_Grinder", (0.14, 0.16, 0.2), (gx, gy, TOP + 0.1), M["dark"], r=0.03, seg=2)
    lib.cyl("CB_Hopper", 0.07, 0.14, (gx, gy, TOP + 0.27), M["glass"], radius2=0.05, r=0.01,
            seg=1, verts=16)
    lib.cyl("CB_Beans", 0.06, 0.1, (gx, gy, TOP + 0.255), M["bean"], radius2=0.045, r=0.01,
            seg=1, verts=16)
    # Stack of cups.
    for i in range(4):
        lib.cyl(f"CB_Cup{i}", 0.04, 0.05, (0.12, 0.16, TOP + 0.03 + i * 0.035), M["cup"],
                radius2=0.045, r=0.008, seg=1, verts=16)
    # Pastry dome with donuts.
    dx, dy = 0.5, -0.06
    lib.cyl("CB_DomePlate", 0.17, 0.02, (dx, dy, TOP + 0.01), M["cup"], r=0.008, seg=1, verts=28)
    for i, (ox, oy, oz) in enumerate(((-0.06, 0.0, 0.04), (0.06, 0.02, 0.04), (0.0, -0.02, 0.085))):
        lib.torus(f"CB_Donut{i}", 0.042, 0.022, (dx + ox, dy + oy, TOP + oz), M["dough"], seg=12,
                  ring=6)
        lib.torus(f"CB_Icing{i}", 0.042, 0.018, (dx + ox, dy + oy, TOP + oz + 0.008), M["icing"],
                  seg=12, ring=6)
    prof = [(0.0, 0.0), (0.16, 0.0), (0.16, 0.1), (0.13, 0.17), (0.07, 0.2), (0.0, 0.205)]
    lib.lathe("CB_Dome", prof, (dx, dy, TOP + 0.02), M["glass"], verts=24)
    lib.sphere("CB_DomeKnob", 0.02, (dx, dy, TOP + 0.235), M["cup"], u=10, v=5)
    # Little chalk A-frame sign.
    sx, sy = 0.82, -0.14
    lib.rbox("CB_Sign", (0.2, 0.02, 0.24), (sx, sy, TOP + 0.12), M["chalk"], r=0.01, seg=1,
             rot=(math.radians(-10), 0, 0))
    lib.rbox("CB_SignBack", (0.2, 0.02, 0.24), (sx, sy + 0.06, TOP + 0.12), M["slat"], r=0.01,
             seg=1, rot=(math.radians(10), 0, 0))
    lib.text("CB_SignText", "COFFEE", 0.04, (sx, sy - 0.03, TOP + 0.14), M["letters"], extrude=0,
             bevel=0, res=1, rot=(math.pi / 2 - math.radians(10), 0, 0))


STEPS = [counter, machine, bits]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
