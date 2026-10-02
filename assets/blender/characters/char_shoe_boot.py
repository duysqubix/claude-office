"""Boot: a chunky ankle boot in the sneaker's footprint: a round toe, a shaft hugging the
ankle with a padded collar and pull tab, criss-cross laces and a thick dark sole with a
heel block. `Shoes` leather, dark `Sole`, tan laces. Pivot at the ankle (end of the shin);
the sole touches the floor in the rest pose."""
from characters import _body as B
from characters import _kit as kit

import lib

NAME = "char_shoe_boot"
META = dict(
    name="Boot", category="character-body", priority="P1",
    description="Chunky laced ankle boot with a thick sole; pivot at the ankle",
    tags=["body", "shoe", "boot"], tintable=["Shoes"],
    anchors_bl={"sole": (0, -B.L["foot"]["forward"],
                         -B.L["foot"]["below"] - B.L["foot"]["size"][1] / 2)},
)


def build():
    lib.begin(NAME)
    M = B.materials(shoes="#8D6E63")
    M["sole"] = kit.flat("BootSole", "#3B2A20", rough=0.8)
    M["lace"] = kit.flat("BootLaces", "#E8C07D", rough=0.7)
    B.boot(M)


def finalize(name):
    return kit.finalize(name, META, ao_distance=0.06, lift=(0, 0, B.L["foot"]["below"] +
                                                                B.L["foot"]["size"][1] / 2))
