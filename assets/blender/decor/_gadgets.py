"""Shared bits for the gadget props (calculator, desk_phone): a labelled keypad and a coiled
cord. Underscore file: build.py skips it."""
import math

from mathutils import Vector

import lib
from decor import _decor as D


def keypad(M, rows, x0, y0, pitch, size, height=0.006, r=0.003, label=0.0105, sink=0.001):
    """Grid of chunky keys in a local frame whose top surface is z = 0 (place it afterwards).
    rows: front-to-back lists of (label, key material, text material[, span]); a span of 2
    makes a double-width key. Column 0 is centred at x0, row 0 at y0."""
    px, py = pitch
    for j, row in enumerate(rows):
        col = 0
        for item in row:
            text, km, tm, span = (list(item) + [1])[:4]
            w = size[0] + (span - 1) * px
            x = x0 + (col + (span - 1) / 2) * px
            y = y0 + j * py
            lib.rbox(f"Key_{j}_{col}", (w, size[1], height), (x, y, height / 2 - sink), M[km],
                     r=r, seg=1)
            if text:
                D.text(f"KeyLabel_{j}_{col}", text, label, M[tm],
                       loc=(x, y, height - sink + 0.0002), rot=(0, 0, 0), depth=0, res=2)
            col += span


def coil(name, pts, coil_r, wire_r, pitch, material, samples=6, verts=4):
    """A coiled phone cord: a helix of `coil_r` wound around the smooth centreline through
    `pts`, one turn every `pitch` metres, swept with a wire of radius `wire_r`."""
    line = D.catmull(pts, 10)
    acc = [0.0]
    for a, b in zip(line, line[1:]):
        acc.append(acc[-1] + (b - a).length)
    total = acc[-1]
    n = max(8, int(total / pitch * samples))

    def at(s):
        for i in range(1, len(acc)):
            if acc[i] >= s:
                u = (s - acc[i - 1]) / max(acc[i] - acc[i - 1], 1e-9)
                return line[i - 1].lerp(line[i], u), (line[i] - line[i - 1]).normalized()
        return line[-1], (line[-1] - line[-2]).normalized()

    c0, t0 = at(0.0)
    ref = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))
    nrm = (ref - t0 * ref.dot(t0)).normalized()
    prev_t = t0
    out = []
    for i in range(n + 1):
        s = total * i / n
        c, t = at(s)
        nrm = prev_t.rotation_difference(t) @ nrm
        nrm = (nrm - t * nrm.dot(t)).normalized()
        prev_t = t
        b = t.cross(nrm)
        a = 2 * math.pi * s / pitch
        out.append(c + coil_r * (math.cos(a) * nrm + math.sin(a) * b))
    return D.tube(name, out, wire_r, material, verts=verts, caps="round")
