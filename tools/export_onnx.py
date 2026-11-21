"""Export the ReefScan-ID cascade (stage 1 SegFormer-B0, stage 2 EfficientNet-B0) to ONNX for the app,
then check that ONNX Runtime gives the same outputs as PyTorch and time both on this CPU.

Usage:
    python tools/export_onnx.py --stage1 models/downloads/stage1/best.pt \
                                --stage2 models/downloads/stage2_both/best.pt --out models/onnx

What the ONNX files expect (the app does the rest, as in notebook 10):
    stage1: "image"   float32 [1, 3, H, W], RGB in 0..1, the photo at half size (512 high, width keeps the ratio)
            -> "logits" float32 [1, 3, H/4, W/4], classes coral, substrate, other.
               The app upsamples the logits bilinearly (align_corners=False) to the full photo and takes the
               class with the highest value at each point.
    stage2: "patches" float32 [N, 3, 128, 128], RGB in 0..1, 128 px cut from the full-size photo around each coral point
            -> "logits" float32 [N, 3], classes healthy, bleached, dead,
               "cam"    float32 [N, 3, 7, 7], class activation map per class (for the explanation view;
                        its 7x7 mean plus the last layer's bias equals the logit).
    ImageNet normalisation and the 128 -> 224 resize are inside the ONNX graphs.

Drafted with AI assistance (Claude); record it in the AI usage log.
"""
import argparse
import hashlib
import json
import os
import pickle
import time

import numpy as np
import onnx
import onnxruntime as ort
import torch
import torch.nn.functional as F
from torch import nn
from torchvision.models import efficientnet_b0
from transformers import SegformerConfig, SegformerForSemanticSegmentation

MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]
STAGE1_CLASSES = ["coral", "substrate", "other"]
STAGE2_CLASSES = ["healthy", "bleached", "dead"]
EXPECTED = {"stage1_epoch": 37, "stage2_epoch": 9, "stage2_source": "both"}


def load_checkpoint(path, trust):
    # weights_only=True refuses arbitrary pickled code; --trust-checkpoint is only for files from the team's Drive
    try:
        return torch.load(path, map_location="cpu", weights_only=True)
    except pickle.UnpicklingError as error:
        if not trust:
            raise SystemExit("{} needs objects that weights_only=True refuses:\n{}\n"
                             "If the file came from the team's Drive, rerun with --trust-checkpoint".format(path, error))
        print("Loading {} with weights_only=False (--trust-checkpoint)".format(path))
        return torch.load(path, map_location="cpu", weights_only=False)


class Stage1(nn.Module):
    def __init__(self, segformer):
        super().__init__()
        self.segformer = segformer
        self.register_buffer("mean", torch.tensor(MEAN).view(1, 3, 1, 1))
        self.register_buffer("std", torch.tensor(STD).view(1, 3, 1, 1))

    def forward(self, image):
        return self.segformer(pixel_values=(image - self.mean) / self.std).logits


class Stage2(nn.Module):
    def __init__(self, efficientnet):
        super().__init__()
        self.efficientnet = efficientnet
        self.register_buffer("mean", torch.tensor(MEAN).view(1, 3, 1, 1))
        self.register_buffer("std", torch.tensor(STD).view(1, 3, 1, 1))

    def forward(self, patches):
        resized = F.interpolate(patches, size=(224, 224), mode="bilinear", align_corners=False)
        # Same steps as torchvision's EfficientNet.forward, with the feature map kept for the CAM
        features = self.efficientnet.features((resized - self.mean) / self.std)
        pooled = torch.flatten(self.efficientnet.avgpool(features), 1)
        logits = self.efficientnet.classifier(pooled)
        # Class activation map: the last layer's weights applied at every 7x7 position (bias left out);
        # its mean over the positions plus the bias equals the logit
        weight = self.efficientnet.classifier[1].weight
        cam = torch.einsum("nkhw,ck->nchw", features, weight)
        return logits, cam


def build_stage1(state):
    config = SegformerConfig(num_labels=3, id2label=dict(enumerate(STAGE1_CLASSES)),
                             label2id={name: i for i, name in enumerate(STAGE1_CLASSES)})
    model = SegformerForSemanticSegmentation(config)
    model.load_state_dict(state["model"], strict=True)
    return Stage1(model).eval()


def build_stage2(state):
    model = efficientnet_b0(weights=None)
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, 3)
    model.load_state_dict(state["model"], strict=True)
    return Stage2(model).eval()


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def timed(function, repeats=5):
    function()  # warm-up
    times = []
    for _ in range(repeats):
        start = time.perf_counter()
        function()
        times.append(time.perf_counter() - start)
    return float(np.median(times))


