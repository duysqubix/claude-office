"""Outdoor bin: a ribbed deep-green park litter bin (it matches the bench's iron) with a cream
band, and a domed rain lid floating on four posts over a dark opening. About 1.0 m tall.
Origin at the ground centre."""
import math

import lib
from environment import _env

NAME = "outdoor_bin"
AO_RES = 512
AO_DISTANCE = 0.15

BODY_H = 0.78
R = 0.27


def materials():
    return dict(
        green=lib.mat("Iron", "#2F5D50", rough=0.5),
        band=lib.mat("Band", "#FFF4E3", rough=0.5),
        inside=lib.mat("Inside", "#1E2A27", rough=0.8),
    )


def body(M):
    prof = [(0.0, 0.0), (R - 0.04, 0.0), (R - 0.02, 0.015), (R - 0.01, 0.06), (R, BODY_H - 0.04),
            (R + 0.015, BODY_H - 0.02), (R + 0.02, BODY_H), (R - 0.02, BODY_H), (0.0, BODY_H)]
    ob = lib.lathe("Body", prof, material=M["green"], verts=48)
    # Vertical ribs: swell the wall out at 16 slats.
    for v in ob.data.vertices:
        rr = math.hypot(v.co.x, v.co.y)
        if rr > R - 0.03 and 0.05 < v.co.z < BODY_H - 0.04:
            k = 1 + 0.035 * max(0.0, math.cos(16 * math.atan2(v.co.y, v.co.x))) ** 2
            v.co.x, v.co.y = v.co.x * k, v.co.y * k
    band = [(R + 0.005, 0.5), (R + 0.018, 0.505), (R + 0.022, 0.53), (R + 0.022, 0.6),
            (R + 0.018, 0.625), (R + 0.005, 0.63)]
    lib.lathe("Band", band, material=M["band"], verts=48)
    lib.cyl("Opening", R - 0.03, 0.01, (0, 0, BODY_H + 0.004), M["inside"], r=0, verts=40)


def lid(M):
    for k in range(4):
        a = math.radians(45 + 90 * k)
        lib.rbox(f"LidPost{k}", (0.04, 0.04, 0.16), ((R - 0.03) * math.cos(a),
                 (R - 0.03) * math.sin(a), BODY_H + 0.06), M["green"], r=0.012, seg=2)
    dome = [(0.0, 0.0), (R + 0.04, 0.0), (R + 0.05, 0.02), (R + 0.03, 0.05), (R - 0.04, 0.12),
            (0.12, 0.17), (0.0, 0.19)]
    lib.lathe("Lid", dome, loc=(0, 0, BODY_H + 0.13), material=M["green"], verts=48)
    lib.sphere("LidKnob", 0.04, (0, 0, BODY_H + 0.33), M["band"], u=12, v=8)


def build():
    lib.begin(NAME)
    M = materials()
    body(M)
    lid(M)


def finalize(name):
    return _env.finalize(name, AO_RES, AO_DISTANCE)
