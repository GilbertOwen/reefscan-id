"""Rebuilds samples-demo/ (the photos of "Coba dengan foto contoh"), which are data and not kept in git.

Needs samples/ first (python -I -X utf8 test/fetch_samples.py samples 5), then downloads four validation photos with
bleached coral (about 1.2 MB) from the Hugging Face dataset viewer of Coralscapes (Apache-2.0).

usage: python -I -X utf8 scripts/make_demo_samples.py   (from the app folder)
"""
import hashlib, json, os, urllib.request
from PIL import Image

ROWS = "https://datasets-server.huggingface.co/rows?dataset=EPFL-ECEO%2Fcoralscapes&config=default&split=validation&offset={}&length=1"
NAMES = {135: "site6_000001_009800_leftImg8bit.png", 141: "site6_000007_003101_leftImg8bit.png",
         154: "site6_000020_015689_leftImg8bit.png", 159: "site6_000025_020184_leftImg8bit.png"}
ORDER = [101, 141, 159, 154, 135, 102, 103, 4, 100, 0]

os.makedirs("samples-demo", exist_ok=True)
original = {p["validation_index"]: p for p in json.load(open("samples/manifest.json", encoding="utf-8"))["photos"]}
photos = []
for index in ORDER:
    name = "coralscapes_val_{:03d}.jpg".format(index)
    target = os.path.join("samples-demo", name)
    if index in NAMES:
        with urllib.request.urlopen(ROWS.format(index)) as response:
            src = json.load(response)["rows"][0]["row"]["image"]["src"]
        with urllib.request.urlopen(src) as response, open(target, "wb") as handle:
            handle.write(response.read())
        made, original_name = "JPEG from the Hugging Face dataset viewer of Coralscapes", NAMES[index]
    else:
        Image.open(os.path.join("samples", original[index]["file"])).convert("RGB").save(target, quality=90, optimize=True)
        made, original_name = "JPEG quality 90 of the original PNG", original[index]["original_name"]
    data = open(target, "rb").read()
    photos.append({"file": name, "validation_index": index, "original_name": original_name, "bytes": len(data),
                   "sha256": hashlib.sha256(data).hexdigest(), "made": made})
    print(name, len(data))
manifest = json.load(open("samples-demo/manifest.json", encoding="utf-8")) if os.path.isfile("samples-demo/manifest.json") else {}
manifest.update({"source": "EPFL-ECEO/coralscapes on Hugging Face, validation split", "license": "Apache-2.0", "photos": photos})
json.dump(manifest, open("samples-demo/manifest.json", "w", encoding="utf-8"), indent=2)
