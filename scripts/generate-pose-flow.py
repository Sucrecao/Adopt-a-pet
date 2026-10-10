#!/usr/bin/env python3
"""Measure existing registered atlas poses; never rewrite source images.

Offline dependencies: opencv-python-headless, Pillow, numpy. Example:
  /tmp/pawpal-flow-venv/bin/python scripts/generate-pose-flow.py
"""

import argparse
import hashlib
import json
import re
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


FRAME_SIZE = 256
FLOW_SIZE = 64
ENCODING = 'signed-one-pixel-rgba'
CLIPS = (
    (0, 1, 2, 3, 4, 5, 6, 7, 0),
    (8, 9, 10, 11, 8),
    (12, 13, 14, 15),
    (16, 17, 18, 19),
    (20, 21, 22, 23),
)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def registration_tables(root):
    """Read the runtime's authoritative registration without executing JS."""
    source = (root / 'src/core/animation.js').read_text()
    bottoms_match = re.search(r'const frameBottoms\s*=\s*\{(.*?)\};', source, re.S)
    baselines_match = re.search(r'const groundBaseline\s*=\s*\{(.*?)\};', source, re.S)
    if not bottoms_match or not baselines_match:
        raise ValueError('Cannot find runtime sprite registration tables')
    bottoms = {
        name: json.loads(values)
        for name, values in re.findall(r'(cat|dog|parrot):\s*(\[[^\]]+\])', bottoms_match[1])
    }
    baselines = {
        name: int(value)
        for name, value in re.findall(r'(cat|dog|parrot):\s*(\d+)', baselines_match[1])
    }
    if set(bottoms) != {'cat', 'dog', 'parrot'} or set(baselines) != set(bottoms):
        raise ValueError('Incomplete runtime sprite registration tables')
    return bottoms, baselines


def registered_frames(path, species, bottoms, baselines, with_alpha=False):
    with Image.open(path) as image:
        atlas = np.array(image.convert('RGBA'))
    if atlas.shape != (1024, 1536, 4):
        raise ValueError(f'Unexpected atlas size: {path}: {atlas.shape}')
    frames = []
    offsets = []
    alphas = []
    for frame in range(24):
        x, y = frame % 6 * FRAME_SIZE, frame // 6 * FRAME_SIZE
        cell = atlas[y:y + FRAME_SIZE, x:x + FRAME_SIZE]
        offset = 0 if species == 'parrot' and frame < 8 else baselines[species] - bottoms[species][20 if frame == 21 else frame]
        canvas = np.zeros((FRAME_SIZE, FRAME_SIZE, 4), dtype=np.uint8)
        start, end = max(0, offset), min(FRAME_SIZE, FRAME_SIZE + offset)
        canvas[start:end] = cell[start - offset:end - offset]
        # Neutral compositing removes arbitrary hidden RGB from transparent pixels.
        # Alpha edges remain image features, including antialiased contour pixels.
        alpha = canvas[:, :, 3:4].astype(np.float32) / 255
        composite = np.rint(canvas[:, :, :3] * alpha + 128 * (1 - alpha)).astype(np.uint8)
        frames.append(cv2.cvtColor(composite, cv2.COLOR_RGB2GRAY))
        alphas.append(canvas[:, :, 3].copy())
        offsets.append(offset)
    return (frames, offsets, alphas) if with_alpha else (frames, offsets)


def pack_field(field):
    """Downsample spatially without rescaling displacement units."""
    if not np.isfinite(field).all():
        raise ValueError('Nonfinite measured flow')
    small = cv2.resize(field, (FLOW_SIZE, FLOW_SIZE), interpolation=cv2.INTER_AREA)
    encoded = np.floor(128 + np.clip(small, -128, 127) + 0.5).astype(np.uint8)
    return encoded, small


def packed_correspondence_error(encoded, source, target):
    """Check the actual clamped/quantized field at feature coordinates."""
    decoded = cv2.resize(encoded.astype(np.float32) - 128,
                         (FRAME_SIZE, FRAME_SIZE), interpolation=cv2.INTER_LINEAR)
    sampled = cv2.remap(decoded, source[:, 0:1], source[:, 1:2], cv2.INTER_LINEAR).reshape(-1, 2)
    return float(np.median(np.linalg.norm(source + sampled - target, axis=1)))


