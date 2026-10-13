from pathlib import Path
from PIL import Image
from io import BytesIO
import base64, json, hashlib

ROOT=Path(__file__).resolve().parent.parent
TARGET=Path('/Users/sucrecao/.codex/visualizations/2026/10/11/01a12a9b-2182-7442-8036-02b7741fcaec/pet-motion-comparison.html')
data={}
for species in ['cat','dog','parrot']:
    meta=json.loads((ROOT/f'public/pets/{species}-whole-v7.json').read_text())
    value={'meta':meta,'images':[]}
    for page_index,page in enumerate(meta['pages']):
        image=Image.open(ROOT/'public'/page['asset']).convert('RGBA')
        original_w,original_h=image.size
        target_w=600 if page_index==2 else 512
        target_h=round(original_h*target_w/original_w)
        image=image.resize((target_w,target_h),Image.Resampling.LANCZOS)
        buffer=BytesIO();image.save(buffer,'WEBP',quality=45,method=6)
        value['images'].append('data:image/webp;base64,'+base64.b64encode(buffer.getvalue()).decode())
        sx,sy=target_w/original_w,target_h/original_h
        page['sourceSize']=[target_w,target_h]
        for frame in meta['frames']:
            if frame['page']==page_index:
                x,y,w,h=frame['rect'];frame['rect']=[x*sx,y*sy,w*sx,h*sy]
    data[species]=value
template=(ROOT/'.artifacts/whole-frame-preview-template.html').read_text()
fragment=template.replace('__WHOLE_FRAME_BUNDLE__',(ROOT/'.artifacts/whole-frame-preview-bundle.js').read_text()).replace('__WHOLE_FRAME_DATA__',json.dumps(data,separators=(',',':')))
assert len(fragment.encode())<1_000_000, len(fragment.encode())
assert '<!doctype' not in fragment.lower()
TARGET.write_text(fragment)
(ROOT/'.artifacts/whole-frame-preview-size.json').write_text(json.dumps({'path':str(TARGET),'bytes':len(fragment.encode()),'sha256':hashlib.sha256(fragment.encode()).hexdigest(),'sourceMode':'all original complete frames','previewImages':'uniformly downsampled full atlas pages; production originals unchanged'},indent=2)+'\n')
print(json.dumps({'path':str(TARGET),'bytes':len(fragment.encode())}))
