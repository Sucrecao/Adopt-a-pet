#!/usr/bin/env python3
"""Add measured neutral ports without changing pristine sources or v4 assets.

Run with /tmp/pawpal-flow-venv/bin/python. New fields remain visually pending
until independently inspected in the actual GPU renderer; numerical safety
alone does not establish anatomy. --check never rewrites production files.
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
SPECIES = ("cat", "dog", "parrot")
PORTS = (48, 55, 56, 63, 64, 71, 72, 79, 80, 89, 95)
TILE_BYTES = 32 * 32 * 4
spec = importlib.util.spec_from_file_location("whole_flow", Path(__file__).with_name("generate-whole-flow.py"))
whole = importlib.util.module_from_spec(spec)
spec.loader.exec_module(whole)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def key(pair):
    return tuple(sorted(pair))


def proposed_pairs(species):
    pairs = [(0, frame, "care-neutral") for frame in PORTS]
    pairs += [(0, frame, "idle-neutral") for frame in range(1, 12)]
    if species == "dog":
        pairs.append((92, 12, "corrected-sleep-endpoint"))
    if species == "parrot":
        pairs += [(95, 94, "takeoff"), (94, 96, "takeoff"), (127, 94, "landing")]
    else:
        pairs += [(0, 32, "turn-entry"), (47, 128, "turn-exit")]
    return pairs


def updated_meta(base, species, ground=None):
    meta = copy.deepcopy(base)
    meta["version"] = 5
    meta["handoffs"] = {"version": 1, "neutralFrame": 0, "edgeDuration": 180, "settleDuration": 420}
    if species != "parrot":
        mirror = copy.deepcopy(base["frames"][0])
        mirror["mirror"] = -mirror.get("mirror", 1)
        meta["frames"].append(mirror)
        meta["handoffs"]["mirroredNeutralFrame"] = 128
    if species == "dog":
        meta["transitions"]["rest"] = {
            "enter": {"frames": [90, 91, 92], "durations": [100, 100, 100]},
            "exit": {"frames": [92, 91, 90], "durations": [100, 100, 100]},
        }
    if ground is not None:
        if species == "parrot":
            meta.pop("groundGait", None)
        else:
            meta["groundGait"] = copy.deepcopy(ground[species])
            meta["stride"] = ground[species]["stride"]
    meta["flow"]["asset"] = f"pets/{species}-whole-v5-flow.bin"
    return meta


def registered_frames(root, meta, indices):
    """Canonical whole crop, including mirror; PNG bytes are only read."""
    images = [Image.open(root / "public" / page["asset"]).convert("RGBA") for page in meta["pages"]]
    result = {}
    for index in sorted(indices):
        frame = meta["frames"][index]
        page = meta["pages"][frame["page"]]
        x, y, width, height = frame["rect"]
        scale = 256 / max(page["sourceSize"][0] / page["columns"], page["sourceSize"][1] / page["rows"]) * page.get("scale", 1)
        dx = (256 - width * scale) / 2 + frame.get("offsetX", 0)
        dy = (256 - height * scale) / 2 + frame.get("offsetY", 0)
        crop = images[frame["page"]].crop((x, y, x + width, y + height))
        rgba = crop.transform((256, 256), Image.Transform.AFFINE,
                              (1 / scale, 0, -dx / scale, 0, 1 / scale, -dy / scale),
                              resample=Image.Resampling.BICUBIC)
        if frame.get("mirror", 1) < 0:
            rgba = rgba.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        pixels = np.asarray(rgba)
        alpha = pixels[:, :, 3].copy()
        weight = alpha[:, :, None].astype(np.float32) / 255
        neutral = np.rint(pixels[:, :, :3] * weight + 128 * (1 - weight)).astype(np.uint8)
        gray = cv2.cvtColor(neutral, cv2.COLOR_RGB2GRAY)
        features = cv2.SIFT_create().detectAndCompute(gray, (alpha > 100).astype(np.uint8) * 255)
        result[index] = (gray, alpha, features)
    for image in images:
        image.close()
    return result


def source_snapshot(root):
    baseline = json.loads((root / "docs/whole-flow-qa.json").read_text())
    # New versions may add assets. Every recorded v4 source still must match;
    # added v6 sources have their own bound provenance and visual review.
    sources = {name: sha(root / name) for name in baseline["sourcePngSha256"]}
    if sources != baseline["sourcePngSha256"]:
        raise ValueError("Pristine PNGs differ from the frozen v4 sources")
    files = [root / "scripts/generate-whole-flow.py", root / "docs/whole-flow-qa.json"]
    for species in SPECIES:
        path = root / f"public/pets/{species}-whole-v4.json"
        meta = json.loads(path.read_text())
        binary = root / "public" / meta["flow"]["asset"]
        if meta["version"] != 4 or len(meta["frames"]) != 128:
            raise ValueError(f"{species}: unexpected frozen v4 registration")
        if sha(binary) != baseline["species"][species]["binarySha256"]:
            raise ValueError(f"{species}: frozen v4 field bytes changed")
        files.extend((path, binary))
    return sources, {str(path.relative_to(root)): sha(path) for path in files}


def check_existing(root, report, sources, previous, ground=None):
    if report["sourcePngSha256"] != sources or report["sourceV4Sha256"] != previous:
        raise ValueError("Source provenance mismatch")
    if ground is not None and report.get("groundGaitConfigSha256") != sha(root / "docs/ground-gait-config.json"):
        raise ValueError("Ground gait configuration provenance mismatch")
    for species in SPECIES:
        base = json.loads((root / f"public/pets/{species}-whole-v4.json").read_text())
        meta = json.loads((root / f"public/pets/{species}-whole-v5.json").read_text())
        expected = updated_meta(base, species, ground)
        for name in ("version", "pages", "frames", "clips", "transitions", "handoffs"):
            if meta[name] != expected[name]:
                raise ValueError(f"{species}: unexpected {name} mutation")
        if ground is not None and (meta.get("groundGait") != expected.get("groundGait") or meta["stride"] != expected["stride"]):
            raise ValueError(f"{species}: incorrect independently measured ground configuration")
        pairs = [tuple(pair) for pair in meta["flow"]["pairs"]]
        planned = [tuple(pair) for pair in base["flow"]["pairs"]]
        seen = {key(pair) for pair in planned}
        for a, b, _ in proposed_pairs(species):
            if key((a, b)) not in seen:
                planned.append((a, b))
                seen.add(key((a, b)))
        details = report["species"][species]
        count = len(base["flow"]["pairs"])
        if [entry["pair"] for entry in details["newPairs"]] != [list(pair) for pair in planned[count:]]:
            raise ValueError(f"{species}: new pair report mismatch")
        rejected = []
        if report.get("visualReview"):
            binding = report["visualReview"]
            if hashlib.sha256(binding["rawJson"].encode()).hexdigest() != binding["sha256"]:
                raise ValueError("Independent GPU review binding changed")
            review = json.loads(binding["rawJson"])
            if review["binarySha256"][species] != details["candidateBinarySha256"]:
                raise ValueError(f"{species}: GPU review refers to another candidate")
            entries = review["species"][species]
            if [entry["pair"] for entry in entries] != [entry["pair"] for entry in details["newPairs"]]:
                raise ValueError(f"{species}: incomplete independent GPU coverage")
            for entry, diagnostic in zip(entries, details["newPairs"]):
                if entry["status"] not in ("accepted", "rejected") or diagnostic["visualStatus"] != entry["status"]:
                    raise ValueError(f"{species}: unsupported or unbound visual verdict")
            rejected = [entry["pair"] for entry in entries if entry["status"] == "rejected"]
        rejected_keys = {key(pair) for pair in rejected}
        planned = [pair for pair in planned if key(pair) not in rejected_keys]
        if pairs != planned or meta["flow"]["sourcePairs"] != base["flow"]["sourcePairs"] + rejected:
            raise ValueError(f"{species}: invalid declared handoff graph")
        flow = meta["flow"]
        if any(flow.get(name) != value for name, value in
               (("version", 1), ("size", 32), ("frameSize", 256), ("encoding", "signed-one-pixel-rgba"),
                ("asset", f"pets/{species}-whole-v5-flow.bin"))):
            raise ValueError(f"{species}: incorrect runtime field contract")
        data = (root / "public" / flow["asset"]).read_bytes()
        old = (root / "public" / base["flow"]["asset"]).read_bytes()
        if data[:len(old)] != old or len(data) != len(pairs) * TILE_BYTES:
            raise ValueError(f"{species}: v4 copied field bytes or field count changed")
        if hashlib.sha256(data).hexdigest() != details["binarySha256"]:
            raise ValueError(f"{species}: v5 field hash mismatch")
        frames = registered_frames(root, meta, {index for pair in pairs[count:] for index in pair})
        tiles = np.frombuffer(data, np.uint8).reshape(-1, 32, 32, 4)
        diagnostics = {key(entry["pair"]): entry for entry in details["newPairs"]}
        minimum = 1.
        for index in range(count, len(pairs)):
            if report.get("visualReview") and hashlib.sha256(tiles[index].tobytes()).hexdigest() != diagnostics[key(pairs[index])]["candidateTileSha256"]:
                raise ValueError(f"{species} {pairs[index]}: accepted GPU tile changed")
            for direction in (0, 1):
                geometry = whole.quantized_geometry(tiles[index, :, :, direction * 2:direction * 2 + 2], frames[pairs[index][direction]][1])
                minimum = min(minimum, geometry["minimumForegroundAreaRatio"])
                if geometry["folds"]:
                    raise ValueError(f"{species} {pairs[index]}: new foreground folds")
        print(json.dumps({"species": species, "copiedPairs": count, "newPairs": len(pairs) - count,
                          "minimumForegroundAreaRatio": minimum, "visualPending": sum(entry["visualStatus"] == "pending" for entry in details["newPairs"]),
                          "check": True}), flush=True)


def apply_review(root, path, sources, previous, ground):
    report_path = root / "docs/contact-handoff-qa.json"
    report = json.loads(report_path.read_text())
    check_existing(root, report, sources, previous, ground)
    raw = path.read_text()
    review_sha = hashlib.sha256(raw.encode()).hexdigest()
    if report.get("visualReview"):
        if report["visualReview"]["sha256"] != review_sha:
            raise ValueError("Reviewed v5 fields require a new candidate before a changed verdict")
        print(json.dumps({"reviewAlreadyApplied": True}), flush=True)
        return
    review = json.loads(raw)
    if review.get("version") != 1 or set(review.get("species", {})) != set(SPECIES):
        raise ValueError("Expected complete independent GPU review")
    outputs = []
    accepted_total, rejected_total = 0, 0
    for species in SPECIES:
        details = report["species"][species]
        meta_path = root / f"public/pets/{species}-whole-v5.json"
        meta = json.loads(meta_path.read_text())
        binary_path = root / "public" / meta["flow"]["asset"]
        data = binary_path.read_bytes()
        if hashlib.sha256(data).hexdigest() != review["binarySha256"].get(species):
            raise ValueError(f"{species}: independent GPU review is stale")
        entries = review["species"][species]
        if [entry.get("pair") for entry in entries] != [entry["pair"] for entry in details["newPairs"]]:
            raise ValueError(f"{species}: every proposed port must be reviewed exactly once")
        lookup = {key(pair): data[index * TILE_BYTES:(index + 1) * TILE_BYTES] for index, pair in enumerate(meta["flow"]["pairs"])}
        rejected = []
        for entry, diagnostic in zip(entries, details["newPairs"]):
            if entry.get("status") not in ("accepted", "rejected") or not isinstance(entry.get("reason"), str) or len(entry["reason"]) <= 20 \
                    or len(entry.get("evidence", [])) != 3 or entry.get("reversePixelExact") is not True:
                raise ValueError(f"{species}: insufficient actual-GPU decision for {entry.get('pair')}")
            diagnostic["visualStatus"] = entry["status"]
            diagnostic["candidateTileSha256"] = hashlib.sha256(lookup[key(entry["pair"])]).hexdigest()
            if entry["status"] == "rejected":
                rejected.append(entry["pair"])
        rejected_keys = {key(pair) for pair in rejected}
        # The copied v4 prefix cannot be removed by a new-port review.
        if any(key(pair) in rejected_keys for pair in meta["flow"]["pairs"][:details["copiedPairCount"]]):
            raise ValueError("New-port review attempted to reject a frozen v4 field")
        pairs = [pair for pair in meta["flow"]["pairs"] if key(pair) not in rejected_keys]
        accepted_data = b"".join(lookup[key(pair)] for pair in pairs)
        details["candidateBinarySha256"] = details["binarySha256"]
        details["binarySha256"] = hashlib.sha256(accepted_data).hexdigest()
        details["binaryBytes"] = len(accepted_data)
        details["pairCount"] = len(pairs)
        details["acceptedNewPairCount"] = len(entries) - len(rejected)
        details["rejectedNewPairCount"] = len(rejected)
        meta["flow"]["pairs"] = pairs
        meta["flow"]["sourcePairs"] += rejected
        details["sourcePairs"] = meta["flow"]["sourcePairs"]
        accepted_total += details["acceptedNewPairCount"]
        rejected_total += len(rejected)
        outputs += [(binary_path, accepted_data), (meta_path, (json.dumps(meta, indent=2) + "\n").encode())]
    if source_snapshot(root) != (sources, previous):
        raise ValueError("Frozen PNGs or v4 files changed while applying review")
    report["visualReview"] = {"sourceFile": str(path.relative_to(root)), "sha256": review_sha, "rawJson": raw}
    report["visualAcceptance"] = {"acceptedNewPairs": accepted_total, "rejectedSourcePairs": rejected_total,
                                   "status": "all stored new fields independently accepted; rejected optional ports use intact source frames"}
    for destination, data in outputs:
        write_atomic(destination, data)
    write_atomic(report_path, (json.dumps(report, indent=2) + "\n").encode())
    print(json.dumps({"acceptedNewPairs": accepted_total, "rejectedSourcePairs": rejected_total,
                      "sourcePngsAndV4Unchanged": True}), flush=True)


def write_atomic(path, data):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--check", action="store_true")
    action.add_argument("--sync-ground", action="store_true", help="Update only ground config and stride; retain all measured field bytes and review statuses")
    action.add_argument("--apply-review", type=Path, help="Bind independent GPU decisions; remove rejected optional fields and explicitly guard their full-source ports")
    args = parser.parse_args()
    root = args.root.resolve()
    cv2.setNumThreads(1)
    cv2.setRNGSeed(0)
    sources, previous = source_snapshot(root)
    ground = json.loads((root / "docs/ground-gait-config.json").read_text())
    if set(ground) != {"cat", "dog"} or any(ground[species].get("version") != 1
            or ground[species].get("sourceFrame") != 0 or len(ground[species].get("paws", [])) != 4
            or not isinstance(ground[species].get("stride"), (int, float)) or ground[species]["stride"] <= 0
            for species in ("cat", "dog")):
        raise ValueError("Expected independently measured source0 four-paw ground config")
    if args.sync_ground:
        path = root / "docs/contact-handoff-qa.json"
        report = json.loads(path.read_text())
        check_existing(root, report, sources, previous)
        for species in SPECIES:
            meta_path = root / f"public/pets/{species}-whole-v5.json"
            meta = json.loads(meta_path.read_text())
            if species == "parrot":
                meta.pop("groundGait", None)
            else:
                meta["groundGait"] = copy.deepcopy(ground[species])
                meta["stride"] = ground[species]["stride"]
            write_atomic(meta_path, (json.dumps(meta, indent=2) + "\n").encode())
        report["groundGaitConfigSha256"] = sha(root / "docs/ground-gait-config.json")
        write_atomic(path, (json.dumps(report, indent=2) + "\n").encode())
        print(json.dumps({"groundConfigSynced": True, "fieldBytesUnchanged": True}), flush=True)
        return
    if args.apply_review:
        apply_review(root, args.apply_review.resolve(), sources, previous, ground)
        return
    if args.check:
        check_existing(root, json.loads((root / "docs/contact-handoff-qa.json").read_text()), sources, previous, ground)
        return
    existing_report = root / "docs/contact-handoff-qa.json"
    if existing_report.exists() and json.loads(existing_report.read_text()).get("visualReview"):
        raise ValueError("Reviewed v5 fields are frozen; --sync-ground preserves reviewed bytes")
    started = time.perf_counter()
    report = {"version": 1, "baseVersion": 4, "canonicalFrameSize": 256, "flowSize": 32,
              "meshVertices": 33, "opencv": cv2.__version__, "numpy": np.__version__,
              "sourcePngSha256": sources, "sourceV4Sha256": previous,
              "groundGaitConfigSha256": sha(root / "docs/ground-gait-config.json"),
              "visualAcceptance": "pending independent GPU review of every new pair",
              "foldValidation": "Analytic minimum over all t in[0,1] of quantized33x33 foreground triangles",
              "species": {}, "limitations": "Numerical winding and fur correspondence are not anatomical acceptance. All original reviewed v4 guards remain explicit. New fields require independent actual-renderer visual review."}
    outputs = []
    for species in SPECIES:
        species_started = time.perf_counter()
        base = json.loads((root / f"public/pets/{species}-whole-v4.json").read_text())
        meta = updated_meta(base, species, ground)
        pairs = [tuple(pair) for pair in base["flow"]["pairs"]]
        seen = {key(pair) for pair in pairs}
        proposed = [(a, b, purpose) for a, b, purpose in proposed_pairs(species) if key((a, b)) not in seen]
        frames = registered_frames(root, meta, {i for a, b, _ in proposed for i in (a, b)})
        original = (root / "public" / base["flow"]["asset"]).read_bytes()
        chunks, diagnostics = [original], []
        for a, b, purpose in proposed:
            pair_started = time.perf_counter()
            try:
                tile, diagnostic = whole.measure_pair(frames[a], frames[b])
            except ValueError as error:
                raise ValueError(f"{species} handoff {a}->{b}: {error}") from error
            pairs.append((a, b))
            chunks.append(tile.tobytes(order="C"))
            diagnostics.append({"pair": [a, b], "purpose": purpose, "visualStatus": "pending",
                                "seconds": round(time.perf_counter() - pair_started, 6), **diagnostic})
            print(json.dumps({"species": species, "pair": [a, b], "purpose": purpose, "numerical": "safe", "visual": "pending"}), flush=True)
        data = b"".join(chunks)
        meta["flow"]["pairs"] = pairs
        report["species"][species] = {"copiedPairCount": len(base["flow"]["pairs"]), "pairCount": len(pairs),
                                       "binaryBytes": len(data), "binarySha256": hashlib.sha256(data).hexdigest(),
                                       "newPairs": diagnostics, "sourcePairs": base["flow"]["sourcePairs"],
                                       "generationSeconds": round(time.perf_counter() - species_started, 6)}
        outputs += [(root / "public" / meta["flow"]["asset"], data),
                    (root / f"public/pets/{species}-whole-v5.json", (json.dumps(meta, indent=2) + "\n").encode())]
    if source_snapshot(root) != (sources, previous):
        raise ValueError("Frozen sources or v4 files changed during measurement")
    report["totalGenerationSeconds"] = round(time.perf_counter() - started, 6)
    for path, data in outputs:
        write_atomic(path, data)
    write_atomic(root / "docs/contact-handoff-qa.json", (json.dumps(report, indent=2) + "\n").encode())
    print(json.dumps({"newPairCount": sum(len(value["newPairs"]) for value in report["species"].values()),
                      "totalSeconds": report["totalGenerationSeconds"], "pristineSources": True, "visual": "pending"}), flush=True)


if __name__ == "__main__":
    main()
