"""Desk setup: thick rounded white desk on slab legs with a coloured accent panel and drawer
pod (`Accent`, PALETTE.deskAccents), a chunky monitor whose screen is the emissive `Screen`
material (planar 0..1 UVs for the game's canvas texture), keyboard, mouse and a mug.
Front (where you sit) faces -Y; origin at the floor centre of the desk."""
import math

import lib
from props import computer_mouse, desk, keyboard, monitor

NAME = "desk_setup"
AO_RES = 512
META = dict(
    name="Desk setup (showcase)", category="furniture", priority="P0",
    description="Lookdev composite: desk, chunky monitor, keyboard, mouse and mug",
    tags=["desk", "composite", "preview"], tintable=["Accent", "Screen"],
    anchors_bl={"top": (0, 0, 0.75), "screen": (0, 0.064, 1.15), "seat": (0, -0.75, 0.5)},
)
TOP = 0.75


def materials():
    M = {}
    for mod in (desk, monitor, keyboard, computer_mouse):
        M.update(mod.materials())
    M.update(mug=lib.mat("Mug", lib.P["claude"], rough=0.55),
             coffee=lib.mat("Coffee", lib.P["coffee"], rough=0.3))
    return M


def desk_step(M):
    desk.parts(M)


def monitor_step(M):
    monitor.parts(M, at=(0, 0.12, TOP))


def keyboard_step(M):
    keyboard.parts(M, at=(-0.06, -0.19, TOP))
    computer_mouse.parts(M, at=(0.3, -0.17, TOP))


def mug(M):
    prof = [(0.0, 0.0), (0.036, 0.0), (0.042, 0.006), (0.044, 0.05), (0.044, 0.094),
            (0.040, 0.1), (0.036, 0.096), (0.036, 0.02), (0.0, 0.02)]
    mx, my = 0.5, 0.06
    lib.lathe("Mug_Body", prof, (mx, my, TOP), M["mug"], verts=24)
    lib.cyl("Mug_Coffee", 0.0365, 0.004, (mx, my, TOP + 0.082), M["coffee"], r=0, verts=24)
    lib.torus("Mug_Handle", 0.026, 0.009, (mx + 0.046, my, TOP + 0.052), M["mug"], seg=16,
              ring=8, rot=(math.pi / 2, 0, 0))


STEPS = [desk_step, monitor_step, keyboard_step, mug]


def build():
    lib.begin(NAME)
    M = materials()
    for step in STEPS:
        step(M)


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