def feature_initialization(first, second):
    """Find confident foreground feature motion; similar colors can fool DIS."""
    keypoints_a, descriptors_a = first
    keypoints_b, descriptors_b = second
    if descriptors_a is None or descriptors_b is None or len(descriptors_b) < 2:
        return None
    matches = [near for near, far in cv2.BFMatcher().knnMatch(descriptors_a, descriptors_b, k=2)
               if near.distance < .7 * far.distance]
    if len(matches) < 6:
        return None
    source = np.float32([keypoints_a[match.queryIdx].pt for match in matches])
    target = np.float32([keypoints_b[match.trainIdx].pt for match in matches])
    matrix, inliers = cv2.estimateAffinePartial2D(source, target, method=cv2.RANSAC,
                                               ransacReprojThreshold=3, maxIters=3000)
    if matrix is None or inliers is None or not np.isfinite(matrix).all():
        return None
    keep = inliers.ravel() > 0
    count = int(keep.sum())
    scale = float(np.hypot(matrix[0, 0], matrix[1, 0]))
    if count < 6 or count / len(matches) < .4 or not .75 <= scale <= 1.3:
        return None
    return matrix, source[keep], target[keep], count, len(matches)


def measure_direction(first, second, first_features, second_features):
    estimator = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    field = estimator.calc(first, second, None)
    encoded, small = pack_field(field)
    feature_motion = feature_initialization(first_features, second_features)
    selection = None
    if feature_motion is not None:
        matrix, source, target, inliers, matches = feature_motion
        baseline_error = packed_correspondence_error(encoded, source, target)
        # Preserve already-correct fields; a global seed can hurt local motion.
        if baseline_error > 6:
            y, x = np.mgrid[:FRAME_SIZE, :FRAME_SIZE].astype(np.float32)
            coordinates = np.stack((x, y), axis=2)
            initial = (cv2.transform(coordinates.reshape(-1, 1, 2), matrix)
                       .reshape(FRAME_SIZE, FRAME_SIZE, 2) - coordinates).astype(np.float32)
            candidate = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM).calc(first, second, initial)
            candidate_encoded, candidate_small = pack_field(candidate)
            candidate_error = packed_correspondence_error(candidate_encoded, source, target)
            if candidate_error < baseline_error * .5:
                encoded, small = candidate_encoded, candidate_small
                selection = {'inliers': inliers, 'matches': matches,
                             'baselinePackedMedianErrorPx': baseline_error,
                             'selectedPackedMedianErrorPx': candidate_error}
    return encoded, small, selection


def decoded_field(field):
    encoded, _ = pack_field(field)
    return cv2.resize(encoded.astype(np.float32) - 128, (FRAME_SIZE, FRAME_SIZE), interpolation=cv2.INTER_LINEAR)


def mesh_folds(field, alpha, amount=1):
    """Test the same 65×65 vertex topology used by the WebGL renderer."""
    encoded, _ = pack_field(field)
    grid = np.arange(65, dtype=np.float32)
    fy, fx = np.meshgrid(grid, grid, indexing='ij')
    sampled = cv2.remap(encoded.astype(np.float32) - 128, np.clip(fx - .5, 0, 63),
                        np.clip(fy - .5, 0, 63), cv2.INTER_LINEAR)
    points = np.stack((fx * 4, fy * 4), axis=-1) + amount * sampled
    a, b, c, d = points[:-1, :-1], points[1:, :-1], points[:-1, 1:], points[1:, 1:]
    def cross(first, second):
        return first[:, :, 0] * second[:, :, 1] - first[:, :, 1] * second[:, :, 0]
    area1 = -cross(b - a, c - a) / 16
    area2 = -cross(b - c, d - c) / 16
    foreground = alpha.reshape(64, 4, 64, 4).max(axis=(1, 3)) > 20
    return int(np.count_nonzero(((area1 <= .05) | (area2 <= .05)) & foreground))


def inverse_field(field):
    """Invert one smooth correspondence instead of fitting a conflicting map."""
    y, x = np.mgrid[:FRAME_SIZE, :FRAME_SIZE].astype(np.float32)
    coordinates = np.stack((x, y), axis=-1)
    points = coordinates - field
    dx, dy = np.gradient(field, axis=1), np.gradient(field, axis=0)
    for _ in range(35):
        sample = lambda value: cv2.remap(value, points[:, :, 0], points[:, :, 1], cv2.INTER_LINEAR,
                                       borderMode=cv2.BORDER_REPLICATE)
        error = points + sample(field) - coordinates
        gx, gy = sample(dx), sample(dy)
        determinant = np.maximum(.05, (1 + gx[:, :, 0]) * (1 + gy[:, :, 1]) - gx[:, :, 1] * gy[:, :, 0])
        step_x = ((1 + gy[:, :, 1]) * error[:, :, 0] - gy[:, :, 0] * error[:, :, 1]) / determinant
        step_y = ((1 + gx[:, :, 0]) * error[:, :, 1] - gx[:, :, 1] * error[:, :, 0]) / determinant
        points -= np.stack((np.clip(step_x, -10, 10), np.clip(step_y, -10, 10)), axis=-1) * .8
    return points - coordinates


