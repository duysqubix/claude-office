"""String light bulb: one warm globe bulb under a little dark socket, about 9 cm tall, for
hanging along a wire the game draws itself (instance it along the catenary). The glass is
the emissive material `Bulb`, so evening lighting can brighten it. Origin at the top of the
socket: the point that sits on the wire. string_lights hangs the same bulb."""
import lib
from environment import _env

NAME = "string_bulb"
AO_RES = 128
AO_DISTANCE = 0.05

SOCKET_R, SOCKET_H = 0.013, 0.024
GLASS_R, GLASS_SQUASH = 0.028, 1.12


def materials():
    return dict(
        socket=lib.mat("Socket", "#2E3440", rough=0.5),
        glow=_env.glow("Bulb", "#FFE7A8", strength=2.0),
    )


def bulb(M, at=(0, 0, 0), name="Bulb", size=1.0):
    """A bulb hanging from `at` (the socket's top), `size` times the standard one. Returns
    (socket, glass)."""
    x, y, z = at
    sr, sh, gr = SOCKET_R * size, SOCKET_H * size, GLASS_R * size
    socket = lib.cyl(f"{name}Socket", sr, sh, (x, y, z - sh / 2), M["socket"], r=0, verts=6)
    glass = lib.sphere(f"{name}Glass", gr, (x, y, z - sh - gr * GLASS_SQUASH + 0.006 * size),
                       M["glow"], scale=(1, 1, GLASS_SQUASH), u=8, v=5)
    return socket, glass


def build():
    lib.begin(NAME)
    bulb(materials())


META = dict(
    name="String light bulb",
    category="outdoor",
    priority="P1",
    artist="Claude Rodin",
    description="One warm globe bulb on a socket, to hang along a wire",
    tags=["garden", "light", "night", "party"],
    tintable=[],
    anchors={},
    notes="Origin = top of the socket (sits on the wire); hangs 9 cm down. Glass is emissive "
          "'Bulb' (strength 2): brighten it in the evening.",
)


def finalize(name):
    # It hangs in the air: bake with no ground plane.
    return _env.finalize(name, AO_RES, AO_DISTANCE, meta=META, ground=None)
