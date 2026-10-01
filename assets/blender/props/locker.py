"""Locker bank: three tall rounded lockers in pastel blue with vent slits, chunky handles and
little number plates. Front faces -Y; origin at the floor centre."""
import lib

NAME = "locker"
AO_RES = 512
N, DW, D, H = 3, 0.32, 0.5, 1.8
META = dict(
    name="Locker", category="furniture", priority="P1",
    description="Bank of three chunky lockers with vents and number plates",
    tags=["storage", "break-room"], tintable=["Accent"], anchors_bl={},
)


def materials():
    return dict(
        body=lib.mat("Body", "#7DB8F0", rough=0.5),
        doors=lib.mat("Accent", "#9CCBF5", rough=0.45),
        dark=lib.mat("Vent", "#3B4252", rough=0.7),
        chrome=lib.mat("Chrome", lib.P["metal"], rough=0.3, metal=0.4),
        plate=lib.mat("Plate", lib.P["paper"], rough=0.6),
        ink=lib.mat("Ink", lib.P["ink"], rough=0.6),
    )


def parts(M):
    W = N * DW + 0.04
    lib.rbox("LK_Body", (W, D, H - 0.06), (0, 0, 0.06 + (H - 0.06) / 2), M["body"], r=0.04,
             seg=3)
    lib.rbox("LK_Plinth", (W - 0.06, D - 0.06, 0.07), (0, 0, 0.035), M["dark"], r=0.02, seg=1)
    y = -D / 2 - 0.01
    for i in range(N):
        x = (i - (N - 1) / 2) * DW
        lib.rbox(f"LK_Door{i}", (DW - 0.03, 0.03, H - 0.16), (x, y, 0.06 + (H - 0.06) / 2),
                 M["doors"], r=0.02, seg=2)
        for k in range(3):
            lib.rbox(f"LK_Vent{i}_{k}", (0.16, 0.01, 0.018), (x, y - 0.016, H - 0.25 - k * 0.04),
                     M["dark"], r=0.007, seg=1)
        lib.rbox(f"LK_Handle{i}", (0.03, 0.035, 0.12), (x + DW / 2 - 0.07, y - 0.025, 0.95),
                 M["chrome"], r=0.012, seg=1)
        lib.rbox(f"LK_Plate{i}", (0.08, 0.008, 0.045), (x, y - 0.017, H - 0.42), M["plate"],
                 r=0.004, seg=1)
        lib.text(f"LK_Num{i}", str(i + 1), 0.035, (x, y - 0.022, H - 0.42), M["ink"], extrude=0,
                 bevel=0, res=1)


def build():
    lib.begin(NAME)
    parts(materials())


def finalize(id):
    return lib.finalize(id, AO_RES, meta=META)
