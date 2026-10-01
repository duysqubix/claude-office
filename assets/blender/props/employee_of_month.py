"""Employee of the Month: a chunky gold-and-wood wall frame with a ribbon banner reading
"EMPLOYEE OF THE MONTH", a portrait area in the `Label` material (planar 0..1 UVs, no AO;
the game draws the winner's face and name on it) and a little star rosette. Origin at the
wall-contact point (back centre); it faces -Y."""
import math

import bmesh

import lib

NAME = "employee_of_month"
AO_RES = 256
PW, PH = 0.42, 0.5
META = dict(
    name="Employee of the Month", category="decor", priority="P1",
    description="Wall frame with a drawable portrait for the employee of the month",
    tags=["wall", "reward", "team-room"], tintable=["Label"],
    anchors_bl={"labelCenter": (0, -0.032, -0.03)}, label=dict(width=PW, height=PH),
    mount="wall: origin is the back centre",
)


def materials():
    label = lib.mat("Label", "#FFFFFF", rough=0.6)
    label["no_ao"] = True
    return dict(
        frame=lib.mat("Frame", "#F2C14E", rough=0.35, metal=0.4),
        wood=lib.mat("Backing", lib.P["wood"], rough=0.6),
        ribbon=lib.mat("Ribbon", "#E63946", rough=0.5),
        letters=lib.mat("Letters", "#FFFFFF", rough=0.5),
        star=lib.mat("Star", "#FFD93D", rough=0.4),
        label=label,
    )


def frame(M):
    lib.rbox("EM_Backing", (PW + 0.16, 0.025, PH + 0.26), (0, -0.0125, 0.03), M["wood"],
             r=0.012, seg=1)
    t, zc = 0.05, -0.03
    for i, (sx, sz, w, h) in enumerate(((0, PH / 2 + t / 2, PW + 2 * t, t),
                                        (0, -PH / 2 - t / 2, PW + 2 * t, t),
                                        (-PW / 2 - t / 2, 0, t, PH), (PW / 2 + t / 2, 0, t, PH))):
        lib.rbox(f"EM_Frame{i}", (w, 0.04, h), (sx, -0.03, zc + sz), M["frame"], r=0.018, seg=2)
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in ((-PW / 2, 0, -PH / 2), (PW / 2, 0, -PH / 2),
                                    (PW / 2, 0, PH / 2), (-PW / 2, 0, PH / 2))]
    bm.faces.new(vs)
    lib._link("EM_Portrait", bm, M["label"], loc=(0, -0.032, zc))


def banner(M):
    z = PH / 2 + 0.12
    lib.rbox("EM_Ribbon", (PW + 0.2, 0.02, 0.1), (0, -0.04, z), M["ribbon"], r=0.02, seg=2)
    for s in (-1, 1):
        lib.rbox(f"EM_Tail{s}", (0.08, 0.016, 0.07), (s * (PW / 2 + 0.12), -0.035, z - 0.03),
                 M["ribbon"], r=0.012, seg=1, rot=(0, s * math.radians(25), 0))
    lib.text("EM_Title", "EMPLOYEE OF THE MONTH", 0.034, (0, -0.051, z), M["letters"],
             extrude=0, bevel=0, res=1)
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        rr = 0.05 if i % 2 == 0 else 0.022
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    lib.slab("EM_Star", pts, -0.008, 0.008, (PW / 2 + 0.02, -0.06, -PH / 2 + 0.0), M["star"],
             r=0.004, seg=1, rot=(math.pi / 2, 0, 0))


STEPS = [frame, banner]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
