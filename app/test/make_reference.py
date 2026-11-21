"""Python reference for the JavaScript engine, built from the code of notebook 12 (ONNX parity).

Notebook 12 showed that ONNX Runtime gives the same labels as the PyTorch checkpoints at every E4 point of the 166
validation photos. This script runs that same ONNX pipeline (Pillow resize, labels_at_points, 128 px patches) on the
sample photos, in several shapes, and writes what the JavaScript engine must reproduce:
  - points, stage 1 values and labels, stage 2 logits, final labels and health numbers per photo and grid;
  - the Pillow-resized images (working photo, stage 1 input), for a byte-exact check of the JS resize;
  - numpy default_rng doubles, for a bit-exact check of the JS generator.

usage: python -I -X utf8 test/make_reference.py samples models test/reference
"""
import json, os, sys, time
import numpy as np
import onnxruntime as ort
from PIL import Image

samples_dir, models_dir, out_dir = sys.argv[1:4]
os.makedirs(os.path.join(out_dir, "inputs"), exist_ok=True)
os.makedirs(os.path.join(out_dir, "resized"), exist_ok=True)

# Frozen E4 protocol (notebooks 10 and 12)
grids = {30: (5, 6), 60: (6, 10)}
patch_crop = 128
half = patch_crop // 2
photo_height = 1024
seg_height = 512
edge_margin = 128  # Processed/stage2_patches/settings.json "margin"
point_seed = 0
kepmenlh_bands = [("Buruk", 0.0, 25.0), ("Sedang", 25.0, 50.0), ("Baik", 50.0, 75.0), ("Baik sekali", 75.0, 100.0)]


def kepmenlh_category(percent):
    for name, low, high in kepmenlh_bands[:-1]:
        if percent < high:
            return name
    return kepmenlh_bands[-1][0]


def health_numbers(counts):
    seabed = int(counts[0] + counts[1] + counts[2] + counts[3])
    live = int(counts[0] + counts[1])
    t_live = 100 * live / seabed if seabed > 0 else float("nan")
    p_bleached = 100 * counts[1] / live if live > 0 else float("nan")
    return seabed, t_live, p_bleached


