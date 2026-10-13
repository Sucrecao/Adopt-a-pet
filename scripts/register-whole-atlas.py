#!/usr/bin/env python3
"""Register pristine whole-animal atlases; --check verifies without writing."""

import argparse
import copy
import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SPECIES = ("cat", "dog", "parrot")
THRESHOLD = 32
PADDING = 3
SCALES = {"cat": 0.80, "dog": 0.80, "parrot": 0.98}
GROUND = 226
# Eye centers measured from the largest dark component within each flight face.
# Anchor the body rather than its changing lowest wing tip.
FLIGHT_EYE_Y = (268.4, 271.3, 282.5, 277.0, 270.4, 274.7, 282.9, 269.1)
CLIPS = {
    "idle": {"frames": [0, 1, 2, 1, 0, 0], "durations": [1680, 660, 660, 840, 840, 1920], "loop": True},
    "rest": {"frames": [6, 7], "durations": [2800, 2800], "loop": True},
    "walk": {"frames": list(range(8, 16)), "durations": [120] * 7 + [220], "loop": True},
    "turn": {"frames": list(range(16, 24)), "durations": [100] * 8, "loop": False},
    "pet": {"frames": list(range(24, 28)), "durations": [300, 600, 500, 400], "loop": False},
    "feed": {"frames": list(range(28, 32)), "durations": [300, 350, 350, 500], "loop": True},
    "groom": {"frames": list(range(32, 36)), "durations": [300, 500, 500, 400], "loop": False},
    "stretch": {"frames": list(range(36, 40)), "durations": [250, 700, 600, 450], "loop": False},
    "hop": {"frames": list(range(40, 45)), "durations": [140, 140, 140, 140, 280], "loop": False},
}


def components(alpha, width, height):
    """Four-connected alpha contours, excluding faint preview matte noise."""
    mask = bytearray(value >= THRESHOLD for value in alpha)
    found = []
    for seed, value in enumerate(mask):
        if not value:
            continue
        stack = [seed]
        mask[seed] = 0
        count, left, top, right, bottom = 0, width, height, 0, 0
        while stack:
            at = stack.pop()
            x, y = at % width, at // width
            count += 1
            left, top, right, bottom = min(left, x), min(top, y), max(right, x + 1), max(bottom, y + 1)
            for neighbor, valid in ((at - 1, x > 0), (at + 1, x + 1 < width),
                                    (at - width, y > 0), (at + width, y + 1 < height)):
                if valid and mask[neighbor]:
                    mask[neighbor] = 0
                    stack.append(neighbor)
        if count >= 1000:
            found.append((left, top, right, bottom))
    return found


