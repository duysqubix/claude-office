"""Poster: "Have you tried /compact?". A teal poster in a fat round tintable `Accent` frame:
a chubby dog-eared document being squeezed by two big yellow arrows, little sparkles, and
raised rounded lettering. 0.71 × 0.99 m; wall item: origin at the back centre, face
looks -Y."""
import lib
from decor import _decor as D
from decor import _wall as wallkit

NAME = "poster_compact"
AO_RES = 512
AO_DISTANCE = 0.05
W, H = 0.66, 0.94
META = dict(
    name="Poster: Have you tried /compact?", category="decor", priority="P1",
    description="Framed teal poster: a document squeezed by arrows, \"Have you tried /compact?\"",
    tags=["wall", "poster", "joke"], tintable=["Accent"],
    anchors_bl={"center": (0, -0.03, 0)}, mount="wall: origin is the back centre",
)
ARROW = [(-0.075, 0.024), (0.018, 0.024), (0.018, 0.056), (0.08, 0.0), (0.018, -0.056),
         (0.018, -0.024), (-0.075, -0.024)]


def materials():
    return dict(
        board=D.mat("Poster", "teal", rough=0.7),
        frame=D.mat("Accent", "ink", rough=0.5),
        ink=D.mat("Ink", "ink", rough=0.6),
        cream=D.mat("Cream", "paper", rough=0.55),
        fold=D.mat("Fold", "paper2", rough=0.6),
        line=D.mat("DocLine", "#8FD9CF", rough=0.6),
        arrow=D.mat("Arrow", "yellow", rough=0.5),
    )


def document(M, face):
    z0 = 0.13
    doc = D.rounded_pts([(-0.115, -0.15), (0.115, -0.15), (0.115, 0.1), (0.065, 0.15),
                         (-0.115, 0.15)], 0.014, steps=3)
    D.prism("Doc", [(x, z + z0) for x, z in doc], 0.014, M["cream"], loc=(0, face, 0),
            rot=D.FRONT, r=0.005, seg=2)
    D.prism("Doc_Fold", D.rounded_pts([(0.065, 0.15 + z0), (0.065, 0.1 + z0), (0.115, 0.1 + z0)],
                                      0.006, steps=2), 0.018, M["fold"], loc=(0, face, 0),
            rot=D.FRONT, r=0.003)
    for i, w in enumerate((0.13, 0.17, 0.15, 0.17, 0.1)):
        D.prism(f"Doc_Line{i}", D.rrect_pts(w, 0.017, 0.0085, steps=3), 0.004, M["line"],
                loc=(-0.08 + w / 2, face - 0.014, z0 + 0.085 - i * 0.045), rot=D.FRONT)


def arrows(M, face):
    for s in (-1, 1):
        pts = [(s * -x, z) for x, z in ARROW]
        D.prism(f"Arrow{s}", D.rounded_pts(pts, 0.009, steps=3), 0.016, M["arrow"],
                loc=(s * 0.215, face, 0.13), rot=D.FRONT, r=0.005, seg=1)
    for k, (x, z, r) in enumerate(((-0.2, 0.33, 0.026), (0.21, -0.06, 0.02), (0.19, 0.36, 0.018),
                                   (-0.22, -0.05, 0.016))):
        D.prism(f"Spark{k}", D.rounded_pts(D.star_pts(4, r, r * 0.35), r * 0.12, steps=2), 0.006,
                M["cream"], loc=(x, face, z), rot=D.FRONT)


def lettering(M, face):
    D.text("Txt_Have", "Have you tried", 0.062, M["cream"], loc=(0, face, -0.215), depth=0.008,
           res=1)
    D.text("Txt_Compact", "/compact?", 0.092, M["ink"], loc=(0, face, -0.33), depth=0.01, res=1)


def build():
    lib.begin(NAME)
    M = materials()
    face = wallkit.framed("Poster", W, H, M["board"], M["frame"])
    document(M, face)
    arrows(M, face)
    lettering(M, face)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META, wall=True)
