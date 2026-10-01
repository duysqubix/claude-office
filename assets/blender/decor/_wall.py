"""Wall-decor helpers (underscore file: build.py skips it): a chunky rounded tube frame with a
backing board, and placement on the board's face.

Wall items follow _decor.finalize(wall=True): origin at the wall-contact point (centre of
the back, y = 0), the item standing out towards -Y, its face looking -Y.
"""
import lib
from decor import _decor as D


def framed(prefix, w, h, M_board, M_frame, tube=0.026, corner=0.05):
    """A picture board (w × h, flush to the wall) inside a fat round-section frame.
    Returns y of the board's face (content goes in front of it, i.e. at y < face)."""
    board_t = 0.014
    face = -board_t
    lib.rbox(f"{prefix}_Board", (w, board_t, h), (0, -board_t / 2, 0), M_board, r=0.004, seg=1)
    path = [(x, -tube - 0.0005, z) for x, z in D.rrect_pts(w + tube * 0.6, h + tube * 0.6,
                                                             corner, steps=4)]
    D.tube(f"{prefix}_Frame", path, tube, M_frame, verts=10, closed=True, caps=None)
    return face


def on_face(face, lift=0.0):
    """y for content `lift` metres in front of the board face."""
    return face - lift