def contour_overlap(field, source_alpha, target_alpha):
    y, x = np.mgrid[:FRAME_SIZE, :FRAME_SIZE].astype(np.float32)
    field = decoded_field(field)
    warped = cv2.remap(target_alpha, x + field[:, :, 0], y + field[:, :, 1], cv2.INTER_LINEAR,
                       borderMode=cv2.BORDER_CONSTANT)
    source, target = source_alpha > 100, warped > 100
    return float(np.count_nonzero(source & target) / max(1, np.count_nonzero(source | target)))


def tail_tip(alpha):
    """Face-right quadruped rising poses have the tail in the left third."""
    rows, columns = np.nonzero((alpha[:, :85] > 160))
    if not len(rows):
        raise ValueError('Missing rising-pose tail alpha')
    top = int(rows.min())
    return np.float32([columns[rows < top + 3].mean(), top])


def anchor_rising_tail(pair, alpha_a, alpha_b, features_a, features_b):
    """Constrain the tail separately from the face affine during a body rise."""
    tips = (tail_tip(alpha_a), tail_tip(alpha_b))
    matches = [feature_initialization(features_a, features_b), feature_initialization(features_b, features_a)]
    y, x = np.mgrid[:FRAME_SIZE, :FRAME_SIZE].astype(np.float32)
    def tip_error(value, source, target):
        return packed_correspondence_error(pack_field(value)[0], source.reshape(1, 2), target.reshape(1, 2))
    before = [tip_error(value, p, q) for value, p, q in zip(pair, tips, reversed(tips))]
    if max(before) < 6:
        return pair, None
    candidates = []
    for sigma in (24, 32, 40, 48, 64):
        anchored = []
        for field, p, q, match in zip(pair, tips, reversed(tips), matches):
            at = cv2.remap(field, np.float32([[p[0]]]), np.float32([[p[1]]]), cv2.INTER_LINEAR).reshape(2)
            correction = q - p - at
            weight = np.exp(-((x - p[0]) ** 2 + (y - p[1]) ** 2) / (2 * sigma ** 2))
            if match is not None:
                protect = np.zeros((FRAME_SIZE, FRAME_SIZE), np.uint8)
                cv2.fillConvexPoly(protect, cv2.convexHull(np.rint(match[1]).astype(np.int32)), 255)
                weight *= 1 - cv2.GaussianBlur(protect.astype(np.float32) / 255, (0, 0), 8)
            anchored.append(field + correction * weight[:, :, None])
        # Prefer a shared inverse where possible; retain explicit endpoint
        # anatomical constraints if its extrapolation loses the tail contour.
        for mode, candidate in (('inverse-forward', (anchored[0], inverse_field(anchored[0]))),
                                ('inverse-backward', (inverse_field(anchored[1]), anchored[1])),
                                ('two-tail-anchors', anchored)):
            if any(mesh_folds(value, alpha, amount) for value, alpha in zip(candidate, (alpha_a, alpha_b))
                   for amount in (.25, .5, .75)):
                continue
            after = [tip_error(value, p, q) for value, p, q in zip(candidate, tips, reversed(tips))]
            if max(after) > 6:
                continue
            errors = [packed_correspondence_error(pack_field(value)[0], match[1], match[2])
                      for value, match in zip(candidate, matches) if match is not None]
            if errors and max(errors) > 6:
                continue
            candidates.append(((mode == 'two-tail-anchors', sigma, max(after)), candidate,
                               {'sourceTip': tips[0].tolist(), 'targetTip': tips[1].tolist(),
                                'tipErrorsBeforePx': before, 'tipErrorsAfterPx': after,
                                'sigmaPx': sigma, 'mode': mode,
                                'maxPackedFeatureMedianPx': max(errors, default=0)}))
    if not candidates:
        raise ValueError('No safe rising-tail correspondence candidate')
    _, candidate, diagnostic = min(candidates, key=lambda value: value[0])
    return candidate, diagnostic


