"""Server rack: tall rounded dark cabinet stacked with chunky server units. Each unit has a
row of status lights in the emissive `Accent` material (the game blinks it), plus steady blue
power LEDs and vent grooves. Front faces -Y; origin at the floor centre."""
import lib

NAME = "server_rack"
AO_RES = 512
W, D, H = 0.64, 0.8, 1.9
META = dict(
    name="Server rack", category="appliance", priority="P1",
    description="Server rack with blinking status lights",
    tags=["tech", "server-room"], tintable=["Accent"],
    anchors_bl={"front": (0, -0.5, 1.0)},
)


def materials():
    return dict(
        cab=lib.mat("Cabinet", "#2E3440", rough=0.5),
        unit=lib.mat("Unit", "#4C566A", rough=0.45),
        vent=lib.mat("Vent", "#1B2330", rough=0.7),
        accent=lib.mat("Accent", lib.P["stateWorking"], rough=0.3, emit=lib.P["stateWorking"],
                       strength=2.0),
        power=lib.mat("Power", lib.P["screenGlow"], rough=0.3, emit=lib.P["screenGlow"],
                      strength=2.0),
    )


def cabinet(M):
    lib.rbox("SR_Cab", (W, D, H - 0.06), (0, 0, 0.06 + (H - 0.06) / 2), M["cab"], r=0.05, seg=3)
    for s in (-1, 1):
        for t in (-1, 1):
            lib.cyl(f"SR_Foot{s}{t}", 0.035, 0.06, (s * 0.25, t * 0.33, 0.03), M["vent"],
                    r=0.012, seg=1, verts=12)


def units(M):
    z = 0.2
    i = 0
    for h in (0.2, 0.12, 0.12, 0.2, 0.12, 0.2, 0.12, 0.12, 0.2):
        zc = z + h / 2
        y = -D / 2 - 0.01
        lib.rbox(f"SR_Unit{i}", (W - 0.1, 0.04, h - 0.02), (0, y, zc), M["unit"], r=0.012,
                 seg=1)
        lib.rbox(f"SR_Vent{i}", (0.22, 0.01, h * 0.35), (0.1, y - 0.021, zc), M["vent"],
                 r=0.004, seg=1)
        for k in range(3):
            lib.sphere(f"SR_Light{i}_{k}", 0.011, (-0.2 + k * 0.035, y - 0.022, zc),
                       M["accent"], u=8, v=4)
        lib.sphere(f"SR_Power{i}", 0.012, (0.24, y - 0.022, zc), M["power"], u=8, v=4)
        z += h + 0.012
        i += 1


STEPS = [cabinet, units]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
