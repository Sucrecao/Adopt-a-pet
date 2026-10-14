"""Inspect original finite Electron surfaces; does not edit source images."""
from pathlib import Path
import hashlib
import json
import sys
import numpy as np
from PIL import Image

folders = [Path(value) for value in sys.argv[1:]] or [Path(".artifacts/line-pets") / f"visual-desktop-{species}" for species in ("cat", "dog")]
for folder in folders:
    report = json.loads((folder / "report.json").read_text())
    species = report["species"]
    assert report["status"] == "passed" and report["profileRemoved"]
    scale = report["native"]["display"]["scaleFactor"]
    hold_a, hold_b = report["scenarios"][:2]
    assert hold_a["surface"]["bounds"] == hold_b["surface"]["bounds"]
    requested = hold_b["rows"][-1]["origin"]["x"] - hold_a["rows"][-1]["origin"]["x"]
    values, images = [], []
    for name in ("hold-A.png", "hold-B.png"):
        image = np.asarray(Image.open(folder / name).convert("RGBA"))
        images.append(image)
        alpha = image[:, :, 3].astype(float)
        y, x = np.indices(alpha.shape)
        bbox = Image.fromarray(image[:, :, 3]).getbbox()
        corners = all(image[y, x, 3] == 0 for y, x in ((0, 0), (0, image.shape[1]-1), (image.shape[0]-1, 0), (image.shape[0]-1, image.shape[1]-1)))
        assert corners and bbox and bbox[0] > 0 and bbox[1] > 0 and bbox[2] < image.shape[1] and bbox[3] < image.shape[0]
        values.append({"file": name, "sha256": hashlib.sha256((folder / name).read_bytes()).hexdigest(),
                       "alphaMass": float(alpha.sum()), "alphaBBox": bbox, "cornersTransparent": corners,
                       "centroidDip": [float((alpha*x).sum()/alpha.sum()/scale), float((alpha*y).sum()/alpha.sum()/scale)]})
    delta = [values[1]["centroidDip"][i]-values[0]["centroidDip"][i] for i in range(2)]
    assert abs(delta[0]-requested) < .03 and abs(delta[1]) < .01
    proof = {"kind": "Captured Electron surface pixels; no hardware scanout claim", "species": species,
             "surfacePixels": [images[0].shape[1], images[0].shape[0]], "displayScaleFactor": scale,
             "holds": values, "requestedOriginDeltaDip": requested, "pixelCentroidDeltaDip": delta,
             "differentRGBAChannels": int(np.count_nonzero(images[0] != images[1]))}
    (folder / "surface-proof.json").write_text(json.dumps(proof, indent=2)+"\n")
    print(json.dumps({"species": species, "requestedDip": requested, "observedDip": delta[0], "status": "passed"}))
