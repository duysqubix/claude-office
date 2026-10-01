"""Beanbag: a big squashy pear-shaped bag in `Seat`, slumped with a dent where you sit and a
little stitched cap on top. Origin at the floor centre; the dent faces -Y."""
import lib

NAME = "beanbag"
AO_RES = 256
META = dict(
    name="Beanbag", category="furniture", priority="P1",
    description="Squashy beanbag with a sitting dent",
    tags=["seating", "lounge", "break-room"], tintable=["Seat"],
    anchors_bl={"seat": (0, -0.08, 0.32)},
)


def materials():
    return dict(
        seat=lib.mat("Seat", lib.P["chairs"][4], rough=0.85),
        cap=lib.mat("Cap", "#7E45C7", rough=0.8),
    )


def parts(M):
    prof = [(0.0, 0.0), (0.36, 0.0), (0.44, 0.06), (0.46, 0.18), (0.42, 0.32), (0.32, 0.46),
            (0.2, 0.56), (0.08, 0.6), (0.0, 0.61)]
    bag = lib.lathe("BB_Bag", prof, material=M["seat"], verts=24)
    lib.subsurf(bag, 1)
    # Slump: push the front-top down and back into a seat dent, bulge the sides out.
    me = bag.data
    for v in me.vertices:
        x, y, z = v.co
        if z > 0.2:
            t = (z - 0.2) / 0.41
            front = max(0.0, -y) / 0.46
            v.co.z -= 0.22 * t * front
            v.co.y += 0.12 * t * front
            v.co.y += 0.08 * t                        # lean back
        v.co.x *= 1.0 + 0.08 * (1 - abs(z - 0.25) / 0.4)
    lib.cyl("BB_Cap", 0.06, 0.02, (0, 0.13, 0.6), M["cap"], r=0.008, seg=1, verts=16,
            rot=(0.35, 0, 0))


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
