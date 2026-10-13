#!/usr/bin/env python3
"""Measure pristine whole poses in canonical256 coordinates; never write rasters.

Offline runtime: /tmp/pawpal-flow-venv/bin/python (OpenCV, NumPy, Pillow).
--check validates existing binaries and source hashes without regenerating them.
"""

import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import time

import cv2
import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
SIZE, FIELD_SIZE = 256, 32
STRIDES = {"cat": 96, "dog": 112, "parrot": 80}
REJECTIONS = "docs/whole-flow-rejected-pairs.json"
MIXES = (.05, .1, .2, .25, .4, .5, .6, .75, .8, .9, .95, 1.)
spec = importlib.util.spec_from_file_location("pose_flow", Path(__file__).with_name("generate-pose-flow.py"))
solver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(solver)
solver.FLOW_SIZE = FIELD_SIZE


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rejected_pairs(root, species, meta):
    entries = json.loads((root / REJECTIONS).read_text())[species]
    known = {tuple(sorted(pair)) for pair in pair_list(meta)}
    seen = set()
    for entry in entries:
        pair = entry.get("pair")
        if not isinstance(pair, list) or len(pair) != 2 or any(type(i) is not int for i in pair):
            raise ValueError(f"{species}: invalid reviewed source pair")
        key = tuple(sorted(pair))
        if key not in known or key in seen or not entry.get("reason", "").strip():
            raise ValueError(f"{species}: invalid or duplicate reviewed exclusion {pair}")
        seen.add(key)
    return entries


def pair_list(meta, rejected=()):
    edges = []
    for name, clip in meta["clips"].items():
        if name == "walk":
            continue
        edges.extend(zip(clip["frames"], clip["frames"][1:]))
        if clip["loop"]:
            edges.append((clip["frames"][-1], clip["frames"][0]))
    for track in meta["transitions"]["rest"].values():
        edges.extend(zip(track["frames"], track["frames"][1:]))
    edges.extend(((93, 12), (90, 0), (90, 95)))
    pairs, seen = [], {tuple(sorted(entry["pair"])) for entry in rejected}
    for a, b in edges:
        key = tuple(sorted((a, b)))
        if a != b and key not in seen:
            pairs.append((a, b))
            seen.add(key)
    return pairs


def clip_coverage(meta, pairs, rejected):
    keys = {tuple(sorted(pair)) for pair in pairs}
    result = {}
    for name, clip in meta["clips"].items():
        if name == "walk":
            continue
        edges = list(zip(clip["frames"], clip["frames"][1:]))
        if clip["loop"]:
            edges.append((clip["frames"][-1], clip["frames"][0]))
        eligible = [list(pair) for pair in edges if tuple(sorted(pair)) in keys]
        source = [list(pair) for pair in edges if tuple(sorted(pair)) not in keys]
        result[name] = {"sourceFrames": len(clip["frames"]), "edges": len(edges),
                        "interpolatedEdges": len(eligible), "sourceEdges": source,
                        "quarterSampleOpportunities": len(clip["frames"]) + 3 * len(eligible),
                        "eighthSampleOpportunities": len(clip["frames"]) + 7 * len(eligible)}
    return result


def canonical_frames(root, meta):
    """Use the whole2D crop/scale/offset/mirror affine, only in memory."""
    images = [Image.open(root / "public" / page["asset"]).convert("RGBA") for page in meta["pages"]]
    result = {}
    for index in sorted({i for pair in pair_list(meta) for i in pair}):
        frame = meta["frames"][index]
        page = meta["pages"][frame["page"]]
        x, y, width, height = frame["rect"]
        scale = SIZE / max(page["sourceSize"][0] / page["columns"], page["sourceSize"][1] / page["rows"]) * page.get("scale", 1)
        dx = (SIZE - width * scale) / 2 + frame.get("offsetX", 0)
        dy = (SIZE - height * scale) / 2 + frame.get("offsetY", 0)
        crop = images[frame["page"]].crop((x, y, x + width, y + height))
        registered = crop.transform((SIZE, SIZE), Image.Transform.AFFINE,
                                    (1 / scale, 0, -dx / scale, 0, 1 / scale, -dy / scale),
                                    resample=Image.Resampling.BICUBIC)
        if frame.get("mirror", 1) < 0:
            registered = registered.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        rgba = np.asarray(registered)
        alpha = rgba[:, :, 3].copy()
        weight = alpha[:, :, None].astype(np.float32) / 255
        neutral = np.rint(rgba[:, :, :3] * weight + 128 * (1 - weight)).astype(np.uint8)
        gray = cv2.cvtColor(neutral, cv2.COLOR_RGB2GRAY)
        features = cv2.SIFT_create().detectAndCompute(gray, (alpha > 100).astype(np.uint8) * 255)
        result[index] = (gray, alpha, features)
    for image in images:
        image.close()
    return result


