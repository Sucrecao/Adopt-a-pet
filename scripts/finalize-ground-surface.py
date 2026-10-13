#!/usr/bin/env python3
"""Assemble reviewed source bridges without regenerating the frozen base.

The manifest explicitly lists accepted field pairs. Candidate source IDs and
pages are remapped into a single atlas; unreviewed candidate fields are ignored.
Use an artifact output first, then the public output only after visual review.
"""
import argparse
import copy
import hashlib
from io import BytesIO
import json
from pathlib import Path
import sys
from PIL import Image

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
TILE = 32 * 32 * 4

def read(path):
    return json.loads((ROOT / path).read_text())

def sha(data):
    return hashlib.sha256(data).hexdigest()

def pair_key(pair):
    return tuple(sorted(pair))

def path_for(asset):
    path = Path(asset)
    return path if path.is_absolute() else ROOT / 'public' / path

def frozen(path,expected):
    data=path.read_bytes()
    if sha(data)!=expected:
        raise ValueError(f'Frozen input differs from the reviewed manifest: {path}')
    return data

def source_fields(meta, data):
    if len(data) != len(meta['flow']['pairs']) * TILE:
        raise ValueError('Candidate field length differs from its pair registry')
    fields = {}
    for index, pair in enumerate(meta['flow']['pairs']):
        key = pair_key(pair)
        if key in fields:
            raise ValueError('Candidate has duplicate unordered field pairs')
        fields[key] = (list(pair), data[index*TILE:(index+1)*TILE])
    return fields

