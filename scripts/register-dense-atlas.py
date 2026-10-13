#!/usr/bin/env python3
"""Register two pristine 8x6 whole-character pages without changing PNG pixels."""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from statistics import median

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("whole_registration", Path(__file__).with_name("register-whole-atlas.py"))
whole = importlib.util.module_from_spec(spec)
spec.loader.exec_module(whole)

COUNTS = {"idle": 12, "rest": 4, "walk": 16, "turn": 16, "pet": 8,
          "feed": 8, "groom": 8, "stretch": 8, "hop": 10}
CLIPS = {
    "idle": {"frames": list(range(12)), "durations": [840, 840, 330, 330, 330, 330, 420, 420, 420, 420, 960, 960], "loop": True},
    "rest": {"frames": list(range(12, 16)), "durations": [1400] * 4, "loop": True},
    "walk": {"frames": list(range(16, 32)), "durations": [60] * 14 + [110, 110], "loop": True},
    "turn": {"frames": list(range(32, 48)), "durations": [50] * 16, "loop": False},
    "pet": {"frames": list(range(48, 56)), "durations": [180, 220, 320, 480, 480, 320, 220, 180], "loop": False},
    "feed": {"frames": list(range(56, 64)), "durations": [120, 160, 200, 320, 320, 200, 160, 120], "loop": True},
    "groom": {"frames": list(range(64, 72)), "durations": [120, 180, 250, 300, 300, 250, 180, 120], "loop": False},
    "stretch": {"frames": list(range(72, 80)), "durations": [180, 240, 360, 520, 520, 360, 240, 180], "loop": False},
    "hop": {"frames": list(range(80, 90)), "durations": [260, 220, 220, 200, 240, 240, 200, 220, 320, 680], "loop": False},
}
TRANSITIONS = {
    "walk": {"enter": {"frames": [95, 94], "durations": [60, 60]},
             "exit": {"frames": [94, 95], "durations": [60, 60]}},
    "rest": {"enter": {"frames": [90, 91, 92, 93], "durations": [100] * 4},
             "exit": {"frames": [93, 92, 91, 90], "durations": [100] * 4}},
}
NEUTRAL_HEIGHT = {"cat": 190, "dog": 184, "parrot": 180}
GROUND = 226
HOP_LIFT = [0, 0, 0, 8, 18, 24, 18, 8, 0, 0]


def page_contours(image):
    width, height = image.size
    if image.mode != "RGBA":
        raise ValueError("Generated pages must preserve RGBA transparency")
    contours = whole.components(image.getchannel("A").tobytes(), width, height)
    if len(contours) != 48:
        raise ValueError(f"Expected 48 complete animals, found {len(contours)}")
    cells = {}
    for contour in contours:
        left, top, right, bottom = contour
        col, row = int((left + right) / 2 * 8 / width), int((top + bottom) / 2 * 6 / height)
        index = row * 8 + col
        if index in cells or not 0 <= index < 48:
            raise ValueError(f"Multiple/outside animals assigned to frame {index}")
        cells[index] = contour
    if set(cells) != set(range(48)):
        raise ValueError("Animals must occupy all 48 row-major cells")
    return cells


def crop_with_margin(contour, contours, width, height):
    left, top, right, bottom = contour
    x, y, end_x, end_y = max(0, left - 3), max(0, top - 3), min(width, right + 3), min(height, bottom + 3)
    for other in contours:
        if other == contour:
            continue
        ol, ot, ore, ob = other
        if ot < end_y and ob > y:
            if ore <= left:
                x = max(x, ore)
            if ol >= right:
                end_x = min(end_x, ol)
        if ol < end_x and ore > x:
            if ob <= top:
                y = max(y, ob)
            if ot >= bottom:
                end_y = min(end_y, ot)
    moat = min(left - x, top - y, end_x - right, end_y - bottom)
    if moat < 1:
        raise ValueError("Animal touches a neighbor or image edge")
    neighbors = sum(x < ore and end_x > ol and y < ob and end_y > ot for ol, ot, ore, ob in contours)
    if neighbors != 1:
        raise ValueError("Complete crop includes neighboring animal fragments")
    return [x, y, end_x - x, end_y - y], moat