def quantized_geometry(encoded, alpha, limit=1.):
    """Exact33-vertex sampling and minimum signed triangle area for all t."""
    grid = np.arange(FIELD_SIZE + 1, dtype=np.float32)
    gy, gx = np.meshgrid(grid, grid, indexing="ij")
    field = cv2.remap(encoded.astype(np.float32) - 128,
                      np.clip(gx - .5, 0, FIELD_SIZE - 1), np.clip(gy - .5, 0, FIELD_SIZE - 1),
                      cv2.INTER_LINEAR)
    step = SIZE / FIELD_SIZE
    points = np.stack((gx * step, gy * step), axis=-1)
    # A small coverage dilation also protects soft rasterization edge pixels.
    foreground = cv2.dilate((alpha > 20).astype(np.uint8), np.ones((3, 3), np.uint8))
    foreground = foreground.reshape(FIELD_SIZE, 8, FIELD_SIZE, 8).max(axis=(1, 3)) > 0
    cross = lambda a, b: a[:, :, 0] * b[:, :, 1] - a[:, :, 1] * b[:, :, 0]
    def minimum(p, q, r, dp, dq, dr):
        u, v, du, dv = q - p, r - p, dq - dp, dr - dp
        c0, c1, c2 = -cross(u, v) / step ** 2, -(cross(du, v) + cross(u, dv)) / step ** 2, -cross(du, dv) / step ** 2
        value = np.minimum(c0, c0 + c1 * limit + c2 * limit ** 2)
        critical = np.divide(-c1, 2 * c2, out=np.zeros_like(c1), where=np.abs(c2) > 1e-8)
        internal = (c2 > 0) & (critical > 0) & (critical < limit)
        value = np.where(internal, np.minimum(value, c0 + c1 * critical + c2 * critical ** 2), value)
        return value
    a, b, c, d = points[:-1, :-1], points[1:, :-1], points[:-1, 1:], points[1:, 1:]
    da, db, dc, dd = field[:-1, :-1], field[1:, :-1], field[:-1, 1:], field[1:, 1:]
    areas = np.minimum(minimum(a, b, c, da, db, dc), minimum(c, b, d, dc, db, dd))
    values = areas[foreground]
    return {"folds": int(np.count_nonzero(values <= .05)),
            "minimumForegroundAreaRatio": float(values.min()) if values.size else 1.}


def mesh_folds(field, alpha, amount=1.):
    # The old solver checked its derived inverse only at quarter progress.
    # Every candidate must now be safe through its complete opacity interval.
    return quantized_geometry(solver.pack_field(field)[0], alpha, 1.)["folds"]


solver.mesh_folds = mesh_folds


def measure_pair(a, b):
    measured = [solver.measure_direction(first[0], second[0], first[2], second[2])
                for first, second in ((a, b), (b, a))]
    fields, consistency = solver.consistent_pair(measured[0][1], measured[1][1], a[1], b[1], a[2], b[2])
    fields, contour = solver.align_contours(fields, a[1], b[1], a[2], b[2])
    matches = [solver.feature_initialization(first[2], second[2]) for first, second in ((a, b), (b, a))]
    encodings, geometry, errors, clipped, peak = [], [], [], 0, 0.
    for field, alpha, match in zip(fields, (a[1], b[1]), matches):
        encoded, small = solver.pack_field(field)
        clipped += int(np.count_nonzero((small < -128) | (small > 127)))
        peak = max(peak, float(np.abs(small).max()))
        safety = quantized_geometry(encoded, alpha)
        if safety["folds"]:
            raise ValueError("Quantized32 foreground geometry folds")
        encodings.append(encoded)
        geometry.append(safety)
        if match is not None:
            error = solver.packed_correspondence_error(encoded, match[1], match[2])
            errors.append({"inliers": match[3], "medianPx": error})
            if error > 6:
                raise ValueError(f"Confident foreground feature correspondence exceeds6px: {error:.2f}")
        else:
            errors.append(None)
    if clipped:
        raise ValueError("Measured displacement exceeds signed-one-pixel range")
    return np.concatenate(encodings, axis=2), {
        "consistency": consistency, "contourRefined": contour is not None,
        "foregroundFeatureErrors": errors, "geometry": geometry,
        "maxDisplacementComponentPx": peak, "clippedComponents": clipped,
    }


