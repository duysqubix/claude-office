"""Silver trophy (see _trophy.py)."""
import lib
from props import _trophy

NAME = "trophy_silver"
AO_RES = 256
META = _trophy.meta("silver")


def build():
    _trophy.build(NAME, "silver")


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
