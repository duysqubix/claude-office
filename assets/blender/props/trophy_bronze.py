"""Bronze trophy (see _trophy.py)."""
import lib
from props import _trophy

NAME = "trophy_bronze"
AO_RES = 256
META = _trophy.meta("bronze")


def build():
    _trophy.build(NAME, "bronze")


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