# Pristine256px poses independently inspected on opaque backgrounds. These
# two corrections passed actual GPU review; rejected yaw/occlusion pairs are
# listed separately rather than being forced through an unsuitable warp.
SEMANTIC_POINTS = {
    ("dog", 56, 57): (7, [
        ([176, 70], [185, 127]), ([205, 68], [216, 124]), ([208, 84], [211, 148]),
        ([174, 43], [174, 77]), ([137, 71], [151, 101]), ([144, 111], [163, 140]),
        ([191, 110], [190, 164]), ([190, 145], [190, 183]), ([205, 170], [205, 196]),
        ([160, 170], [160, 190]), ([110, 144], [110, 144]), ([147, 217], [147, 217]),
        ([189, 211], [189, 211]), ([63, 203], [63, 203]), ([57, 85], [57, 85]),
    ]),
    ("parrot", 59, 60): (2, [
        ([186.55, 184.97], [183.47, 194.88]), ([207, 199], [208, 216]),
        ([169, 124], [177, 136]), ([159, 165], [161, 173]), ([214, 183], [211, 191]),
        ([180, 212], [185, 214]), ([44, 213], [44, 213]), ([105, 220], [105, 220]),
        ([150, 226], [150, 226]), ([100, 178], [100, 178]),
    ]),
}


def semantic_pair(species, pair, frames):
    critical, anchors = SEMANTIC_POINTS[(species, *pair)]
    yy, xx = np.mgrid[:FIELD_SIZE, :FIELD_SIZE]
    locations = np.stack((xx * 8 + 4, yy * 8 + 4), axis=-1).reshape(-1, 2) / SIZE
    boundary = [[0, 0], [256, 0], [0, 256], [256, 256], [128, 256]]

    def fit(source, delta):
        source = np.asarray(source, float) / SIZE
        def kernel(a, b):
            distance = ((a[:, None] - b[None, :]) ** 2).sum(axis=2)
            return distance * np.log(np.maximum(distance, 1e-12))
        linear = np.column_stack((np.ones(len(source)), source))
        matrix = np.block([[kernel(source, source) + np.eye(len(source)) * 1e-5, linear],
                           [linear.T, np.zeros((3, 3))]])
        weights = np.linalg.solve(matrix, np.concatenate((delta, np.zeros((3, 2)))))
        return (kernel(locations, source) @ weights[:len(source)]
                + np.column_stack((np.ones(len(locations)), locations)) @ weights[len(source):]).reshape(FIELD_SIZE, FIELD_SIZE, 2)

    parts = []
    for direction in (0, 1):
        source = np.asarray([points[direction] for points in anchors], float)
        target = np.asarray([points[1-direction] for points in anchors], float)
        field = fit(source.tolist() + boundary, np.concatenate((target-source, np.zeros((len(boundary), 2)))))
        if not np.isfinite(field).all() or np.any((field < -128) | (field > 127)):
            raise ValueError("Semantic correspondence exceeds signed field range")
        encoded = np.rint(field + 128).astype(np.uint8)
        if quantized_geometry(encoded, frames[pair[direction]][1])["folds"]:
            raise ValueError("Semantic candidate folds foreground geometry")
        parts.append(encoded)
    full = [cv2.resize(part.astype(np.float32)-128, (SIZE, SIZE), interpolation=cv2.INTER_LINEAR) for part in parts]
    # Derive one shared inverse, then align the whole alpha surface; independent
    # face alignment alone can leave doubled torso, ear, paw or tail outlines.
    shared, consistency = solver.consistent_pair(full[0], full[1], frames[pair[0]][1], frames[pair[1]][1], ([], None), ([], None))
    refined, contour = solver.align_contours(shared, frames[pair[0]][1], frames[pair[1]][1], ([], None), ([], None))
    parts = [solver.pack_field(field)[0] for field in refined]
    geometry, errors = [], []
    for direction, part in enumerate(parts):
        safety = quantized_geometry(part, frames[pair[direction]][1])
        if safety["folds"]:
            raise ValueError("Refined semantic candidate folds foreground geometry")
        source = np.asarray([points[direction] for points in anchors], np.float32)
        target = np.asarray([points[1-direction] for points in anchors], np.float32)
        delta = cv2.remap(part.astype(np.float32)-128, np.clip(source[:, 0:1]/8-.5, 0, 31),
                          np.clip(source[:, 1:2]/8-.5, 0, 31), cv2.INTER_LINEAR).reshape(-1, 2)
        error = np.linalg.norm(source+delta-target, axis=1)
        if float(error[:critical].max()) > 6:
            raise ValueError("Refinement lost a protected semantic head landmark")
        geometry.append(safety)
        errors.append(error.tolist())
    for value in (consistency, contour):
        if value is not None:
            value["maxPackedFeatureMedianPx"] = None  # No automatic fur matches were used.
    return np.concatenate(parts, axis=2), {"method": "reviewed-semantic-TPS-shared-inverse-alpha-contour",
        "consistency": consistency, "contourRefined": contour,
        "manualCanonicalAnchors": anchors, "protectedHeadAnchorCount": critical,
        "manualAnchorErrorsPx": errors, "geometry": geometry, "foregroundFeatureErrors": [None, None],
        "maxDisplacementComponentPx": float(max(np.abs(part.astype(np.int16)-128).max() for part in parts)),
        "clippedComponents": 0}


