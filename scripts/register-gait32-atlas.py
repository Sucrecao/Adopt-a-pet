#!/usr/bin/env python3
"""Append a pristine32-pose gait page while retaining every v2 crop and clip."""

import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
from statistics import median

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("dense_registration", Path(__file__).with_name("register-dense-atlas.py"))
dense = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dense)


def contours32(image):
    if image.mode != "RGBA":
        raise ValueError("Gait source must retain RGBA transparency")
    width, height = image.size
    contours = dense.whole.components(image.getchannel("A").tobytes(), width, height)
    if len(contours) != 32:
        raise ValueError(f"Expected32 whole animals, found{len(contours)}")
    cells = {}
    for contour in contours:
        left, top, right, bottom = contour
        col, row = int((left + right) / 2 * 8 / width), int((top + bottom) / 2 * 4 / height)
        index = row * 8 + col
        if index in cells or not 0 <= index < 32:
            raise ValueError(f"Multiple/outside animals in gait cell{index}")
        cells[index] = contour
    if set(cells) != set(range(32)):
        raise ValueError("Gait must fill all32 row-major cells")
    return cells


def register(species, annotation):
    previous = json.loads((ROOT / f"public/pets/{species}-whole-v2.json").read_text())
    source = ROOT / f"public/pets/{species}-whole-v3-gait.png"
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    image = Image.open(source)
    width, height = image.size
    cells = contours32(image)
    eyes = annotation["eyes"]
    if len(eyes) != 32 or any(len(point) != 2 for point in eyes):
        raise ValueError("Need32 measured stable eye/head anchors")
    old_page = previous["pages"][0]
    old_factor = 256 / max(old_page["sourceSize"][0] / 8, old_page["sourceSize"][1] / 6) * old_page["scale"]
    old_image = Image.open(ROOT / "public" / old_page["asset"])
    old_cells = dense.page_contours(old_image)
    reference_height = median(old_cells[i][3] - old_cells[i][1] for i in range(16, 32)) * old_factor
    factor = annotation.get("renderedPixelsPerSourcePixel", reference_height / median(box[3] - box[1] for box in cells.values()))
    ground = annotation.get("groundY", [cells[j][3] for j in range(32)])

    def registered_targets(scale):
        tx = 172 if species == "parrot" else 128 + median(eyes[i][0] - (cells[i][0] + cells[i][2]) / 2 for i in range(32)) * scale
        if species == "parrot":
            return [(ex, ey, tx, 110) for ex, ey in eyes]
        bob = annotation.get("headBob")
        if not bob:
            return [(eyes[i][0], ground[i], tx, 226) for i in range(32)]
        # The authored 3D paws have slightly different projected depths.
        # Smooth only whole-character translation across the closed cycle;
        # keep one anatomical scale and every pristine source pixel intact.
        raw = [226 + (eyes[i][1] - ground[i]) * scale for i in range(32)]
        radius = bob["samples"] // 2
        smoothed = [sum(raw[(i+j)%32] for j in range(-radius, radius+1)) / bob["samples"] for i in range(32)]
        center = sum(smoothed) / 32
        return [(ex, ey, tx, bob["centerY"] + (smoothed[i]-center)*bob["amplitude"]) for i,(ex,ey) in enumerate(eyes)]

    targets = registered_targets(factor)
    limits = [1]
    crops = [dense.crop_with_margin(cells[i], cells.values(), width, height) for i in range(32)]
    for (rect, _), (ax, ay, tx, ty) in zip(crops, targets):
        x, y, w, h = rect
        for extent, available in ((ax-x, tx-2), (x+w-ax, 254-tx), (ay-y, ty-2), (y+h-ay, 254-ty)):
            if extent > 0:
                limits.append(available / (extent * factor))
    factor *= min(limits)
    targets = registered_targets(factor)
    frames, bounds = [], []
    for (rect, _), (ax, ay, tx, ty) in zip(crops, targets):
        x, y, w, h = rect
        ox, oy = tx - 128 - (ax-x-w/2)*factor, ty - 128 - (ay-y-h/2)*factor
        dx, dy = (256-w*factor)/2+ox, (256-h*factor)/2+oy
        if min(dx, dy) < 0 or max(dx+w*factor, dy+h*factor) > 256:
            raise ValueError(f"{species} whole gait exceeds canvas")
        frames.append({"page":2,"rect":rect,"offsetX":round(ox,6),"offsetY":round(oy,6)})
        bounds.append([dx,dy,w*factor,h*factor])
    meta = copy.deepcopy(previous)
    meta["version"] = 3
    meta["pages"].append({"asset":f"pets/{source.name}","sourceSize":[width,height],"columns":8,"rows":4,
                          "scale":factor*max(width/8,height/4)/256})
    meta["frames"].extend(frames)
    meta["clips"]["walk"] = {"frames":list(range(96,128)),"durations":[1060/32]*32,"loop":True}
    assert meta["frames"][:96] == previous["frames"] and meta["pages"][:2] == previous["pages"]
    assert all(meta["clips"][name] == previous["clips"][name] for name in previous["clips"] if name != "walk")
    assert len(meta["frames"]) == 128 and len(meta["pages"]) == 3
    assert digest == hashlib.sha256(source.read_bytes()).hexdigest(), "Registration changed pristine PNG"
    report = {"species":species,"sourceSize":[width,height],"sha256":digest,"gaitPoses":32,
              "cycleMs":1060,"phaseMs":1060/32,"stride":meta["stride"],"pixelsPerSourcePixel":factor,
              "minimumMoat":min(moat for _,moat in crops),"targetEyeX":targets[0][2],
              "largestHeadStep":max(abs(targets[(i+1)%32][3]-targets[i][3]) for i in range(32)),
              "largestCrop":[max(box[2] for box in bounds),max(box[3] for box in bounds)]}
    return meta, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--species", choices=dense.whole.SPECIES)
    args = parser.parse_args()
    annotations = json.loads((ROOT / "docs/gait32-registration.json").read_text())
    for species in [args.species] if args.species else dense.whole.SPECIES:
        meta, report = register(species, annotations[species])
        destination = ROOT / f"public/pets/{species}-whole-v3.json"
        if args.check:
            if json.loads(destination.read_text()) != meta:
                raise ValueError(f"{species}: deterministic registration differs")
        else:
            destination.write_text(json.dumps(meta, indent=2) + "\n")
        print(json.dumps(report))


if __name__ == "__main__":
    main()