def align_contours(pair, alpha_a, alpha_b, features_a, features_b):
    """Bounded silhouette refinement; accurate face features alone miss ears/tails."""
    overlap_before = [contour_overlap(value, a, b) for value, a, b in
                      zip(pair, (alpha_a, alpha_b), (alpha_b, alpha_a))]
    if min(overlap_before) >= .94:
        return pair, None
    def distance(alpha):
        mask = (alpha > 100).astype(np.uint8)
        return cv2.distanceTransform(mask, cv2.DIST_L2, 5) - cv2.distanceTransform(1 - mask, cv2.DIST_L2, 5)
    source_distance, target_distance = distance(alpha_a), distance(alpha_b)
    gy, gx = np.gradient(target_distance)
    y, x = np.mgrid[:FRAME_SIZE, :FRAME_SIZE].astype(np.float32)
    original = pair[0]
    field = original.copy()
    taper = np.clip((20 - np.abs(source_distance)) / 15, 0, 1)
    taper[source_distance > 8] *= .1
    for _ in range(60):
        sample = lambda value: cv2.remap(value, x + field[:, :, 0], y + field[:, :, 1], cv2.INTER_LINEAR,
                                       borderMode=cv2.BORDER_REPLICATE)
        warped_distance = sample(target_distance)
        error = source_distance - warped_distance
        gradient = np.stack((sample(gx), sample(gy)), axis=-1)
        denominator = np.maximum(1, np.sum(gradient ** 2, axis=-1) + error ** 2 / 16)
        update = error[:, :, None] * gradient / denominator[:, :, None]
        update *= ((np.abs(source_distance) < 20) | (np.abs(warped_distance) < 20))[:, :, None]
        field += np.clip(cv2.GaussianBlur(update, (0, 0), 3), -1, 1) * .8
        field = original + np.clip(cv2.GaussianBlur(field - original, (0, 0), 1), -12, 12) * taper[:, :, None]
    residual = field - original
    matches = [feature_initialization(features_a, features_b), feature_initialization(features_b, features_a)]
    baseline_errors = [packed_correspondence_error(pack_field(value)[0], match[1], match[2])
                       for value, match in zip(pair, matches) if match is not None]
    candidates = []
    for sigma in (2, 4, 8):
        correction = cv2.GaussianBlur(residual, (0, 0), sigma)
        for strength in (1, .5, .25):
            forward = original + correction * strength
            if mesh_folds(forward, alpha_a):
                continue
            candidate = (forward, inverse_field(forward))
            if any(mesh_folds(value, alpha, amount) for value, alpha in zip(candidate, (alpha_a, alpha_b))
                   for amount in (.25, .5, .75)):
                continue
            overlaps = [contour_overlap(value, a, b) for value, a, b in
                        zip(candidate, (alpha_a, alpha_b), (alpha_b, alpha_a))]
            gain = float(np.mean(overlaps) - np.mean(overlap_before))
            if gain < .015 or any(new < old - .01 for new, old in zip(overlaps, overlap_before)):
                continue
            errors = [packed_correspondence_error(pack_field(value)[0], match[1], match[2])
                      for value, match in zip(candidate, matches) if match is not None]
            if errors and max(errors) > min(6, max(baseline_errors) + 1):
                continue
            candidates.append((gain, candidate, {'overlapBefore': overlap_before, 'overlapAfter': overlaps,
                               'correctionSigmaPx': sigma, 'strength': strength,
                               'maxPackedFeatureMedianPx': max(errors, default=0)}))
    if not candidates:
        return pair, None
    _, candidate, diagnostic = max(candidates, key=lambda item: item[0])
    return candidate, diagnostic


def consistent_pair(forward, backward, alpha_a, alpha_b, features_a, features_b):
    """Choose the least-smoothed safe direction and derive its matching inverse."""
    fields = [cv2.resize(value, (FRAME_SIZE, FRAME_SIZE), interpolation=cv2.INTER_LINEAR)
              for value in (forward, backward)]
    matches = [feature_initialization(features_a, features_b), feature_initialization(features_b, features_a)]
    candidates = []
    for reverse, field in enumerate(fields):
        for sigma in (0, 2, 4, 8, 12, 16, 24, 32):
            smooth = cv2.GaussianBlur(field, (0, 0), sigma) if sigma else field.copy()
            source_alpha, target_alpha = (alpha_b, alpha_a) if reverse else (alpha_a, alpha_b)
            if mesh_folds(smooth, source_alpha):
                continue
            inverse = inverse_field(smooth)
            pair = (inverse, smooth) if reverse else (smooth, inverse)
            if any(mesh_folds(value, alpha, amount) for value, alpha in zip(pair, (alpha_a, alpha_b))
                   for amount in (.25, .5, .75)):
                continue
            errors = [packed_correspondence_error(pack_field(value)[0], match[1], match[2])
                      for value, match in zip(pair, matches) if match is not None]
            error = max(errors, default=0)
            candidates.append(((error > 6, sigma, error), pair,
                               {'sourceDirection': 'backward' if reverse else 'forward',
                                'smoothingSigmaPx': sigma, 'maxPackedFeatureMedianPx': error}))
            # If feature alignment survived, extra smoothing only erases motion.
            if error <= 6:
                break
    if not candidates:
        raise ValueError('No consistent, nonfolding foreground correspondence candidate')
    _, pair, diagnostic = min(candidates, key=lambda item: item[0])
    return pair, diagnostic