def check_existing(root, species, meta, report):
    path = root / f"public/pets/{species}-whole-v4.json"
    current = json.loads(path.read_text())
    expected = copy.deepcopy(meta)
    expected.update(version=4, stride=STRIDES[species], flow=current["flow"])
    if current != expected:
        raise ValueError(f"{species}: v4 changed original pose registration or clips")
    exclusions = rejected_pairs(root, species, meta)
    flow = current["flow"]
    if flow != {"version": 1, "size": FIELD_SIZE, "frameSize": SIZE, "encoding": "signed-one-pixel-rgba",
                "pairs": [list(pair) for pair in pair_list(meta, exclusions)],
                "sourcePairs": [entry["pair"] for entry in exclusions], "asset": f"pets/{species}-whole-v4-flow.bin"}:
        raise ValueError(f"{species}: incorrect field descriptor or coverage")
    binary_path = root / "public" / flow["asset"]
    tiles = np.frombuffer(binary_path.read_bytes(), np.uint8).reshape(len(flow["pairs"]), FIELD_SIZE, FIELD_SIZE, 4)
    frames = canonical_frames(root, meta)
    minimum = 1.
    for tile, pair in zip(tiles, flow["pairs"]):
        for direction in (0, 1):
            safety = quantized_geometry(tile[:, :, direction * 2:direction * 2 + 2], frames[pair[direction]][1])
            minimum = min(minimum, safety["minimumForegroundAreaRatio"])
            if safety["folds"]:
                raise ValueError(f"{species} {pair}: stored foreground fold")
    if sha(binary_path) != report["binarySha256"]:
        raise ValueError(f"{species}: binary hash mismatch")
    if report.get("clipCoverage") != clip_coverage(meta, flow["pairs"], exclusions):
        raise ValueError(f"{species}: interpolation coverage mismatch")
    return {"species": species, "pairs": len(flow["pairs"]), "binaryBytes": binary_path.stat().st_size,
            "minimumForegroundAreaRatio": minimum, "check": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--repair-reviewed", action="store_true", help="Retain every existing approved tile byte; apply only reviewed semantic fixes and exclusions")
    args = parser.parse_args()
    root = args.root.resolve()
    sources = {str(path.relative_to(root)): sha(path) for path in sorted((root / "public/pets").glob("*.png"))}
    cv2.setNumThreads(1)
    cv2.setRNGSeed(0)
    if args.check:
        qa = json.loads((root / "docs/whole-flow-qa.json").read_text())
        if qa["sourcePngSha256"] != sources:
            raise ValueError("Pristine source PNG hash mismatch")
        for species in STRIDES:
            meta = json.loads((root / f"public/pets/{species}-whole-v3.json").read_text())
            print(json.dumps(check_existing(root, species, meta, qa["species"][species])), flush=True)
        return
    started = time.perf_counter()
    qa = {"version": 1, "canonicalFrameSize": SIZE, "flowSize": FIELD_SIZE,
          "opencv": cv2.__version__, "numpy": np.__version__, "meshVertices": 33,
          "sampledMixes": MIXES, "foldValidation": "Analytic quadratic minimum over every t in[0,1], on quantized runtime mesh; alpha>20 dilated1px",
          "sourcePngSha256": sources, "species": {}, "reviewedExclusionsSha256": sha(root / REJECTIONS),
          "limitations": "Automatic SIFT metrics do not establish eye/paw anatomy. Only two independently GPU-accepted semantic repairs are promoted. Explicitly reviewed incompatible occlusion/yaw edges use symmetric complete-source rendering. Quarter- and eighth-sample opportunities describe graph coverage, not a substitute for actual GPU pixel distinctness. Canonical Pillow bicubic registration follows browser crop/scale/offset/mirror math but is not claimed pixel-identical to browser bilinear sampling."}
    previous_qa = json.loads((root / "docs/whole-flow-qa.json").read_text()) if args.repair_reviewed else None
    if previous_qa and previous_qa["sourcePngSha256"] != sources:
        raise ValueError("Cannot repair fields after source PNG changes")
    for species in STRIDES:
        t = time.perf_counter()
        meta = json.loads((root / f"public/pets/{species}-whole-v3.json").read_text())
        exclusions = rejected_pairs(root, species, meta)
        frames, pairs, tiles, diagnostics = canonical_frames(root, meta), pair_list(meta, exclusions), [], []
        previous_tiles, previous_diagnostics = {}, {}
        if args.repair_reviewed:
            previous = json.loads((root / f"public/pets/{species}-whole-v4.json").read_text())
            if any(previous[key] != meta[key] for key in ("pages", "frames", "clips", "transitions")):
                raise ValueError("Cannot repair modified source registration")
            binary_path = root / "public" / previous["flow"]["asset"]
            if sha(binary_path) != previous_qa["species"][species]["binarySha256"]:
                raise ValueError("Previous measured field hash mismatch")
            previous_tiles = dict(zip(map(tuple, previous["flow"]["pairs"]),
                                      np.frombuffer(binary_path.read_bytes(), np.uint8).reshape(-1, FIELD_SIZE, FIELD_SIZE, 4)))
            previous_diagnostics = {tuple(entry["pair"]): entry for entry in previous_qa["species"][species]["pairs"]}
        for index, (a, b) in enumerate(pairs):
            pair_started = time.perf_counter()
            try:
                if (species, a, b) in SEMANTIC_POINTS:
                    tile, diagnostic = semantic_pair(species, (a, b), frames)
                elif args.repair_reviewed:
                    if (a, b) not in previous_tiles:
                        raise ValueError("Reviewed repair cannot introduce an unmeasured edge")
                    tile = previous_tiles[(a, b)].copy()
                    diagnostic = {**previous_diagnostics[(a, b)], "reusedOriginalBytes": True}
                else:
                    tile, diagnostic = measure_pair(frames[a], frames[b])
            except ValueError as error:
                raise ValueError(f"{species} {a}->{b}: {error}") from error
            tiles.append(tile)
            diagnostics.append({"pair": [a, b], "seconds": round(time.perf_counter() - pair_started, 6), **diagnostic})
            if (index + 1) % 15 == 0:
                print(json.dumps({"species": species, "measuredPairs": index + 1, "totalPairs": len(pairs)}), flush=True)
        binary = np.stack(tiles).tobytes(order="C")
        output = root / f"public/pets/{species}-whole-v4-flow.bin"
        output.write_bytes(binary)
        updated = copy.deepcopy(meta)
        updated.update(version=4, stride=STRIDES[species], flow={"version": 1, "size": FIELD_SIZE,
                       "frameSize": SIZE, "encoding": "signed-one-pixel-rgba", "pairs": pairs,
                       "sourcePairs": [entry["pair"] for entry in exclusions], "asset": f"pets/{output.name}"})
        (root / f"public/pets/{species}-whole-v4.json").write_text(json.dumps(updated, indent=2) + "\n")
        qa["species"][species] = {"pairCount": len(pairs), "binaryBytes": len(binary), "binarySha256": sha(output),
                                  "v3MetadataSha256": sha(root / f"public/pets/{species}-whole-v3.json"),
                                  "generationSeconds": round(time.perf_counter() - t, 6), "pairs": diagnostics,
                                  "sourcePairs": exclusions, "clipCoverage": clip_coverage(meta, pairs, exclusions)}
        print(json.dumps({"species": species, "pairs": len(pairs), "bytes": len(binary), "seconds": qa["species"][species]["generationSeconds"]}), flush=True)
    if sources != {str(path.relative_to(root)): sha(path) for path in sorted((root / "public/pets").glob("*.png"))}:
        raise ValueError("Source PNG changed during numerical generation")
    qa["totalGenerationSeconds"] = round(time.perf_counter() - started, 6)
    (root / "docs/whole-flow-qa.json").write_text(json.dumps(qa, indent=2) + "\n")
    print(json.dumps({"totalSeconds": qa["totalGenerationSeconds"], "sourcePngHashesUnchanged": True}), flush=True)


if __name__ == "__main__":
    main()
