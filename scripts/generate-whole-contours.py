#!/usr/bin/env python3
"""Bake optional v6 RGB65 coverage from frozen, actual GPU warped layers.

This changes interpolation coverage, never the photographic source or measured
flow field. A bake is construction evidence; final GPU and visual review remain
required. The algorithm reproduces the reviewed private compositor SHA256
e87a47808f5c0215e588bbf6054fd60c315acb08175ff87d3972375bbd2a78db.

Manifest: {"pairs":[{"pair":[a,b],"samples":[{"first":{"path":...,"sha256":...},
"second":{"path":...,"sha256":...}} ...65]}]}. Sample index/64 is its phase;
indices0/64 must contain the true shared canonical endpoint in both inputs.
Paths are relative to the manifest or absolute. Output is an inactive artifact.
"""
import argparse
import hashlib
from io import BytesIO
import json
from pathlib import Path
import sys

import cv2
import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
cv2.setNumThreads(1)


def geometric_source(alpha):
    a = alpha.astype(np.float64) / 255
    inside = (alpha >= 128).astype(np.uint8)
    distance = (cv2.distanceTransform(inside, cv2.DIST_L2, 5)
                - cv2.distanceTransform(1 - inside, cv2.DIST_L2, 5)).astype(np.float64)
    # Near-opaque photographic interiors often have alpha253 everywhere. They
    # retain their true interior distance, and their original opacity separately.
    core = (alpha >= 230) & (distance > 2)
    partial = (alpha > 0) & (alpha < 255) & ~core
    distance[partial] = 2 * a[partial] - 1
    coverage = a.copy()
    coverage[core] = 1
    return distance, coverage, core


def nearest_opaque_color(rgba):
    opaque = rgba[:, :, 3] >= 128
    if not opaque.any():
        raise ValueError('No opaque donor surface')
    _, labels = cv2.distanceTransformWithLabels(
        (~opaque).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    colors = np.zeros((int(labels.max()) + 1, 3), np.float64)
    colors[labels[opaque]] = rgba[:, :, :3][opaque] / 255
    return colors[labels]


def compose(a, b, t):
    if t == 0:
        return a.copy()
    if t == 1:
        return b.copy()
    aa, ab = a[:, :, 3].astype(np.float64) / 255, b[:, :, 3].astype(np.float64) / 255
    da, ca, _ = geometric_source(a[:, :, 3])
    db, cb, _ = geometric_source(b[:, :, 3])
    geometry = np.clip(((1 - t) * da + t * db + 1) / 2, 0, 1)
    actual_alpha = (1 - t) * aa + t * ab
    donor_coverage = (1 - t) * ca + t * cb
    opacity = np.divide(actual_alpha, donor_coverage, out=np.ones_like(actual_alpha),
                        where=donor_coverage > 1e-8)
    alpha = geometry * np.clip(opacity, 0, 1)
    premul = ((1 - t) * a[:, :, :3].astype(np.float64) / 255 * aa[:, :, None]
              + t * b[:, :, :3].astype(np.float64) / 255 * ab[:, :, None])
    color = np.divide(premul, actual_alpha[:, :, None], out=np.zeros_like(premul),
                      where=actual_alpha[:, :, None] > 1e-8)
    fill = (alpha > 0) & (actual_alpha <= 1e-8)
    if fill.any():
        color[fill] = ((1 - t) * nearest_opaque_color(a) + t * nearest_opaque_color(b))[fill]
    rgba = np.zeros_like(a)
    rgba[:, :, :3] = np.clip(np.floor(color * 255 + .5), 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.clip(np.floor(alpha * 255 + .5), 0, 255).astype(np.uint8)
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return rgba


def pack_coverage(alphas):
    if len(alphas) != 65 or any(a.shape != (256, 256) or a.dtype != np.uint8 for a in alphas):
        raise ValueError('Expected65 native256 uint8 coverage planes')
    packed = np.zeros((1560, 1040, 3), np.uint8)
    for i, alpha in enumerate(alphas):
        cell, channel = i // 3, i % 3
        x, y = (cell % 4) * 260, (cell // 4) * 260
        packed[y:y + 260, x:x + 260, channel] = np.pad(alpha, 2, mode='edge')
    return packed


def digest(data):
    return hashlib.sha256(data).hexdigest()


def frozen_image(record, directory):
    path = directory / record['path']
    data = path.read_bytes()
    if digest(data) != record['sha256']:
        raise ValueError(f'Frozen warped layer changed: {path}')
    with Image.open(BytesIO(data)) as image:
        if image.size != (256, 256):
            raise ValueError('Expected actual native256 GPU warped layer')
        return np.array(image.convert('RGBA'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    raw = args.manifest.read_bytes()
    manifest = json.loads(raw)
    args.output.mkdir(parents=True, exist_ok=True)
    report = {'scope': 'Inactive coverage construction only; no visual or final-GPU acceptance.',
              'manifestSha256': digest(raw), 'generatorSha256': digest(Path(__file__).read_bytes()),
              'pairs': []}
    seen = set()
    for entry in manifest['pairs']:
        pair = entry['pair']
        key = tuple(sorted(pair))
        if len(pair) != 2 or pair[0] == pair[1] or key in seen or len(entry['samples']) != 65:
            raise ValueError('Expected unique measured pair and all65 frozen phases')
        seen.add(key)
        alphas, samples = [], []
        for i, sample in enumerate(entry['samples']):
            a = frozen_image(sample['first'], args.manifest.parent)
            b = frozen_image(sample['second'], args.manifest.parent)
            if i in (0, 64) and not np.array_equal(a, b):
                raise ValueError('Endpoint must use one exact shared canonical frame')
            rgba = compose(a, b, i / 64)
            if not np.array_equal(rgba, compose(b, a, 1 - i / 64)):
                raise ValueError('Reverse coverage differs')
            alphas.append(rgba[:, :, 3])
            samples.append({'phase': i / 64, 'rgbaSha256': digest(rgba.tobytes()),
                            'inputs': sample})
        asset = args.output / f'{pair[0]}-{pair[1]}-coverage65.png'
        Image.fromarray(pack_coverage(alphas)).save(asset)
        report['pairs'].append({'pair': pair, 'samples': samples,
            'atlasSha256': digest(asset.read_bytes()), 'descriptor': {
                'version': 1, 'pair': pair, 'asset': str(asset.resolve()),
                'encoding': 'opaque-rgb-temporal-coverage', 'samples': 65,
                'frameSize': 256, 'columns': 4, 'rows': 6, 'gutter': 2,
                'sourceSize': [1040, 1560]}})
    (args.output / 'coverage-bake-qa.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'pairs': len(report['pairs']), 'samplesPerPair': 65,
                      'output': str(args.output), 'acceptedPairs': []}))


if __name__ == '__main__':
    main()
