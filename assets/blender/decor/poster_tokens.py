"""Poster: "Tokens are temporary, commits are forever". A lilac poster in a fat round
tintable `Accent` frame: a raised git graph (main line, a branch looping out and merging
back, chunky commit dots) over four lines of raised rounded lettering. 0.71 × 0.99 m;
wall item: origin at the back centre, face looks -Y."""
import math

import lib
from decor import _decor as D
from decor import _wall as wallkit

NAME = "poster_tokens"
AO_RES = 512
AO_DISTANCE = 0.05
W, H = 0.66, 0.94
META = dict(
    name="Poster: Tokens are temporary", category="decor", priority="P1",
    description="Framed lilac poster with a git graph: \"Tokens are temporary, commits are forever\"",
    tags=["wall", "poster", "joke"], tintable=["Accent"],
    anchors_bl={"center": (0, -0.03, 0)}, mount="wall: origin is the back centre",
    notes="Fixed by flicker: the commit dots stand 2.5 mm off their rims (were 0.3 mm), so the "
          "cream rims no longer shimmer through them from across the office.",
)


def materials():
    return dict(
        board=D.mat("Poster", "lilac", rough=0.7),
        frame=D.mat("Accent", "ink", rough=0.5),
        ink=D.mat("Ink", "ink", rough=0.6),
        cream=D.mat("Cream", "paper", rough=0.55),
        yellow=D.mat("CommitYellow", "yellow", rough=0.5),
        coral=D.mat("CommitCoral", "coral", rough=0.5),
        mint=D.mat("CommitMint", "mint", rough=0.5),
    )


def graph(M, face):
    r = 0.011
    y = face - r * 0.5
    mx = -0.07
    D.tube("Git_Main", [(mx, y, 0.37), (mx, y, -0.04)], r, M["cream"], verts=10, caps="round")
    branch = [(mx, y, 0.27), (mx + 0.03, y, 0.24), (mx + 0.13, y, 0.2), (mx + 0.14, y, 0.12),
              (mx + 0.13, y, 0.05), (mx + 0.03, y, 0.01), (mx, y, -0.01)]
    D.tube("Git_Branch", branch, r, M["cream"], verts=10, smooth=4, caps="round")
    for k, (x, z, key) in enumerate(((mx, 0.34, "yellow"), (mx, 0.15, "yellow"),
                                     (mx + 0.14, 0.12, "coral"), (mx, -0.03, "mint"))):
        D.prism(f"Commit{k}_Rim", D.circle_pts(0.036, 22), 0.018, M["cream"], loc=(x, face, z),
                rot=D.FRONT, r=0.005, seg=1)
        # The dot stands 2.5 mm off its rim: closer, the rim shimmers through it from afar.
        D.face(f"Commit{k}", D.circle_pts(0.025, 20), M[key], loc=(x, face - 0.0205, z),
               rot=D.FRONT)


def lettering(M, face):
    lines = [("Tokens are", "cream", -0.11), ("temporary,", "cream", -0.185),
             ("commits are", "ink", -0.27), ("forever", "ink", -0.345)]
    for i, (txt, key, z) in enumerate(lines):
        D.text(f"Txt{i}", txt, 0.066, M[key], loc=(0, face, z), depth=0.008, res=1)


def build():
    lib.begin(NAME)
    M = materials()
    face = wallkit.framed("Poster", W, H, M["board"], M["frame"])
    graph(M, face)
    lettering(M, face)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META, wall=True)