def smooth_image(height, width, seed):
    # Low-frequency colours, closer to a photo than white noise, so argmax ties are rare
    rng = np.random.default_rng(seed)
    small = rng.random((1, 3, max(2, height // 64), max(2, width // 64)), dtype=np.float32)
    return F.interpolate(torch.from_numpy(small), size=(height, width), mode="bicubic", align_corners=False).clamp(0, 1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage1", required=True)
    parser.add_argument("--stage2", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--trust-checkpoint", action="store_true")
    parser.add_argument("--opset", type=int, default=17)
    parser.add_argument("--allow-other-checkpoints", action="store_true",
                        help="export even if the epochs or the stage 2 source differ from the frozen E4 protocol")
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    torch.manual_seed(0)

    state1 = load_checkpoint(args.stage1, args.trust_checkpoint)
    state2 = load_checkpoint(args.stage2, args.trust_checkpoint)
    checks = {
        "stage 1 epoch": (state1.get("epoch"), EXPECTED["stage1_epoch"]),
        "stage 2 epoch": (state2.get("epoch"), EXPECTED["stage2_epoch"]),
        "stage 2 source": (state2.get("source"), EXPECTED["stage2_source"]),
    }
    for name, (found, expected) in checks.items():
        print("{}: {} (expected {}): {}".format(name, found, expected, found == expected))
    if not all(found == expected for found, expected in checks.values()) and not args.allow_other_checkpoints:
        raise SystemExit("These are not the frozen E4 checkpoints; rerun with --allow-other-checkpoints to export them anyway")
    used = {name: found for name, (found, _) in checks.items()}
    stage1 = build_stage1(state1)
    stage2 = build_stage2(state2)
    del state1, state2
    print("Stage 1 parameters: {:,} | stage 2 parameters: {:,}".format(
        sum(p.numel() for p in stage1.parameters()), sum(p.numel() for p in stage2.parameters())))

    paths = {"stage1": os.path.join(args.out, "stage1_segformer_b0.onnx"),
             "stage2": os.path.join(args.out, "stage2_efficientnet_b0.onnx")}
    with torch.no_grad():
        torch.onnx.export(stage1, (torch.rand(1, 3, 512, 682),), paths["stage1"], dynamo=False,
                          input_names=["image"], output_names=["logits"], opset_version=args.opset,
                          dynamic_axes={"image": {2: "height", 3: "width"}, "logits": {2: "height_4", 3: "width_4"}})
        torch.onnx.export(stage2, (torch.rand(30, 3, 128, 128),), paths["stage2"], dynamo=False,
                          input_names=["patches"], output_names=["logits", "cam"], opset_version=args.opset,
                          dynamic_axes={"patches": {0: "points"}, "logits": {0: "points"}, "cam": {0: "points"}})
    for path in paths.values():
        onnx.checker.check_model(onnx.load(path))
        print("{}: {:.1f} MB, ONNX checker passed".format(os.path.basename(path), os.path.getsize(path) / 1024 ** 2))

    session1 = ort.InferenceSession(paths["stage1"], providers=["CPUExecutionProvider"])
    session2 = ort.InferenceSession(paths["stage2"], providers=["CPUExecutionProvider"])

    report = {"stage1": [], "stage2": []}
    print("\nParity, PyTorch against ONNX Runtime on this CPU")
    for height, width in [(512, 682), (512, 1024)]:
        for seed in range(3):
            image = smooth_image(height, width, seed)
            with torch.no_grad():
                torch_logits = stage1(image)
            onnx_logits = torch.from_numpy(session1.run(None, {"image": image.numpy()})[0])
            full = (height * 2, width * 2)
            torch_map = F.interpolate(torch_logits, size=full, mode="bilinear", align_corners=False).argmax(1)
            onnx_map = F.interpolate(onnx_logits, size=full, mode="bilinear", align_corners=False).argmax(1)
            row = {"input": [height, width], "seed": seed,
                   "max_abs_logit_diff": float((torch_logits - onnx_logits).abs().max()),
                   "full_map_label_agreement": float((torch_map == onnx_map).float().mean())}
            report["stage1"].append(row)
            print("stage 1 {}x{} seed {}: max logit diff {:.2e}, same label on {:.4%} of full-size pixels".format(
                height, width, seed, row["max_abs_logit_diff"], row["full_map_label_agreement"]))
    for points in [30, 60]:
        patches = smooth_image(128 * points, 128, points).reshape(1, 3, points, 128, 128).permute(0, 2, 1, 3, 4)[0].contiguous()
        with torch.no_grad():
            torch_logits, torch_cam = stage2(patches)
            plain_logits = stage2.efficientnet((F.interpolate(patches, size=(224, 224), mode="bilinear", align_corners=False)
                                                - stage2.mean) / stage2.std)
        onnx_out = session2.run(None, {"patches": patches.numpy()})
        onnx_logits, onnx_cam = torch.from_numpy(onnx_out[0]), torch.from_numpy(onnx_out[1])
        bias = stage2.efficientnet.classifier[1].bias.detach()
        row = {"points": points, "max_abs_logit_diff": float((torch_logits - onnx_logits).abs().max()),
               "label_agreement": float((torch_logits.argmax(1) == onnx_logits.argmax(1)).float().mean()),
               "max_prob_diff": float((torch_logits.softmax(1) - onnx_logits.softmax(1)).abs().max()),
               "logits_equal_torchvision_forward": float((torch_logits - plain_logits).abs().max()),
               "cam_mean_plus_bias_minus_logit": float((torch_cam.mean(dim=(2, 3)) + bias - torch_logits).abs().max()),
               "max_abs_cam_diff": float((torch_cam - onnx_cam).abs().max())}
        report["stage2"].append(row)
        print("stage 2 batch {}: max logit diff {:.2e}, max probability diff {:.2e}, same label {:.1%}, max CAM diff {:.2e}".format(
            points, row["max_abs_logit_diff"], row["max_prob_diff"], row["label_agreement"], row["max_abs_cam_diff"]))
        print("  wrapper logits vs torchvision forward: {:.2e}; CAM mean + bias vs logit: {:.2e}".format(
            row["logits_equal_torchvision_forward"], row["cam_mean_plus_bias_minus_logit"]))

    print("\nTime per call on this CPU (median of 5, after a warm-up); threads: torch {}, ONNX Runtime default".format(
        torch.get_num_threads()))
    timing = {}
    for height, width in [(512, 682), (512, 1024)]:
        image = smooth_image(height, width, 0)
        with torch.no_grad():
            t_torch = timed(lambda: stage1(image))
        t_onnx = timed(lambda: session1.run(None, {"image": image.numpy()}))
        timing["stage1_{}x{}".format(height, width)] = {"torch_s": t_torch, "onnx_s": t_onnx}
        print("stage 1 {}x{}: PyTorch {:.2f} s, ONNX Runtime {:.2f} s".format(height, width, t_torch, t_onnx))
    for points in [30, 60]:
        patches = torch.rand(points, 3, 128, 128)
        with torch.no_grad():
            t_torch = timed(lambda: stage2(patches))
        t_onnx = timed(lambda: session2.run(None, {"patches": patches.numpy()}))
        timing["stage2_batch_{}".format(points)] = {"torch_s": t_torch, "onnx_s": t_onnx}
        print("stage 2 batch {}: PyTorch {:.2f} s, ONNX Runtime {:.2f} s".format(points, t_torch, t_onnx))

    manifest = {
        "drafted_with": "AI assistance (Claude); record in the AI usage log",
        "models": {
            "stage1": {"file": os.path.basename(paths["stage1"]), "sha256": sha256(paths["stage1"]),
                       "input": {"name": "image", "shape": [1, 3, "H", "W"], "range": "RGB 0..1",
                                 "note": "photo at half size: 512 high, width keeps the aspect ratio"},
                       "output": {"name": "logits", "shape": [1, 3, "H/4", "W/4"], "classes": STAGE1_CLASSES,
                                  "post": "bilinear upsample (align_corners=False) to the full photo, argmax"},
                       "checkpoint_epoch": used["stage 1 epoch"]},
            "stage2": {"file": os.path.basename(paths["stage2"]), "sha256": sha256(paths["stage2"]),
                       "input": {"name": "patches", "shape": ["N", 3, 128, 128], "range": "RGB 0..1",
                                 "note": "128 px cut from the full-size photo around each coral point"},
                       "output": {"name": "logits", "shape": ["N", 3], "classes": STAGE2_CLASSES, "post": "argmax; softmax for confidence"},
                       "output_cam": {"name": "cam", "shape": ["N", 3, 7, 7], "classes": STAGE2_CLASSES,
                                      "post": "take the map of the predicted class, clip below 0, scale to 0..1, "
                                              "upsample bilinearly to the 128 px patch and overlay; mean over 7x7 plus bias = logit"},
                       "checkpoint_epoch": used["stage 2 epoch"], "checkpoint_source": used["stage 2 source"]},
        },
        "inside_the_graphs": "ImageNet mean/std normalisation; stage 2 also resizes 128 -> 224 bilinear",
        "protocol": {"photo_height": 1024, "border_px": 128, "patch_px": 128, "grids": {"30": [5, 6], "60": [6, 10]},
                     "point_seed": "0 + photo index", "rule": "coral -> stage 2, substrate -> substrate, other -> not counted"},
        "parity": report, "cpu_timing_seconds": timing,
        "versions": {"torch": torch.__version__, "onnx": onnx.__version__, "onnxruntime": ort.__version__},
        "opset": args.opset,
    }
    with open(os.path.join(args.out, "models.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
    print("\nWrote {} and models.json".format(", ".join(os.path.basename(p) for p in paths.values())))


if __name__ == "__main__":
    main()