def build(species, entry, output):
    base_meta=frozen(ROOT/entry['baseMeta'],entry['baseMetaSha256'])
    base_flow=frozen(ROOT/entry['baseFlow'],entry['baseFlowSha256'])
    base=json.loads(base_meta)
    meta = copy.deepcopy(base)
    fields = source_fields(base, base_flow)
    contours=[]
    provenance = {'baseMeta':entry['baseMeta'], 'baseFlow':entry['baseFlow'],
        'baseMetaSha256':sha(base_meta),
        'baseFlowSha256':sha(base_flow), 'components':[]}
    copied_pages = []
    accepted_keys = set()
    for component in entry.get('components', []):
        candidate_meta=frozen(ROOT/component['meta'],component['metaSha256'])
        candidate_flow=frozen(ROOT/component['flow'],component['flowSha256'])
        candidate=json.loads(candidate_meta)
        candidate_fields = source_fields(candidate, candidate_flow)
        if candidate['frames'][:130] != base['frames'] or candidate['pages'][:4] != base['pages']:
            raise ValueError(f"{species} {component['name']}: base source registration changed")
        reviews = component.get('reviews', [])
        if not reviews or any(not (ROOT / review).is_file() for review in reviews):
            raise ValueError('Every component needs an explicit saved visual review')
        review_hashes={review:sha(frozen(ROOT/review,component['reviewSha256'][review])) for review in reviews}
        approved = component['acceptedPairs']
        if not approved:
            raise ValueError('An empty component cannot enter the final atlas')
        used = sorted({frame for pair in approved for frame in pair if frame >= 130})
        page_map, frame_map = {}, {i:i for i in range(130)}
        for frame in used:
            if frame >= len(candidate['frames']):
                raise ValueError('Accepted pair references an unregistered source frame')
            source = candidate['frames'][frame]
            if source['page'] < 4:
                raise ValueError('A new source must use a separately registered page')
            page_index = source['page']
            if page_index not in page_map:
                page = copy.deepcopy(candidate['pages'][page_index])
                original = path_for(page['asset'])
                source_bytes=frozen(original,component['sourceSha256'].get(page['asset']))
                filename = f"pets/{species}-whole-v6-{component['name']}-{len(page_map)+1}.png"
                page['asset'] = filename
                page_map[page_index] = len(meta['pages'])
                meta['pages'].append(page)
                copied_pages.append((original, output / filename, source_bytes))
            mapped = copy.deepcopy(source)
            mapped['page'] = page_map[page_index]
            frame_map[frame] = len(meta['frames'])
            meta['frames'].append(mapped)
        changed = []
        for pair in approved:
            key = pair_key(pair)
            if key not in candidate_fields:
                raise ValueError(f'Accepted pair {pair} has no measured field')
            stored_pair, tile = candidate_fields[key]
            mapped = [frame_map[frame] for frame in stored_pair]
            target_key = pair_key(mapped)
            if target_key in accepted_keys:
                raise ValueError('Two components claim the same accepted field')
            accepted_keys.add(target_key)
            fields[target_key] = (mapped,tile)
            changed.append({'candidatePair':stored_pair,'pair':mapped,'tileSha256':sha(tile)})
        approved_keys={pair_key(pair) for pair in approved}
        changed_contours=[]
        contour_keys=set()
        for contour in candidate['flow'].get('contours',[]):
            key=pair_key(contour['pair'])
            if key not in approved_keys:continue
            if key in contour_keys or contour['pair']!=candidate_fields[key][0]:
                raise ValueError('Contour must use its measured field stored orientation exactly once')
            contour_keys.add(key)
            if any(contour.get(k)!=v for k,v in {
                'version':1,'encoding':'opaque-rgb-temporal-coverage','samples':65,
                'frameSize':256,'columns':4,'rows':6,'gutter':2,'sourceSize':[1040,1560],
            }.items()):raise ValueError('Unsupported contour coverage layout')
            original=path_for(contour['asset'])
            data=frozen(original,component.get('contourSha256',{}).get(contour['asset']))
            with Image.open(BytesIO(data)) as image:
                if image.format!='PNG' or list(image.size)!=contour['sourceSize'] or image.convert('RGBA').getchannel('A').getextrema()!=(255,255):
                    raise ValueError('Contour PNG must be the complete opaque RGB coverage atlas')
            mapped=copy.deepcopy(contour)
            mapped['pair']=[frame_map[frame] for frame in contour['pair']]
            mapped['asset']=f"pets/{species}-whole-v6-{component['name']}-contour-{len(changed_contours)+1}.png"
            contours.append(mapped)
            copied_pages.append((original,output/mapped['asset'],data))
            changed_contours.append({'candidatePair':contour['pair'],'pair':mapped['pair'],
                'asset':mapped['asset'],'candidateAsset':contour['asset'],'sha256':sha(data)})
        if any(pair_key(pair) not in contour_keys for pair in component.get('requiresContourPairs',[])):
            raise ValueError('A reviewed topology interval is missing its frozen coverage atlas')
        if component.get('turnClip'):
            track = copy.deepcopy(candidate['clips']['turn'])
            track['frames'] = [frame_map[frame] for frame in track['frames']]
            meta['clips']['turn'] = track
        if component.get('groundRise'):
            rise = copy.deepcopy(candidate['groundRise'])
            rise['frames'] = [frame_map[frame] for frame in rise['frames']]
            meta['groundRise'] = rise
        provenance['components'].append({'name':component['name'],
            'candidateMeta':component['meta'],'candidateMetaSha256':sha(candidate_meta),
            'candidateFlow':component['flow'],'candidateFlowSha256':sha(candidate_flow),
            'frameMap':{str(k):v for k,v in frame_map.items() if k>=130},'fields':changed,
            'contours':changed_contours,'reviews':review_hashes})
    for pair in entry.get('omitPairs', []):
        key=pair_key(pair)
        if key in accepted_keys:
            raise ValueError('An omitted field is also marked accepted')
        fields.pop(key,None)
    remove={pair_key(pair) for pair in entry.get('removeSourcePairs', [])} | accepted_keys
    meta['flow']['sourcePairs']=[pair for pair in base['flow'].get('sourcePairs', []) if pair_key(pair) not in remove]
    ordered=list(fields.values())
    meta['flow']['pairs']=[pair for pair,_ in ordered]
    meta['flow']['asset']=f'pets/{species}-whole-v6-flow.bin'
    if contours:meta['flow']['contours']=contours
    else:meta['flow'].pop('contours',None)
    meta['extraFrameCount']=len(meta['frames'])-130
    binary=b''.join(tile for _,tile in ordered)
    for name in ['turn','rest']:
        track=meta['clips'][name]
        for a,b in zip(track['frames'],track['frames'][1:]):
            if a!=b and pair_key([a,b]) not in fields and pair_key([a,b]) not in {pair_key(p) for p in meta['flow']['sourcePairs']}:
                raise ValueError(f'{name} contains an undeclared rendering interval')
    for a,b in zip(meta.get('groundRise',{}).get('frames',[]),meta.get('groundRise',{}).get('frames',[])[1:]):
        if pair_key([a,b]) not in fields:
            raise ValueError('Rise source sequence contains an unmeasured interval')
    provenance.update({'binarySha256':sha(binary),'binaryBytes':len(binary),
        'frameCount':len(meta['frames']),'pages':len(meta['pages']),
        'omittedPairs':entry.get('omitPairs',[]), 'removedSourcePairs':entry.get('removeSourcePairs',[]),
        'remainingSourceGuards':meta['flow']['sourcePairs'],
        'sourcePages':{str(path.relative_to(output)):sha(data) for _,path,data in copied_pages if '-contour-' not in path.name},
        'contourAssets':{str(path.relative_to(output)):sha(data) for _,path,data in copied_pages if '-contour-' in path.name}})
    return meta,binary,copied_pages,provenance

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    output=ROOT/args.output
    manifest=read(args.manifest)
    report={'version':1,'manifest':str(args.manifest),
        'manifestSha256':sha((ROOT/args.manifest).read_bytes()),'species':{}}
    for species,entry in manifest['species'].items():
        meta,binary,pages,provenance=build(species,entry,output)
        target=output/f'pets/{species}-whole-v6.json'
        flow=output/meta['flow']['asset']
        if args.check:
            if json.loads(target.read_text())!=meta or flow.read_bytes()!=binary:
                raise ValueError('Assembled metadata or fields differ from reviewed component inputs')
            for _,destination,data in pages:
                if destination.read_bytes()!=data:
                    raise ValueError('Assembled source PNG changed')
        else:
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_text(json.dumps(meta,indent=2)+'\n')
            flow.write_bytes(binary)
            for _,destination,data in pages:
                destination.write_bytes(data)
        report['species'][species]=provenance
        print(json.dumps({'species':species,'check':args.check,
            'frames':len(meta['frames']),'pages':len(meta['pages']),'measuredFields':len(meta['flow']['pairs'])}),flush=True)
    if args.check:
        if read(output/'ground-surface-assembly-qa.json')!=report:
            raise ValueError('Assembly provenance differs from reviewed inputs')
    else:(output/'ground-surface-assembly-qa.json').write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__':main()
