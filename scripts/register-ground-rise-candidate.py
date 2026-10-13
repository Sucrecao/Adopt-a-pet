#!/usr/bin/env python3
"""Isolated dog-rise registration/field candidate. Never write public assets.

Registration uses one uniform source scale and whole-character crops. Field
safety and feature checks are screening only; actual GPU anatomy is reviewed
separately. The two rejected sit shortcuts are removed, not source-guarded.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import cv2
import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
PREFIX = ROOT / '.artifacts/realistic-gait-rise-dog'
SOURCE = ROOT / '.artifacts/realistic-gait-prototype/assets/dog-rise-candidate-v1.png'
BASE = ROOT / 'public/pets/dog-whole-v6.json'
TILE_BYTES = 4096
SCALE = .37
PAIRS = [(90, 130), (130, 131), (131, 132), (132, 133), (133, 0)]
REMOVED = {(0, 90), (90, 95)}
NEAR_EYES = [(441, 194), (1088, 194), (474, 775), (1105, 775)]
NEAR_PAW_X = [408, 1037, 426, 1053]
# Manually identified visible fur/face points only. Hidden far-hind structure
# has no asserted correspondence in the sitting source.
SEMANTIC_RISE = [
    ([174,79],[174,75]), ([200,73],[200,69]), ([203,93],[203,89]),
    ([171,49],[171,44]), ([145,86],[143,84]), ([139,112],[137,111]),
    ([188,109],[189,107]), ([210,111],[210,108]),
    ([84,181],[85,124]), ([65,145],[59,86]), ([50,166],[39,108]),
    ([61,184],[52,126]), ([75,192],[65,131]),
    ([112,151],[102,131]), ([103,173],[89,151]), ([100,193],[73,185]),
    ([111,217],[68,215]), ([127,206],[83,208]),
    ([144,141],[144,134]), ([168,168],[168,166]), ([170,221],[165,222]),
    ([194,190],[193,188]), ([201,215],[202,216]),
]
spec = importlib.util.spec_from_file_location('contacts', Path(__file__).with_name('generate-contact-handoffs.py'))
contacts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contacts)
whole = contacts.whole

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def key(pair):
    return tuple(sorted(pair))

def path(suffix):
    return Path(str(PREFIX) + suffix)

def canonical(meta, index):
    frame = meta['frames'][index]
    page = meta['pages'][frame['page']]
    source = Image.open(ROOT / 'public' / page['asset']).convert('RGBA')
    x, y, width, height = frame['rect']
    scale = 256 / max(page['sourceSize'][0] / page['columns'], page['sourceSize'][1] / page['rows']) * page.get('scale', 1)
    dx = (256 - width * scale) / 2 + frame.get('offsetX', 0)
    dy = (256 - height * scale) / 2 + frame.get('offsetY', 0)
    image = source.crop((x, y, x + width, y + height)).transform((256, 256), Image.Transform.AFFINE,
        (1 / scale, 0, -dx / scale, 0, 1 / scale, -dy / scale), resample=Image.Resampling.BICUBIC)
    if frame.get('mirror', 1) < 0:
        image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    return image

def register(base):
    if base['version'] != 6 or len(base['frames']) != 130 or len(base['pages']) != 4:
        raise ValueError('Expected inactive v6 baseline with archive frame129')
    source = np.asarray(Image.open(SOURCE).convert('RGBA'))
    if source.shape != (1254, 1254, 4):
        raise ValueError('Expected pristine RGBA1254 2x2 source')
    meta = copy.deepcopy(base)
    meta['pages'].append({'asset': str(SOURCE), 'sourceSize': [1254, 1254], 'columns': 2, 'rows': 2,
                          'scale': SCALE * 627 / 256})
    registrations = []
    for local in range(4):
        cell_x, cell_y = (local % 2) * 627, (local // 2) * 627
        alpha = source[cell_y:cell_y+627, cell_x:cell_x+627, 3]
        count, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 32).astype(np.uint8))
        component = 1 + int(np.argmax(stats[1:, 4]))
        bx, by, width, height, area = map(int, stats[component])
        if int((alpha > 32).sum()) != area:
            raise ValueError('Source has disconnected visible material')
        left, top = max(cell_x, cell_x + bx - 8), max(cell_y, cell_y + by - 8)
        right, bottom = min(cell_x+627, cell_x+bx+width+8), min(cell_y+627, cell_y+by+height+8)
        eye = NEAR_EYES[local]
        crop_w, crop_h = right-left, bottom-top
        dx = 174 - (eye[0] - left) * SCALE
        # Follow corresponding visible near-fore sole225->224, not the tiny
        # any-alpha fringe at230. This is camera registration, not foot physics.
        paw_x = NEAR_PAW_X[local]
        paw_alpha = source[cell_y+400:cell_y+627, paw_x-45:paw_x+45, 3]
        source_floor = cell_y + 400 + int(np.where(paw_alpha > 128)[0].max()) + 1
        target_floor = 225 - (local+1)/5
        dy = target_floor - (source_floor - top) * SCALE
        frame = {'page': 4, 'rect': [left, top, crop_w, crop_h],
                 'offsetX': dx - (256-crop_w*SCALE)/2,
                 'offsetY': dy - (256-crop_h*SCALE)/2}
        meta['frames'].append(frame)
        registrations.append({'frame': 130+local, 'readingOrder': local, 'alpha32Bbox': [cell_x+bx,cell_y+by,width,height],
            'alpha32Area': area, 'rect': frame['rect'], 'uniformPixelsPerSourcePixel': SCALE,
            'nearEyeSource': eye, 'nearEyeCanonical': [174, dy+(eye[1]-top)*SCALE],
            'nearForeFloorSourceAlpha128': source_floor, 'cameraTargetFloor': target_floor,
            'offsetX': frame['offsetX'], 'offsetY': frame['offsetY']})
    meta['frameCount'] = len(meta['frames'])
    meta['groundRise'] = {'frames': [90,130,131,132,133,0], 'pairDuration': 100}
    if any(key(pair) in REMOVED for pair in meta['flow'].get('sourcePairs', [])):
        raise ValueError('Bad shortcut already appears in sourcePairs; explicit baseline reconciliation required')
    meta['flow']['pairs'] = [pair for pair in meta['flow']['pairs'] if key(pair) not in REMOVED]
    meta['flow']['asset'] = str(path('-candidate.bin'))
    return meta, registrations

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--register-only', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--semantic-repair', action='store_true')
    args = parser.parse_args()
    cv2.setNumThreads(1); cv2.setRNGSeed(0)
    base = json.loads(BASE.read_text())
    base_bytes = (ROOT/'public'/base['flow']['asset']).read_bytes()
    old_tiles = {key(pair): base_bytes[index*TILE_BYTES:(index+1)*TILE_BYTES]
                 for index,pair in enumerate(base['flow']['pairs'])}
    meta, registration = register(base)
    inherited = list(meta['flow']['pairs'])
    report_path = path('-registration-report.json')
    if args.check:
        stored = json.loads(path('-candidate.json').read_text())
        report = json.loads(report_path.read_text())
        data = path('-candidate.bin').read_bytes()
        if report['sourceSha256'] != sha(SOURCE) or report['baselineMetaSha256'] != sha(BASE):
            raise ValueError('Frozen candidate provenance changed')
        if len(stored['frames']) != 134 or len(data) != len(stored['flow']['pairs'])*TILE_BYTES:
            raise ValueError('Candidate frame/tile count differs')
        if stored['flow']['sourcePairs'] != base['flow']['sourcePairs']:
            raise ValueError('Inherited source safeguards changed')
        for index,pair in enumerate(stored['flow']['pairs']):
            if key(pair) in REMOVED: raise ValueError('Rejected shortcut remains in candidate graph')
            if key(pair) in old_tiles and data[index*TILE_BYTES:(index+1)*TILE_BYTES] != old_tiles[key(pair)]:
                raise ValueError('Inherited tile bytes changed')
        if not all(list(pair) in stored['flow']['pairs'] for pair in PAIRS):
            raise ValueError('A requested rising edge did not pass numeric screening')
        frames = contacts.registered_frames(ROOT, stored, set(sum((list(pair) for pair in PAIRS), [])))
        for pair in PAIRS:
            index = stored['flow']['pairs'].index(list(pair)); tile = np.frombuffer(data[index*TILE_BYTES:(index+1)*TILE_BYTES],np.uint8).reshape(32,32,4)
            for direction in (0,1):
                if whole.quantized_geometry(tile[:,:,direction*2:direction*2+2],frames[pair[direction]][1])['folds']:
                    raise ValueError('New rising edge folds foreground')
        print(json.dumps({'check':True,'inheritedByteExact':len(inherited),'newPairs':len(PAIRS),'visualAcceptance':report['visualAcceptance']})); return
    report = {'scope':'Isolated candidate registration; no source/public metadata mutation', 'sourceSha256':sha(SOURCE),
        'baselineMetaSha256':sha(BASE),'baselineBinarySha256':hashlib.sha256(base_bytes).hexdigest(),
        'uniformPixelsPerSourcePixel':SCALE,'registration':registration,
        'removedShortcuts':[{'pair':[90,0],'reason':'Actual GPU rejected direct sit-to-new-neutral: duplicated face/tail'},
                            {'pair':[90,95],'reason':'Actual GPU rejected old standing bridge: duplicate tail'}],
        'sourcePairsPreserved':copy.deepcopy(base['flow']['sourcePairs']), 'inheritedPairs':len(inherited),
        'newPairs':[], 'visualAcceptance':'pending actual GPU review'}
    for index in [90,130,131,132,133,0]:
        image = canonical(meta,index); image.save(path(f'-registered-{index}.png'))
        alpha = np.asarray(image)[:,:,3]
        report.setdefault('registeredFloorDiagnostics',{})[str(index)] = {
            str(threshold):int(np.where(alpha>threshold)[0].max())+1 for threshold in (0,32,128,230)}
    chunks = [old_tiles[key(pair)] for pair in inherited]
    if not args.register_only:
        frames = contacts.registered_frames(ROOT, meta, {index for pair in PAIRS for index in pair})
        for pair in PAIRS:
            try:
                semantic = args.semantic_repair and pair == (130,131)
                if semantic:
                    whole.SEMANTIC_POINTS[('dog',130,131)] = (13,SEMANTIC_RISE)
                    tile,diagnostic = whole.semantic_pair('dog',pair,frames)
                else:
                    tile,diagnostic = whole.measure_pair(frames[pair[0]],frames[pair[1]])
                chunks.append(tile.tobytes());meta['flow']['pairs'].append(list(pair))
                detail={'pair':list(pair),'method':'manual visible-landmark TPS + shared inverse/alpha contour' if semantic else 'measured bidirectional SIFT/DIS + shared inverse/alpha contour',
                    'status':'numeric-safe; visually pending','tileSha256':hashlib.sha256(tile.tobytes()).hexdigest(),**diagnostic}
                if semantic:detail['manualVisibleLandmarks']=SEMANTIC_RISE
            except ValueError as error:
                detail={'pair':list(pair),'status':'numeric-rejected; no tile emitted','reason':str(error)}
            report['newPairs'].append(detail);print(json.dumps(detail),flush=True)
    data=b''.join(chunks)
    path('-candidate.json').write_text(json.dumps(meta,indent=2)+'\n')
    path('-candidate.bin').write_bytes(data)
    report.update({'candidateBinarySha256':hashlib.sha256(data).hexdigest(),'candidateBinaryBytes':len(data),
                   'candidateMetaSha256':sha(path('-candidate.json'))})
    report_path.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'frames':len(meta['frames']),'pages':len(meta['pages']),'inherited':len(inherited),
                     'generated':len(meta['flow']['pairs'])-len(inherited),'registerOnly':args.register_only}),flush=True)

if __name__ == '__main__':main()