def pair_list(species):
    paths = CLIPS + (((16, 17, 16, 15),) if species == 'parrot' else ())
    return list(dict.fromkeys((a, b) for path in paths for a, b in zip(path, path[1:]) if a != b))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.root.resolve()
    pets = root / 'public/pets'
    originals = {path: sha256(path) for path in sorted(pets.glob('*.png'))}
    bottoms, baselines = registration_tables(root)
    cv2.setNumThreads(1)
    cv2.setRNGSeed(0)
    results = {}
    for species in ('cat', 'dog', 'parrot'):
        frames, offsets, alphas = registered_frames(pets / f'{species}-motion.png', species, bottoms, baselines, with_alpha=True)
        sift = cv2.SIFT_create()
        features = [sift.detectAndCompute(frame, (alpha > 100).astype(np.uint8) * 255)
                    for frame, alpha in zip(frames, alphas)]
        pairs = pair_list(species)
        tiles = []
        max_displacement = 0.0
        clipped_components = 0
        selected_initializations = []
        consistency_selections = []
        contour_selections = []
        tail_selections = []
        for a, b in pairs:
            measured = []
            for start, end in ((a, b), (b, a)):
                encoded, small, selection = measure_direction(frames[start], frames[end], features[start], features[end])
                if selection is not None:
                    selected_initializations.append({'direction': [start, end], **selection})
                measured.append(small)
            fields, consistency = consistent_pair(*measured, alphas[a], alphas[b], features[a], features[b])
            consistency_selections.append({'pair': [a, b], **consistency})
            if species in ('cat', 'dog') and (a, b) == (17, 18):
                fields, tail = anchor_rising_tail(fields, alphas[a], alphas[b], features[a], features[b])
                if tail is not None:
                    tail_selections.append({'pair': [a, b], **tail})
            else:
                fields, contour = align_contours(fields, alphas[a], alphas[b], features[a], features[b])
                if contour is not None:
                    contour_selections.append({'pair': [a, b], **contour})
            directions = []
            for field in fields:
                encoded, small = pack_field(field)
                max_displacement = max(max_displacement, float(np.abs(small).max()))
                clipped_components += int(np.count_nonzero((small < -128) | (small > 127)))
                directions.append(encoded)
            tiles.append(np.concatenate(directions, axis=2))
        metadata = {'version': 1, 'size': FLOW_SIZE, 'encoding': ENCODING, 'frameSize': FRAME_SIZE, 'pairs': pairs}
        binary = np.stack(tiles).tobytes(order='C')
        expected = len(pairs) * FLOW_SIZE * FLOW_SIZE * 4
        if len(binary) != expected:
            raise ValueError(f'Incorrect flow length: {species}')
        (pets / f'{species}-flow.json').write_text(json.dumps(metadata, separators=(',', ':')) + '\n')
        (pets / f'{species}-flow.bin').write_bytes(binary)
        loaded = json.loads((pets / f'{species}-flow.json').read_text())
        assert loaded['pairs'] == [list(pair) for pair in pairs]
        assert (pets / f'{species}-flow.bin').stat().st_size == expected
        results[species] = {'pairs': len(pairs), 'binaryBytes': expected, 'metadataBytes': (pets / f'{species}-flow.json').stat().st_size,
                            'maxMeasuredComponentPx': max_displacement, 'clippedComponents': clipped_components, 'registrationOffsets': offsets,
                            'binarySha256': sha256(pets / f'{species}-flow.bin'),
                            'selectedAffineInitializations': selected_initializations,
                            'consistentPairSelections': consistency_selections,
                            'contourSelections': contour_selections,
                            'tailSelections': tail_selections}
    if any(sha256(path) != digest for path, digest in originals.items()):
        raise ValueError('Source PNG hash changed during generation')
    print(json.dumps({'opencv': cv2.__version__, 'numpy': np.__version__, 'results': results,
                      'sourcePngHashesUnchanged': {str(path.relative_to(root)): digest for path, digest in originals.items()}}, indent=2))


if __name__ == '__main__':
    main()
