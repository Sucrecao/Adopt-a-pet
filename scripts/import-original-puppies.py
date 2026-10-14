#!/usr/bin/env python3
"""Export complete, losslessly decoded original APNG frames and provenance.

Run from any directory; source references and output paths are repository-relative.
Requires Pillow with APNG support. No transformation or resizing is performed.
"""
import hashlib
import json
import math
from pathlib import Path
import shutil

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REFERENCES = ROOT / '.artifacts/couple-puppies-exact/references'
OUTPUT = ROOT / 'public/pets'
FRAME_SIZE = (320, 300)
COLUMNS = 5


def export_species(species, entries, references, output):
    """Export manifest sticker entries in order (excluding the product-main entry)."""
    output.mkdir(parents=True, exist_ok=True)
    clips = []
    for index, entry in enumerate(entries, 1):
        source_path = references / f'{species}-{entry["id"]}.png'
        source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
        with Image.open(source_path) as source:
            if source.size != FRAME_SIZE:
                raise ValueError(f'{source_path}: expected native {FRAME_SIZE}, got {source.size}')
            loop_count = source.info.get('loop', 0)
            first_frame = 1 if source.info.get('default_image', False) else 0
            frame_count = source.n_frames - first_frame
            rows = math.ceil(frame_count / COLUMNS)
            atlas = Image.new('RGBA', (COLUMNS * FRAME_SIZE[0], rows * FRAME_SIZE[1]))
            durations = []
            hashes = []
            for frame_index, source_index in enumerate(range(first_frame, source.n_frames)):
                source.seek(source_index)
                frame = source.convert('RGBA')
                # Pillow composites APNG disposal/blending into the full native canvas.
                # Paste without an alpha mask to preserve even transparent RGB bytes.
                atlas.paste(frame, (frame_index % COLUMNS * FRAME_SIZE[0],
                                    frame_index // COLUMNS * FRAME_SIZE[1]))
                durations.append(source.info['duration'])
                hashes.append(hashlib.sha256(frame.tobytes()).hexdigest())
                if index == 7 and frame_index == 0:
                    frame.save(output / f'{species}-original-v1-neutral.png')
            asset_name = f'{species}-original-v1-{index:02}.png'
            atlas.save(output / asset_name)
            clips.append({
                'id': index,
                'stickerId': entry['id'],
                'asset': f'pets/{asset_name}',
                'sourceSize': list(atlas.size),
                'columns': COLUMNS,
                'rows': rows,
                'frameSize': list(FRAME_SIZE),
                'durations': durations,
                'loopCount': loop_count,
                'sourceUrl': entry['animationUrl'],
                'sourceSha256': source_hash,
                'frameHashes': hashes,
            })
        shutil.copyfile(source_path, output / f'{species}-original-source-{index:02}.png')
    metadata = {
        'version': 1,
        'mode': 'original-apng-v1',
        'species': species,
        'sourceSize': list(FRAME_SIZE),
        'defaultClip': 7,
        'clips': clips,
    }
    (output / f'{species}-original-v1.json').write_text(json.dumps(metadata, indent=2) + '\n')
    return sum(len(clip['durations']) for clip in clips)


def main():
    manifest = json.loads((REFERENCES / 'manifest.json').read_text())
    total = 0
    for species in ('maltese', 'golden'):
        entries = manifest[species][1:]
        if len(entries) != 24:
            raise ValueError(f'{species}: expected 24 sticker entries after product-main')
        frames = export_species(species, entries, REFERENCES, OUTPUT)
        total += frames
        print(f'{species}: {len(entries)} clips, {frames} complete RGBA frames')
    print(f'Total: 48 clips, {total} frames; source APNG copies and clip7 fallbacks exported.')


if __name__ == '__main__':
    main()
