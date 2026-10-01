"""Mailbox: a chunky round-topped US-style mailbox in `Accent` on a wooden post, with a cream
door trim and a little red flag on its own node `Flag` (down = horizontal; raise it for
"you've got mail"). About 1.25 m tall. Origin at the ground centre; the door faces -Y."""
import math

import lib
from environment import _env

NAME = "mailbox"
AO_RES = 256
AO_DISTANCE = 0.15

BOX_Z = 1.0      # underside of the box
BOX_W = 0.26
BOX_L = 0.5
HINGE = (BOX_W / 2 + 0.03, 0.08, BOX_Z + 0.1)


def materials():
    return dict(
        body=lib.mat("Accent", lib.P["chairs"][1], rough=0.45),
        trim=lib.mat("Trim", "#FFF4E3", rough=0.5),
        post=lib.mat("Post", lib.P["wood"], rough=0.6),
        dark=lib.mat("Hardware", "#3B4252", rough=0.5),
        flag=lib.mat("FlagRed", "#E63946", rough=0.5),
    )


def arch(w, h, n=10):
    """Outline of a mailbox end: straight sides, a half-round top. (x, z), z up from 0."""
    r = w / 2
    pts = [(-r, 0.0), (r, 0.0), (r, h - r)]
    for k in range(1, n):
        a = math.pi * k / n
        pts.append((r * math.cos(a), h - r + r * math.sin(a)))
    pts.append((-r, h - r))
    return pts


def box(M):
    body = _env.extrude_outline("Box", arch(BOX_W, 0.27), BOX_L, (0, 0.04, BOX_Z), M["body"],
                                bevel=0.03, bseg=3)
    # Door: a cream framed panel on the front end, with a little pull tab.
    _env.extrude_outline("Door", arch(BOX_W - 0.03, 0.255), 0.03, (0, 0.04 - BOX_L / 2 - 0.005,
                         BOX_Z + 0.008), M["trim"], bevel=0.01, bseg=2)
    lib.rbox("DoorTab", (0.05, 0.03, 0.035), (0, 0.04 - BOX_L / 2 - 0.03, BOX_Z + 0.2),
             M["dark"], r=0.012, seg=2)
    return body


def post(M):
    lib.rbox("Post", (0.1, 0.1, BOX_Z - 0.02), (0, 0.06, (BOX_Z - 0.02) / 2), M["post"],
             r=0.025, seg=2)
    lib.rbox("Saddle", (0.2, 0.36, 0.035), (0, 0.04, BOX_Z - 0.015), M["post"], r=0.012, seg=2)
    # Little house number plate on the post.
    lib.rbox("NumberPlate", (0.08, 0.012, 0.1), (0, 0.06 - 0.055, 0.78), M["trim"], r=0.01,
             seg=2)


def flag(M):
    hx, hy, hz = HINGE
    lib.cyl("Flag_Pivot", 0.022, 0.03, (hx - 0.008, hy, hz), M["dark"], r=0.006, seg=1,
            verts=12, rot=(0, math.pi / 2, 0))
    lib.rbox("Flag_Arm", (0.016, 0.22, 0.03), (hx + 0.006, hy - 0.11, hz), M["flag"], r=0.007,
             seg=2)
    lib.rbox("Flag_Plate", (0.016, 0.09, 0.08), (hx + 0.006, hy - 0.2, hz + 0.045), M["flag"],
             r=0.012, seg=2)
    for o in lib.coll().objects:
        if o.name.startswith("Flag_"):
            lib.node(o, "Flag", pivot=HINGE)


def build():
    lib.begin(NAME)
    M = materials()
    box(M)
    post(M)
    flag(M)


META = dict(
    name="Mailbox",
    category="outdoor",
    priority="P1",
    description="Chunky round-topped mailbox on a wooden post, cream door, little red flag",
    tags=["mail", "garden", "street", "animated"],
    tintable=["Accent"],
    anchors={"door": [0, 1.13, 0.22]},
    nodes={
        "Flag": ("red flag; pivot on its hinge (x 0.16, y 1.1, z -0.08); modelled down (pointing "
                 "+Z); rotate about X by -90 deg (three.js) to raise it"),
    },
    notes="Box is 'Accent' (default blue #3D7CFF). Raise the flag when a session has news?",
)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META)
