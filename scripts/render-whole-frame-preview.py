from pathlib import Path
import subprocess, html, json, base64

root=Path(__file__).resolve().parent.parent
fragment=root/'.artifacts/whole-frame-local-fragment.html'
target=root/'.artifacts/pet-motion-comparison-preview.html'
renderer=Path('/Users/sucrecao/.codex/plugins/cache/openai-bundled/visualize/1.0.49/skills/visualize/scripts/render.py')
data={};originals={}
for species in ['cat','dog','parrot']:
    meta=json.loads((root/f'public/pets/{species}-whole-v7.json').read_text())
    # Original lossless PNGs keep the local review sharp and its sandboxed
    # canvas readable, with no cross-origin image requests.
    images=[]
    for index,page in enumerate(meta['pages']):
        key=f'__WHOLE_ORIGINAL_{species.upper()}_{index}__'
        originals[key]='data:image/png;base64,'+base64.b64encode((root/'public'/page['asset']).read_bytes()).decode()
        images.append(key)
    data[species]={'meta':meta,'images':images}
template=(root/'.artifacts/whole-frame-preview-template.html').read_text()
fragment.write_text(template.replace('__WHOLE_FRAME_BUNDLE__',(root/'.artifacts/whole-frame-preview-bundle.js').read_text()).replace('__WHOLE_FRAME_DATA__',json.dumps(data,separators=(',',':'))))
subprocess.run(['python3',str(renderer),str(fragment),str(target),'--force','--title','完整原画逐帧动作'],check=True)
# This local review has no tooltip surfaces. Its native controls work without
# the standalone wrapper's optional network tooltip libraries; keep it offline.
text=target.read_text()
for key,source in originals.items():
    text=text.replace(key,source)
for url in ['https://unpkg.com/@floating-ui/core@1.7.3/dist/floating-ui.core.umd.min.js','https://unpkg.com/@floating-ui/dom@1.7.4/dist/floating-ui.dom.umd.min.js']:
    tag=f'<script src="{url}"></script>'
    text=text.replace(tag,'').replace(html.escape(tag,quote=True),'')
target.write_text(text)
print(target)
