"""Verify original exports against independently decoded APNG references."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import tempfile
import unittest

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REFERENCES = ROOT / '.artifacts/couple-puppies-exact/references'
PUBLIC = ROOT / 'public'


class OriginalAssetsTest(unittest.TestCase):
    def test_all_original_frames_and_metadata(self):
        manifest = json.loads((REFERENCES / 'manifest.json').read_text())
        counts = {}
        for species in ('maltese', 'golden'):
            metadata_path = PUBLIC / f'pets/{species}-original-v1.json'
            self.assertTrue(metadata_path.exists(), f'Missing original export: {metadata_path}')
            metadata = json.loads(metadata_path.read_text())
            self.assertEqual({key: metadata[key] for key in ('version', 'mode', 'species', 'sourceSize', 'defaultClip')},
                             dict(version=1, mode='original-apng-v1', species=species, sourceSize=[320, 300], defaultClip=7))
            entries = manifest[species][1:]
            self.assertEqual(len(entries), 24)
            self.assertEqual(len(metadata['clips']), 24)
            counts[species] = 0
            for index, (entry, clip) in enumerate(zip(entries, metadata['clips']), 1):
                source_path = REFERENCES / f'{species}-{entry["id"]}.png'
                source_bytes = source_path.read_bytes()
                self.assertEqual((PUBLIC / f'pets/{species}-original-source-{index:02}.png').read_bytes(), source_bytes)
                self.assertEqual(clip['id'], index)
                self.assertEqual(clip['stickerId'], entry['id'])
                self.assertEqual(clip['sourceUrl'], entry['animationUrl'])
                self.assertEqual(clip['sourceSha256'], hashlib.sha256(source_bytes).hexdigest())
                self.assertEqual(clip['asset'], f'pets/{species}-original-v1-{index:02}.png')
                self.assertEqual(clip['columns'], 5)
                self.assertEqual(clip['frameSize'], [320, 300])
                with Image.open(source_path) as source, Image.open(PUBLIC / clip['asset']) as atlas:
                    self.assertEqual(source.size, (320, 300))
                    first = 1 if source.info.get('default_image', False) else 0
                    frame_count = source.n_frames - first
                    self.assertEqual(clip['loopCount'], source.info.get('loop', 0))
                    self.assertEqual(clip['rows'], math.ceil(frame_count / 5))
                    self.assertEqual(clip['sourceSize'], [1600, clip['rows'] * 300])
                    self.assertEqual(atlas.size, tuple(clip['sourceSize']))
                    self.assertEqual(atlas.mode, 'RGBA')
                    self.assertEqual(len(clip['durations']), frame_count)
                    self.assertEqual(len(clip['frameHashes']), frame_count)
                    for frame_index, source_index in enumerate(range(first, source.n_frames)):
                        with self.subTest(species=species, clip=index, frame=frame_index):
                            source.seek(source_index)
                            expected = source.convert('RGBA').tobytes()
                            x, y = frame_index % 5 * 320, frame_index // 5 * 300
                            actual = atlas.crop((x, y, x + 320, y + 300)).tobytes()
                            self.assertEqual(actual, expected)
                            self.assertEqual(clip['frameHashes'][frame_index], hashlib.sha256(expected).hexdigest())
                            self.assertEqual(clip['durations'][frame_index], source.info['duration'])
                            if index == 7 and frame_index == 0:
                                with Image.open(PUBLIC / f'pets/{species}-original-v1-neutral.png') as neutral:
                                    self.assertEqual(neutral.size, (320, 300))
                                    self.assertEqual(neutral.convert('RGBA').tobytes(), expected)
                            counts[species] += 1
                    for unused in range(frame_count, clip['rows'] * 5):
                        x, y = unused % 5 * 320, unused // 5 * 300
                        self.assertEqual(atlas.crop((x, y, x + 320, y + 300)).tobytes(), bytes(320 * 300 * 4))
        self.assertEqual(sum(counts.values()), 741)
        print(f'Verified {sum(counts.values())} exact RGBA crops: {counts}; all 48 delays/repeats/source copies and 2 fallbacks match.')

    def test_default_image_is_excluded_and_unequal_delays_are_preserved(self):
        script = ROOT / 'scripts/import-original-puppies.py'
        self.assertTrue(script.exists(), 'Missing original importer')
        spec = importlib.util.spec_from_file_location('original_importer', script)
        importer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(importer)
        with tempfile.TemporaryDirectory() as directory:
            refs = Path(directory) / 'references'
            output = Path(directory) / 'pets'
            refs.mkdir()
            fallback = Image.new('RGBA', (320, 300), (255, 0, 0, 255))
            first = Image.new('RGBA', (320, 300), (0, 255, 0, 255))
            second = Image.new('RGBA', (320, 300), (0, 0, 255, 255))
            fallback.save(refs / 'fixture-123.png', save_all=True, append_images=[first, second],
                          default_image=True, duration=[50, 100], loop=0)
            importer.export_species('fixture', [{'id': '123', 'animationUrl': 'fixture://123'}], refs, output)
            metadata = json.loads((output / 'fixture-original-v1.json').read_text())
            clip = metadata['clips'][0]
            self.assertEqual(clip['durations'], [50, 100])
            self.assertEqual(clip['loopCount'], 0)
            with Image.open(output / 'fixture-original-v1-01.png') as atlas:
                self.assertEqual(atlas.crop((0, 0, 320, 300)).tobytes(), first.tobytes())
                self.assertEqual(atlas.crop((320, 0, 640, 300)).tobytes(), second.tobytes())


if __name__ == '__main__':
    unittest.main()
