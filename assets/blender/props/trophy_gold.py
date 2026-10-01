"""Gold trophy (see _trophy.py)."""
import lib
from props import _trophy

NAME = "trophy_gold"
AO_RES = 256
META = _trophy.meta("gold")


def build():
    _trophy.build(NAME, "gold")


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
