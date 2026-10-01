"""Backwards cap: the same oversized cap worn the other way round, pushed back on the head:
the bill out over the nape, tipped up, and the snapback strap across the forehead. The
intern look. `Accent`. Pivot at the head centre."""
from characters import _kit as kit
from characters import hat_cap

import lib

NAME = "hat_cap_backwards"
COLOR = "#2EC4B6"
META = dict(
    name="Cap (backwards)", category="character-hat", priority="P0",
    description="The same cap worn backwards, bill over the nape (interns)",
    tags=["hat", "cap", "intern"], tintable=["Accent"],
    anchors_bl={"hatBand": (0, -0.31, 0.141), "headTop": (0, 0.01, 0.36)},
)


def build():
    lib.begin(NAME)
    M = hat_cap.materials()
    M["cap"] = kit.m_accent(COLOR, rough=0.75)
    hat_cap.cap(M, back=True)


def finalize(name):
    return kit.finalize(name, META, mount="head", ao_distance=0.08, preview_yaw=-60)
