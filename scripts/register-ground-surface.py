#!/usr/bin/env python3
"""Register accepted ground skins; remeasure every changed neutral endpoint.

The v5 files, PNGs and unaffected field tiles remain immutable. Outputs stay
inactive until every new field and the application renderer pass visual QA.
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

sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('contacts',Path(__file__).with_name('generate-contact-handoffs.py'))
contacts=importlib.util.module_from_spec(spec)
spec.loader.exec_module(contacts)
whole=contacts.whole
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def metadata(species):
    old=json.loads((ROOT/f'public/pets/{species}-whole-v5.json').read_text())
    meta=copy.deepcopy(old)
    meta['version']=6
    meta['frames'].append(copy.deepcopy(old['frames'][0]))
    meta['pages'].append({'asset':f'pets/{species}-ground-v2-neutral.png','sourceSize':[256,256],'columns':1,'rows':1})
    meta['frames'][0]={'page':3,'rect':[0,0,256,256],'offsetX':0,'offsetY':0}
    meta['frames'][128]={**meta['frames'][0],'mirror':-1}
    meta['groundGait']=json.loads((ROOT/f'public/pets/{species}-ground-v2.json').read_text())
    meta['stride']=meta['groundGait']['stride']
    meta['flow']['asset']=f'pets/{species}-whole-v6-flow.bin'
    return old,meta

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    cv2.setNumThreads(1);cv2.setRNGSeed(0)
    report={'version':1,'species':{},'visualAcceptance':'pending actual renderer review'}
    for species in ('cat','dog'):
        old,meta=metadata(species)
        old_bytes=(ROOT/'public'/old['flow']['asset']).read_bytes()
        affected=[i for i,pair in enumerate(meta['flow']['pairs']) if 0 in pair or 128 in pair]
        frames=contacts.registered_frames(ROOT,meta,{f for i in affected for f in meta['flow']['pairs'][i]})
        chunks=[];details=[]
        if args.check:
            stored=json.loads((ROOT/f'public/pets/{species}-whole-v6.json').read_text())
            if stored!=meta:raise ValueError(f'{species} registration differs from frozen inputs')
            data=(ROOT/'public'/meta['flow']['asset']).read_bytes()
            qa=json.loads((ROOT/'docs/ground-surface-assets-qa.json').read_text())['species'][species]
            if sha(ROOT/'public'/meta['flow']['asset'])!=qa['binarySha256']:raise ValueError('Stored binary hash changed')
            if len(data)!=len(meta['flow']['pairs'])*4096:raise ValueError('Stored field length changed')
            for index,pair in enumerate(meta['flow']['pairs']):
                tile=data[index*4096:(index+1)*4096]
                if index not in affected:
                    if tile!=old_bytes[index*4096:(index+1)*4096]:raise ValueError('Unchanged source pair tile changed')
                else:
                    encoded=np.frombuffer(tile,np.uint8).reshape(32,32,4)
                    for direction in (0,1):
                        if whole.quantized_geometry(encoded[:,:,direction*2:direction*2+2],frames[pair[direction]][1])['folds']:
                            raise ValueError(f'{species} {pair}: quantized foreground fold')
            print(json.dumps({'species':species,'remeasured':len(affected),'immutableTiles':len(meta['flow']['pairs'])-len(affected),'check':True}),flush=True)
            continue
        for index,pair in enumerate(meta['flow']['pairs']):
            if index not in affected:
                chunks.append(old_bytes[index*4096:(index+1)*4096]);continue
            tile,diagnostic=whole.measure_pair(frames[pair[0]],frames[pair[1]])
            chunks.append(tile.tobytes())
            details.append({'pair':pair,'fieldIndex':index,'tileSha256':hashlib.sha256(chunks[-1]).hexdigest(),
                            'visualStatus':'pending',**diagnostic})
            print(json.dumps({'species':species,'pair':pair,'numerical':'safe','visual':'pending'}),flush=True)
        data=b''.join(chunks)
        sources={str(p.relative_to(ROOT)):sha(p) for p in (ROOT/f'public/pets/{species}-whole-v5.json',ROOT/'public'/old['flow']['asset'],
            ROOT/'public'/meta['groundGait']['skinAsset'],ROOT/'public'/meta['groundGait']['bodyAsset'],ROOT/'public'/meta['pages'][3]['asset'])}
        report['species'][species]={'binarySha256':hashlib.sha256(data).hexdigest(),'binaryBytes':len(data),
            'remeasuredPairs':details,'immutablePairs':len(meta['flow']['pairs'])-len(affected),'sourceSha256':sources}
        (ROOT/'public'/meta['flow']['asset']).write_bytes(data)
        (ROOT/f'public/pets/{species}-whole-v6.json').write_text(json.dumps(meta,indent=2)+'\n')
    if not args.check:(ROOT/'docs/ground-surface-assets-qa.json').write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__':main()