def register(species):
    source = ROOT / "public" / "pets" / f"{species}-whole-v1.png"
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    image = Image.open(source)
    if image.mode != "RGBA":
        raise ValueError(f"{species}: source must retain transparent RGBA pixels")
    width, height = image.size
    if width % 8 or height % 6:
        raise ValueError(f"{species}: source dimensions do not divide into 8x6")
    cw, ch = width // 8, height // 6
    contours = components(image.getchannel("A").tobytes(), width, height)
    if len(contours) != 45:
        raise ValueError(f"{species}: expected 45 whole animals, found {len(contours)}")
    by_frame = {}
    for left, top, right, bottom in contours:
        col = int((left + right) / 2 // cw)
        row = int((top + bottom) / 2 // ch)
        index = row * 8 + col
        if index in by_frame:
            raise ValueError(f"{species}: multiple animals assigned to frame {index}")
        by_frame[index] = (left, top, right, bottom)
    if set(by_frame) != set(range(45)):
        raise ValueError(f"{species}: animals do not occupy the 45 required row-major slots")
    scale = SCALES[species]
    render_scale = 256 / max(cw, ch) * scale
    frames, foot_y, bounds, moats = [], [], [], []
    for index in range(48):
        if index >= 45:
            col, row = index % 8, index // 8
            # Neighboring authored fur may cross into the otherwise unused cell.
            rect = [col * cw + cw // 2 - 2, row * ch + ch // 2 - 2, 4, 4]
            if image.crop((rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3])).getchannel("A").getextrema()[1] >= THRESHOLD:
                raise ValueError(f"{species}: unused frame {index} contains visible artwork")
            frames.append({"rect": rect, "offsetX": 0, "offsetY": 0})
            continue
        left, top, right, bottom = by_frame[index]
        x, y = max(0, left - PADDING), max(0, top - PADDING)
        end_x, end_y = min(width, right + PADDING), min(height, bottom + PADDING)
        # Narrow only padding where a neighboring animal approaches the margin.
        # The complete own contour is retained, with at least one empty pixel.
        for other in contours:
            if other == by_frame[index]:
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
        w, h = end_x - x, end_y - y
        moat = min(left - x, top - y, end_x - right, end_y - bottom)
        if moat < 1:
            raise ValueError(f"{species}: frame {index} cannot retain a transparent crop margin")
        moats.append(moat)
        neighbors = sum(x < ore and end_x > ol and y < ob and end_y > ot
                        for ol, ot, ore, ob in contours)
        if neighbors != 1:
            raise ValueError(f"{species}: frame {index} includes a neighboring animal fragment")
        if species == "parrot" and 8 <= index <= 15:
            anchor_y, target_y = FLIGHT_EYE_Y[index - 8], 110
        else:
            anchor_y, target_y = bottom, GROUND - (22 if index == 42 else 0)
        offset_y = target_y - 128 - (anchor_y - y - h / 2) * render_scale
        frame = {"rect": [x, y, w, h], "offsetX": 0, "offsetY": round(offset_y, 6)}
        frames.append(frame)
        dx, dy = (256 - w * render_scale) / 2, (256 - h * render_scale) / 2 + offset_y
        if min(dx, dy) < 0 or max(dx + w * render_scale, dy + h * render_scale) > 256:
            raise ValueError(f"{species}: registered crop {index} extends outside the 256px render canvas")
        foot_y.append(round(dy + (bottom - y) * render_scale, 3))
        bounds.append([round(dx, 3), round(dy, 3), round(w * render_scale, 3), round(h * render_scale, 3)])
    if species == "cat":
        # The authored final turn pose faces right. Use the intact profile's mirror.
        frames[16] = copy.deepcopy(frames[8])
        frames[20] = {**copy.deepcopy(frames[19]), "mirror": -1}
        frames[23] = {**copy.deepcopy(frames[8]), "mirror": -1}
    clips = copy.deepcopy(CLIPS)
    if species == "parrot":
        clips["walk"]["frames"] = [8, 9, 10, 9, 8, 9, 10, 9]
    meta = {"version": 1, "columns": 8, "rows": 6, "sourceSize": [width, height],
            "scale": scale, "clips": clips, "frames": frames}
    assert len(frames) == 48 and sum(clips["idle"]["durations"]) == 6600
    assert sum(clips["turn"]["durations"]) == 800
    assert all(frame < 45 for clip in clips.values() for frame in clip["frames"])
    after = hashlib.sha256(source.read_bytes()).hexdigest()
    if before != after:
        raise ValueError(f"{species}: source image changed during registration")
    report = {"species": species, "sourceSize": [width, height], "sha256": before,
              "wholeAnimalCount": len(contours), "populatedFrames": 45, "emptyFrames": [45, 46, 47],
              "scale": scale, "destinationPixelsPerSourcePixel": round(render_scale, 8),
              "groundY": GROUND, "hopAirborneGroundY": GROUND - 22,
              "flightEyeY": 110 if species == "parrot" else None,
              "minimumCropMoatAtAlpha32": min(moats),
              "largestRenderedCrop": [max(b[2] for b in bounds), max(b[3] for b in bounds)],
              "feetByAuthoredFrame": foot_y}
    return meta, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify existing registrations without writing")
    args = parser.parse_args()
    registered = [register(species) for species in SPECIES]
    for species, (meta, report) in zip(SPECIES, registered):
        destination = ROOT / "public" / "pets" / f"{species}-whole-v1.json"
        if args.check:
            if json.loads(destination.read_text()) != meta:
                raise ValueError(f"{species}: saved metadata differs from deterministic registration")
        else:
            destination.write_text(json.dumps(meta, indent=2) + "\n")
        print(json.dumps(report))
    if not args.check:
        path = ROOT / "docs" / "dog-whole-asset-prompt.md"
        text = path.read_text()
        start, end = "<!-- whole-atlas-registration:start -->", "<!-- whole-atlas-registration:end -->"
        if start in text:
            before, _, rest = text.partition(start)
            _, _, after = rest.partition(end)
            text = before.rstrip() + after
        report = "\n\n" + start + "\n## Registration measurements for all three species\n\n"
        report += "Run `python3 scripts/register-whole-atlas.py --check` to verify. The PNG files are never written. "
        report += "Source crops retain up to3px and at least1px outside their alpha>=32 contour; narrow padding is reduced where a neighbor approaches, retaining the entire own contour. Standing and sleeping feet align to y226; "
        report += "only airborne hop frame42 uses y204. Flight poses align their measured eyes to y110, independent of wingtip height. The padded parrot artwork uses one species-wide scale0.98 to retain its original desktop proportions; cat/dog use0.80. "
        report += "Cat turn poses16/23 use complete walk profile8, with pose23 mirrored; frontal pose20 mirrors pose19. "
        report += "Idle selects0/1/2/1/0/0 over the native 6.6-second cycle.\n\n```json\n"
        report += json.dumps([item[1] for item in registered], indent=2) + "\n```\n" + end + "\n"
        path.write_text(text.rstrip() + report)


if __name__ == "__main__":
    main()
