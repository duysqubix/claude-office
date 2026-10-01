"""Calculator: chunky desk calculator on a gentle wedge. Tintable `Accent` body, a dark
bezel with a pale-green LCD reading "42", a little solar strip, and a 4 × 5 grid of fat keys
(cream digits, orange operators, grey functions, a red AC). 0.12 × 0.17 m; origin at the
desk-contact centre; keys towards the user (-Y), display at the back."""
import math

import lib
from decor import _decor as D
from decor import _gadgets as G

NAME = "calculator"
AO_RES = 256
AO_DISTANCE = 0.035
W, L = 0.12, 0.17
Z_FRONT, Z_BACK = 0.017, 0.036
SLOPE = math.atan2(Z_BACK - Z_FRONT, L)
META = dict(
    name="Calculator", category="desk-item", priority="P1",
    description="Chunky wedge desk calculator with fat keys and an LCD that says 42",
    tags=["desk", "office", "gadget"], tintable=["Accent"],
    anchors_bl={"display": (0, 0.04, 0.034)},
)


def materials():
    return dict(
        body=D.mat("Accent", "teal", rough=0.5),
        bezel=D.mat("Bezel", "#2E3440", rough=0.5),
        lcd=D.mat("LCD", "#C9E4B4", rough=0.45),
        key=D.mat("Key", "white", rough=0.45),
        fn=D.mat("KeyFn", "#C8D0DC", rough=0.45),
        op=D.mat("KeyOp", "orange", rough=0.45),
        ac=D.mat("KeyAC", "red", rough=0.45),
        ink=D.mat("Ink", "ink", rough=0.6),
        white=D.mat("PrintWhite", "paper", rough=0.6),
    )


def body(M):
    prof = [(-L / 2, 0.0), (L / 2, 0.0), (L / 2, Z_BACK), (-L / 2, Z_FRONT)]  # (y, z)
    D.prism("Body", D.rounded_pts(prof, 0.007, steps=3), W, M["body"], loc=(-W / 2, 0, 0),
            rot=(math.pi / 2, 0, math.pi / 2), r=0.005, seg=2, angle=30)


def top(M):
    """Everything on the sloped top, built flat (top surface z = 0, y up the slope)."""
    before = D.snapshot()
    # Display at the back: bezel, LCD, "42" right-aligned, solar strip above it.
    lib.rbox("Lcd_Bezel", (0.1, 0.042, 0.004), (0, 0.125, 0.0012), M["bezel"], r=0.0035, seg=2)
    D.face("Lcd_Face", D.rrect_pts(0.088, 0.03, 0.003), M["lcd"], loc=(0, 0.126, 0.0033))
    D.text("Lcd_42", "42", 0.019, M["ink"], loc=(0.038, 0.126, 0.0035), rot=(0, 0, 0), depth=0,
           res=2, align="RIGHT")
    lib.rbox("Solar", (0.042, 0.01, 0.002), (0.021, 0.157, 0.0004), M["bezel"], r=0.0009, seg=1)
    rows = [
        [("0", "key", "ink", 2), (".", "key", "ink"), ("=", "op", "white")],
        [("1", "key", "ink"), ("2", "key", "ink"), ("3", "key", "ink"), ("+", "op", "white")],
        [("4", "key", "ink"), ("5", "key", "ink"), ("6", "key", "ink"), ("-", "op", "white")],
        [("7", "key", "ink"), ("8", "key", "ink"), ("9", "key", "ink"), ("×", "op", "white")],
        [("AC", "ac", "white"), ("±", "fn", "ink"), ("%", "fn", "ink"), ("÷", "op", "white")],
    ]
    G.keypad(M, rows, x0=-0.0393, y0=0.02, pitch=(0.0262, 0.0195), size=(0.021, 0.0148))
    D.place(D.since(before), loc=(0, -L / 2, Z_FRONT), rot=(SLOPE, 0, 0))


def build():
    lib.begin(NAME)
    M = materials()
    body(M)
    top(M)


def finalize(id):
    return D.finalize(id, AO_RES, AO_DISTANCE, meta=META)