def labels_at_points(logits, ys, xs, out_height, out_width):
    _, h, w = logits.shape
    sy = np.maximum((ys + 0.5) * (h / out_height) - 0.5, 0.0)
    sx = np.maximum((xs + 0.5) * (w / out_width) - 0.5, 0.0)
    y0 = np.minimum(np.floor(sy).astype(np.int64), h - 1)
    x0 = np.minimum(np.floor(sx).astype(np.int64), w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    x1 = np.minimum(x0 + 1, w - 1)
    ly = (sy - y0)[None, :]
    lx = (sx - x0)[None, :]
    values = (logits[:, y0, x0] * (1 - ly) * (1 - lx) + logits[:, y0, x1] * (1 - ly) * lx
              + logits[:, y1, x0] * ly * (1 - lx) + logits[:, y1, x1] * ly * lx)
    return values.argmax(axis=0), values


def photo_points(photo_index, width, rows_n, cols_n):
    rng = np.random.default_rng(point_seed + photo_index)
    inner_height = photo_height - 2 * edge_margin
    inner_width = width - 2 * edge_margin
    offsets = rng.random((rows_n, cols_n, 2))
    rows = np.arange(rows_n).reshape(-1, 1) + offsets[:, :, 0]
    cols = np.arange(cols_n).reshape(1, -1) + offsets[:, :, 1]
    ys = (edge_margin + rows * inner_height / rows_n).astype(np.int64).ravel()
    xs = (edge_margin + cols * inner_width / cols_n).astype(np.int64).ravel()
    return ys, xs


sessions = {
    "stage1": ort.InferenceSession(os.path.join(models_dir, "stage1_segformer_b0.onnx"), providers=["CPUExecutionProvider"]),
    "stage2": ort.InferenceSession(os.path.join(models_dir, "stage2_efficientnet_b0.onnx"), providers=["CPUExecutionProvider"]),
}


def run(image_array, photo_index, case, photo_name):
    h, w = image_array.shape[:2]
    work_w = round(photo_height * w / h)
    resized = {}
    if (w, h) != (work_w, photo_height):
        working = np.array(Image.fromarray(image_array).resize((work_w, photo_height), Image.BILINEAR))
        resized["working"] = working
    else:
        working = image_array
    seg_w = round(seg_height * work_w / photo_height)
    seg_image = np.array(Image.fromarray(working).resize((seg_w, seg_height), Image.BILINEAR))
    resized["seg"] = seg_image
    pixel_values = np.ascontiguousarray(seg_image.transpose(2, 0, 1)[None].astype(np.float32) / 255)
    tick = time.time()
    logits = sessions["stage1"].run(None, {"image": pixel_values})[0]
    stage1_seconds = time.time() - tick

    files = {}
    for kind, array in resized.items():
        name = "{}_{}_{}.png".format(photo_name, case, kind)
        Image.fromarray(array).save(os.path.join(out_dir, "resized", name))
        files[kind] = name

    result = {"case": case, "photo_index": photo_index, "size": [w, h], "working": [work_w, photo_height],
              "seg": [seg_w, seg_height], "stage1_dims": list(logits.shape), "resized": files,
              "stage1_seconds": stage1_seconds, "grids": {}}
    for points, (rows_n, cols_n) in grids.items():
        ys, xs = photo_points(photo_index, work_w, rows_n, cols_n)
        s1, values = labels_at_points(logits[0].astype(np.float64), ys, xs, photo_height, work_w)
        final = np.where(s1 == 1, 3, 4)
        coral = s1 == 0
        s2_logits = np.zeros((0, 3), dtype=np.float32)
        if coral.any():
            patches = np.stack([working[y - half:y + half, x - half:x + half] for y, x in zip(ys[coral], xs[coral])])
            images = np.ascontiguousarray(patches.transpose(0, 3, 1, 2).astype(np.float32) / 255)
            s2_logits = sessions["stage2"].run(None, {"patches": images})[0]
            final[coral] = s2_logits.argmax(axis=1)
        counts = np.bincount(final, minlength=5)
        seabed, t_live, p_bleached = health_numbers(counts)
        result["grids"][points] = {
            "ys": ys.tolist(), "xs": xs.tolist(), "stage1": s1.tolist(), "stage1_values": values.T.tolist(),
            "stage2_logits": s2_logits.tolist(), "final": final.tolist(), "counts": counts.tolist(),
            "t_live": None if np.isnan(t_live) else t_live, "p_bleached": None if np.isnan(p_bleached) else p_bleached, "category": kepmenlh_category(t_live) if seabed > 0 else None,
        }
    return result


manifest = json.load(open(os.path.join(samples_dir, "manifest.json"), encoding="utf-8"))
results = []
for photo in manifest["photos"]:
    original = np.array(Image.open(os.path.join(samples_dir, photo["file"])).convert("RGB"))
    index = photo["validation_index"]
    stem = os.path.splitext(photo["file"])[0]
    crop_width = round(photo_height * 4 / 3)
    crop_left = (original.shape[1] - crop_width) // 2
    crop = np.ascontiguousarray(original[:, crop_left:crop_left + crop_width])
    portrait_left = (original.shape[1] - 768) // 2
    cases = {
        "2:1": (original, photo["file"], samples_dir),
        "4:3 kept": (crop, None, None),  # notebook 11 / 12 variant: centre crop, no resize
        "phone 4:3": (np.array(Image.fromarray(crop).resize((1600, 1200), Image.BICUBIC)), None, None),
        "portrait 3:4": (np.ascontiguousarray(original[:, portrait_left:portrait_left + 768]), None, None),
        "small 2:1": (np.array(Image.fromarray(original).resize((1000, 500), Image.BICUBIC)), None, None),
    }
    for case, (array, file_name, folder) in cases.items():
        if file_name is None:
            file_name = "{}_{}.png".format(stem, case.replace(" ", "_").replace(":", "x"))
            Image.fromarray(array).save(os.path.join(out_dir, "inputs", file_name))
            folder = "inputs"
        else:
            folder = "samples"
        result = run(array, index, case.replace(" ", "_").replace(":", "x"), stem)
        result["case"] = case
        result["input"] = {"folder": folder, "file": file_name}
        results.append(result)
        g30 = result["grids"][30]
        show = lambda v: "-" if v is None else "{:.1f}".format(v)
        print("{} {:13s} {}x{} -> work {}x{}, seg {}x{}: T_live {}, P_bleached {}, {}".format(
            stem, case, *result["size"], *result["working"], *result["seg"], show(g30["t_live"]), show(g30["p_bleached"]),
            g30["category"]))

rng_check = {str(s): [float(v) for v in np.random.default_rng(s).random(120)] for s in list(range(0, 200)) + [2 ** 32 + 7, 10 ** 12]}
with open(os.path.join(out_dir, "reference.json"), "w", encoding="utf-8") as handle:
    json.dump({"onnxruntime": ort.__version__, "numpy": np.__version__, "results": results, "rng": rng_check}, handle)
print("wrote {} photo runs".format(len(results)))
