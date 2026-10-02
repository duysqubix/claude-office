"""Assemble a whole character from the kit's own part models, in the rig's rest pose, for
the preset_* catalog models. Every part is built by its module, joined, trimmed if dense,
and placed at its joint (rig-dimensions.json). Body tints (Skin, Shirt, Pants, Shoes, Hair)
stay shared so one colour runs through every part; other materials keep their own."""
import importlib
import math

import bpy
from mathutils import Matrix, Vector

from characters import _body as B
from characters import _kit as kit

import lib

TINTS = ("Skin", "Shirt", "Pants", "Shoes", "Hair")
L = kit.LIMB


def _rot(rx=0.0, ry=0.0, rz=0.0):
    return (Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(ry, 4, "Y") @
            Matrix.Rotation(rx, 4, "X"))


def part(module, at, keep=1.0, recolor=None, tag=None):
    """Build `module`'s model, join it into one mesh, place it with 4x4 `at`.
    `recolor` = {material name: hex} gives this part its own copy of a tint (e.g. long
    sleeves: the arm's Skin painted the shirt colour)."""
    mod = importlib.import_module("characters." + module)
    mod.build()
    for o in lib.coll().objects:
        if "node" in o:
            del o["node"]
    root = kit.join("_part_" + (tag or module))
    for m in list(root.data.materials):
        base = m.name.split("@")[0]
        if recolor and base in recolor:
            new = m.copy()
            new.name = base + "@" + (tag or module)
            new.diffuse_color = lib.rgba(recolor[base])
            lib.principled(new).inputs["Base Color"].default_value = lib.rgba(recolor[base])
            for i, mm in enumerate(root.data.materials):
                if mm == m:
                    root.data.materials[i] = new
        elif base not in TINTS and "@" not in m.name:
            m.name = m.name + "@" + (tag or module)
    if keep < 1.0:
        mod_d = root.modifiers.new("Decimate", "DECIMATE")
        mod_d.ratio = keep
    root.matrix_basis = at @ root.matrix_basis
    # Park it outside the part's collection: building the same part again (the other arm)
    # re-runs lib.begin() on that collection, which empties it (and begin() also empties
    # "_"-prefixed helper collections, hence no underscore here).
    hold = bpy.data.collections.get("PresetParts")
    if hold is None:
        hold = bpy.data.collections.new("PresetParts")
        bpy.context.scene.collection.children.link(hold)
    for c in list(root.users_collection):
        c.objects.unlink(root)
    hold.objects.link(root)
    return root


def joints(girth=1.0, splay=None, elbow=8.0, arms=None):
    """Rest-pose joint frames (Blender, root at the floor between the feet). `arms` can
    override (shoulder pitch, elbow bend) per side in degrees: {1: (p, e), -1: (p, e)}."""
    P = Vector((0, 0, kit.DIM["pelvisY"]))
    sh = L["shoulder"]
    splay = sh.get("restSplayDeg", 17) if splay is None else splay
    J = {"pelvis": Matrix.Translation(P),
         "head": Matrix.Translation(P + Vector((0, 0, kit.HEAD_Y)))}
    for s in (1, -1):
        pitch, bend = (arms or {}).get(s, (0.0, elbow))
        shoulder = P + Vector((s * sh["x"] * girth, 0, sh["y"]))
        Ru = _rot(math.radians(-pitch), -s * math.radians(splay), 0)
        J[("upper", s)] = Matrix.Translation(shoulder) @ Ru
        elbow_p = shoulder + (Ru @ Vector((0, 0, -L["upperArm"]["len"], 1))).to_3d()
        Rf = Ru @ _rot(math.radians(-bend), 0, 0)
        J[("fore", s)] = Matrix.Translation(elbow_p) @ Rf
        wrist = elbow_p + (Rf @ Vector((0, 0, -L["forearm"]["len"], 1))).to_3d()
        J[("hand", s)] = Matrix.Translation(wrist) @ Rf
        centre = wrist + (Rf @ Vector((0, 0, -L["hand"]["offset"], 1))).to_3d()
        J[("handCentre", s)] = centre
        J[("grip", s)] = centre + (Rf @ kit.bl(*kit.GRIP_FROM_HAND).to_4d()).to_3d()
        hip = P + Vector((s * L["hip"]["x"], 0, 0))
        J[("thigh", s)] = Matrix.Translation(hip)
        knee = hip - Vector((0, 0, L["thigh"]["len"]))
        J[("shin", s)] = Matrix.Translation(knee)
        ankle = knee - Vector((0, 0, L["shin"]["len"]))
        J[("foot", s)] = Matrix.Translation(ankle) @ _rot(0, 0, s * math.radians(
            L["foot"].get("toeOutDeg", 7)))
    return J


def assemble(name, spec):
    """spec keys: head items (list of modules), torso (module), sleeves ('short'|'long'),
    held ({side: module}), extras (torso-worn modules), colors {tint: hex}, scale, arms."""
    J = joints(arms=spec.get("arms"))
    parts = []
    long = spec.get("sleeves") == "long"
    shirt = spec["colors"]["Shirt"]
    for mod, keep in spec.get("head", []):
        parts.append(part(mod, J["head"], keep=keep))
    parts.append(part(spec["torso"], J["pelvis"], keep=spec.get("torso_keep", 1.0)))
    for mod, keep in spec.get("extras", []):
        parts.append(part(mod, J["pelvis"], keep=keep))
    for s in (1, -1):
        sleeve = {"Skin": shirt} if long else None
        parts.append(part("char_upper_arm", J[("upper", s)], keep=0.5, recolor=sleeve,
                          tag="upper%d" % s))
        parts.append(part("char_forearm", J[("fore", s)], keep=0.6, recolor=sleeve,
                          tag="fore%d" % s))
        parts.append(part("char_hand_mitten", J[("hand", s)], keep=0.5, tag="hand%d" % s))
        parts.append(part("char_thigh", J[("thigh", s)], keep=0.6, tag="thigh%d" % s))
        parts.append(part("char_shin", J[("shin", s)], keep=0.6, tag="shin%d" % s))
        parts.append(part(spec.get("shoe", "char_shoe_sneaker"), J[("foot", s)], keep=0.72,
                          tag="shoe%d" % s))
    for s, (mod, keep) in spec.get("held", {}).items():
        at = spec.get("held_at", {}).get(s)
        parts.append(part(mod, Matrix.Translation(at if at is not None else J[("grip", s)]),
                          keep=keep, tag="held%d" % s))
    lib.begin(name)
    for ob in parts:
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        lib.coll().objects.link(ob)
    sc = spec.get("scale", 1.0)
    if sc != 1.0:
        kit.transform(parts, Matrix.Scale(sc, 4))
    for tint, hex_str in spec["colors"].items():
        m = bpy.data.materials.get(tint)
        if m:
            m.diffuse_color = lib.rgba(hex_str)
            lib.principled(m).inputs["Base Color"].default_value = lib.rgba(hex_str)
    return J