def register(species, annotations):
    sources = [ROOT / f"public/pets/{species}-whole-v2-{kind}.png" for kind in ("motion", "care")]
    images = [Image.open(source) for source in sources]
    cells = [page_contours(image) for image in images]
    # Neutral standing measurements keep both pages at the same apparent size.
    neutral = [range(12), [0, 7, 8, 15, 16, 23, 24, 31, 32, 41, 47]]
    factors = [NEUTRAL_HEIGHT[species] / median(table[i][3] - table[i][1] for i in indices)
               for table, indices in zip(cells, neutral)]
    flight_anchors = annotations.get(species, {}).get("flightEyes", {})
    # Reduce both page factors together if a raised tail or wing needs more room.
    # Preserve every pose's anatomical scale and its intended anchor/airborne arc.
    limits = [1]
    for page, (image, table, factor) in enumerate(zip(images, cells, factors)):
        for local, (left, top, right, bottom) in table.items():
            index = page * 48 + local
            rect, _ = crop_with_margin(table[local], table.values(), *image.size)
            x, y, w, h = rect
            anchor_x, anchor_y, target_x = (left + right) / 2, bottom, 128
            target_y = GROUND - (HOP_LIFT[index - 80] if 80 <= index < 90 else 0)
            if species == "parrot" and 16 <= index < 32:
                if str(index) not in flight_anchors:
                    raise ValueError(f"Missing measured parrot flight eye anchor {index}")
                anchor_x, anchor_y = flight_anchors[str(index)]
                target_x, target_y = 172, 110
            for source_extent, available in ((anchor_x - x, target_x - 2),
                                             (x + w - anchor_x, 254 - target_x),
                                             (anchor_y - y, target_y - 2),
                                             (y + h - anchor_y, 254 - target_y)):
                if source_extent > 0:
                    limits.append(available / (source_extent * factor))
    factors = [factor * min(limits) for factor in factors]
    pages, frames, reports = [], [], []
    for page, (source, image, table, factor) in enumerate(zip(sources, images, cells, factors)):
        width, height = image.size
        before = hashlib.sha256(source.read_bytes()).hexdigest()
        pages.append({"asset": f"pets/{source.name}", "sourceSize": [width, height], "columns": 8, "rows": 6,
                      "scale": factor * max(width / 8, height / 6) / 256})
        moats, bounds = [], []
        for local in range(48):
            index = page * 48 + local
            left, top, right, bottom = table[local]
            rect, moat = crop_with_margin(table[local], table.values(), width, height)
            x, y, w, h = rect
            target_y = GROUND - (HOP_LIFT[index - 80] if 80 <= index < 90 else 0)
            anchor_x, anchor_y, target_x = (left + right) / 2, bottom, 128
            if species == "parrot" and 16 <= index < 32:
                if str(index) not in flight_anchors:
                    raise ValueError(f"Missing measured parrot flight eye anchor {index}")
                anchor_x, anchor_y = flight_anchors[str(index)]
                target_x, target_y = 172, 110
            offset_x = target_x - 128 - (anchor_x - x - w / 2) * factor
            offset_y = target_y - 128 - (anchor_y - y - h / 2) * factor
            dx, dy = (256 - w * factor) / 2 + offset_x, (256 - h * factor) / 2 + offset_y
            if min(dx, dy) < 0 or max(dx + w * factor, dy + h * factor) > 256:
                raise ValueError(f"{species} frame {index} exceeds canvas: {dx, dy, w * factor, h * factor}")
            frames.append({"page": page, "rect": rect, "offsetX": round(offset_x, 6), "offsetY": round(offset_y, 6)})
            moats.append(moat)
            bounds.append([dx, dy, w * factor, h * factor])
        if before != hashlib.sha256(source.read_bytes()).hexdigest():
            raise ValueError("Registration changed pristine PNG pixels")
        reports.append({"page": page, "asset": source.name, "sourceSize": [width, height], "sha256": before,
                        "animals": 48, "pixelsPerSourcePixel": factor, "minimumMoat": min(moats),
                        "largestCrop": [max(b[2] for b in bounds), max(b[3] for b in bounds)]})
    meta = {"version": 2, "pages": pages, "frames": frames, "clips": CLIPS,
            "stride": 64, "neutralFrame": 0, "transitions": TRANSITIONS}
    for name, count in COUNTS.items():
        assert len(set(meta["clips"][name]["frames"])) == count
    assert len(frames) == 96 and sum(CLIPS["idle"]["durations"]) == 6600
    assert sum(CLIPS["turn"]["durations"]) == 800
    assert sum(CLIPS["pet"]["durations"]) == 2400
    assert sum(CLIPS["feed"]["durations"]) * 2 == 3200
    assert sum(CLIPS["stretch"]["durations"]) == 2600
    assert sum(CLIPS["hop"]["durations"]) == 2800
    return meta, {"species": species, "poseCounts": COUNTS, "totalWholePoses": 96, "pages": reports}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--species", choices=whole.SPECIES)
    args = parser.parse_args()
    annotation_path = ROOT / "docs/dense-motion-registration.json"
    annotations = json.loads(annotation_path.read_text()) if annotation_path.exists() else {}
    for species in [args.species] if args.species else whole.SPECIES:
        meta, report = register(species, annotations)
        destination = ROOT / f"public/pets/{species}-whole-v2.json"
        if args.check:
            if json.loads(destination.read_text()) != meta:
                raise ValueError(f"{species}: saved metadata differs from deterministic registration")
        else:
            destination.write_text(json.dumps(meta, indent=2) + "\n")
        print(json.dumps(report))


if __name__ == "__main__":
    main()
