#!/usr/bin/env python3
"""Run the immutable v4 verifier against its recorded source set.

Later versions add PNGs beside v4 sources. A temporary symlink view keeps the
archived producer and its recorded asset-set contract completely unchanged.
"""
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[1]
report=json.loads((ROOT/'docs/whole-flow-qa.json').read_text())
paths=set(report['sourcePngSha256'])
paths.update(('docs/whole-flow-qa.json','docs/whole-flow-rejected-pairs.json'))
for species in ('cat','dog','parrot'):
    paths.update((f'public/pets/{species}-whole-v3.json',f'public/pets/{species}-whole-v4.json',f'public/pets/{species}-whole-v4-flow.bin'))
with tempfile.TemporaryDirectory(prefix='pawpal-pristine-') as temporary:
    view=Path(temporary)
    for name in paths:
        destination=view/name
        destination.parent.mkdir(parents=True,exist_ok=True)
        destination.symlink_to(ROOT/name)
    subprocess.run([sys.executable,str(ROOT/'scripts/generate-whole-flow.py'),'--check','--root',str(view)],check=True)
