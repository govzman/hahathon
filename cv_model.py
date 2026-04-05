import math
import numpy as np
import torch
from PIL import Image, ImageDraw
from transformers import (
    AutoImageProcessor,
    AutoModelForObjectDetection,
    AutoModelForDepthEstimation,
)


class NearestObjectsPredictor:
    def __init__(
        self,
        detection_model: str = "hustvl/yolos-tiny",
        depth_model: str = "depth-anything/Depth-Anything-V2-Metric-Outdoor-Small-hf",
        target_classes=None,
        top_k: int = 5,
        conf_thres: float = 0.05,
        iphone_fov_deg: float = 70.0,
        trigger_distance_m: float = 4.0,
        device: str | None = None,
    ):
        self.detection_model_name = detection_model
        self.depth_model_name = depth_model
        self.target_classes = set(target_classes or ["person", "cat", "dog", "bus", "car"])
        self.top_k = top_k
        self.conf_thres = conf_thres
        self.iphone_fov_deg = iphone_fov_deg
        self.trigger_distance_m = trigger_distance_m
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")

        self.det_processor = AutoImageProcessor.from_pretrained(self.detection_model_name)
        self.det_model = AutoModelForObjectDetection.from_pretrained(self.detection_model_name).to(self.device)
        self.det_model.eval()

        self.depth_processor = AutoImageProcessor.from_pretrained(self.depth_model_name)
        self.depth_model = AutoModelForDepthEstimation.from_pretrained(self.depth_model_name).to(self.device)
        self.depth_model.eval()

    def _compute_iphone_portrait_intrinsics(self, width, height):
        cx = width / 2.0
        cy = height / 2.0
        f = (width / 2.0) / math.tan(math.radians(self.iphone_fov_deg / 2.0))
        return f, f, cx, cy

    def _tensor_to_pil(self, image_tensor: torch.Tensor) -> Image.Image:
        if not isinstance(image_tensor, torch.Tensor):
            raise TypeError("image_tensor must be torch.Tensor")

        tensor = image_tensor.detach().cpu()

        if tensor.ndim == 4:
            if tensor.shape[0] != 1:
                raise ValueError("Batch tensor is supported only for batch size 1")
            tensor = tensor[0]

        if tensor.ndim != 3:
            raise ValueError("image_tensor must have shape [C,H,W] or [1,C,H,W]")

        if tensor.shape[0] not in (1, 3):
            raise ValueError("image_tensor channel dimension must be 1 or 3")

        tensor = tensor.float()

        if tensor.max() > 1.0 or tensor.min() < 0.0:
            tensor = tensor.clamp(0, 255) / 255.0

        tensor = tensor.clamp(0.0, 1.0)

        if tensor.shape[0] == 1:
            tensor = tensor.repeat(3, 1, 1)

        array = (tensor.permute(1, 2, 0).numpy() * 255.0).astype(np.uint8)
        return Image.fromarray(array).convert("RGB")

    def _estimate_depth_map_pil(self, image_pil: Image.Image):
        inputs = self.depth_processor(images=image_pil, return_tensors="pt").to(self.device)

        with torch.no_grad():
            outputs = self.depth_model(**inputs)
            predicted_depth = outputs.predicted_depth

        depth = torch.nn.functional.interpolate(
            predicted_depth.unsqueeze(1),
            size=(image_pil.height, image_pil.width),
            mode="bicubic",
            align_corners=False,
        ).squeeze().cpu().numpy()

        return depth

    def _detect_objects_pil(self, image_pil: Image.Image):
        inputs = self.det_processor(images=image_pil, return_tensors="pt").to(self.device)

        with torch.no_grad():
            outputs = self.det_model(**inputs)

        target_sizes = torch.tensor([[image_pil.height, image_pil.width]], device=self.device)
        results = self.det_processor.post_process_object_detection(
            outputs,
            threshold=self.conf_thres,
            target_sizes=target_sizes
        )[0]

        detections = []
        for score, label, box in zip(results["scores"], results["labels"], results["boxes"]):
            label_id = int(label.item())
            detections.append({
                "score": float(score.item()),
                "label_id": label_id,
                "label": self.det_model.config.id2label[label_id],
                "bbox": [float(v) for v in box.tolist()],
            })

        return detections

    def _clamp_box(self, x1, y1, x2, y2, w, h):
        x1 = max(0, min(w - 1, int(x1)))
        y1 = max(0, min(h - 1, int(y1)))
        x2 = max(0, min(w - 1, int(x2)))
        y2 = max(0, min(h - 1, int(y2)))
        return x1, y1, x2, y2

    def _get_object_depth(self, depth_map, x1, y1, x2, y2):
        h, w = depth_map.shape
        x1, y1, x2, y2 = self._clamp_box(x1, y1, x2, y2, w, h)

        if x2 <= x1 or y2 <= y1:
            return None, None, None

        bw = x2 - x1
        bh = y2 - y1

        rx1 = x1 + int(0.30 * bw)
        rx2 = x1 + int(0.70 * bw)
        ry1 = y1 + int(0.70 * bh)
        ry2 = y2

        rx1, ry1, rx2, ry2 = self._clamp_box(rx1, ry1, rx2, ry2, w, h)
        if rx2 <= rx1 or ry2 <= ry1:
            return None, None, None

        roi = depth_map[ry1:ry2, rx1:rx2]
        if roi.size == 0:
            return None, None, None

        z = float(np.median(roi))
        u = int((x1 + x2) / 2)
        v = int(y2)

        return z, u, v

    def _depth_to_3d_distance(self, z, u, v, fx, fy, cx, cy):
        X = (u - cx) * z / fx
        Y = (v - cy) * z / fy
        D = math.sqrt(X * X + Y * Y + z * z)
        return X, Y, D

    def _draw_results(self, image_pil: Image.Image, results: list[dict], signal: str):
        image = image_pil.copy()
        draw = ImageDraw.Draw(image)

        for item in results:
            x1, y1, x2, y2 = item["bbox"]
            draw.rectangle([x1, y1, x2, y2], outline="lime", width=3)

            text = f'{item["label"]} {item["confidence"]:.2f}'
            if item["depth_z_m"] is not None:
                text += f' z={item["depth_z_m"]:.2f}m d={item["distance_3d_m"]:.2f}m'

            draw.text((int(x1), max(0, int(y1) - 18)), text, fill="lime")

            if item["point_uv"] is not None:
                u, v = item["point_uv"]
                r = 4
                draw.ellipse((u - r, v - r, u + r, v + r), fill="red")

        draw.text((10, 10), f"signal: {signal}", fill="yellow")
        return image

    def _class_to_signal(self, label: str) -> str:
        if label == "person":
            return "+"
        if label in {"cat", "dog"}:
            return "-"
        if label in {"bus", "car"}:
            return "0"
        return ""

    def predict(self, image_tensor: torch.Tensor, debug: bool = False):
        image = self._tensor_to_pil(image_tensor)

        if debug:
            image.save("input.jpg")

        width, height = image.size
        fx, fy, cx, cy = self._compute_iphone_portrait_intrinsics(width, height)

        detections = self._detect_objects_pil(image)
        detections = [d for d in detections if d["label"] in self.target_classes]

        grouped = {}
        for det in detections:
            grouped.setdefault(det["label"], []).append(det)

        for label in grouped:
            grouped[label] = sorted(grouped[label], key=lambda x: x["score"], reverse=True)[: self.top_k]

        depth_map = self._estimate_depth_map_pil(image)

        final_results = []

        for label, dets in grouped.items():
            candidates = []

            for det in dets:
                x1, y1, x2, y2 = det["bbox"]
                z, u, v = self._get_object_depth(depth_map, x1, y1, x2, y2)

                if z is None:
                    continue

                X, Y, distance_3d = self._depth_to_3d_distance(z, u, v, fx, fy, cx, cy)

                candidates.append({
                    "label": label,
                    "confidence": det["score"],
                    "bbox": [int(x1), int(y1), int(x2), int(y2)],
                    "depth_z_m": float(z),
                    "distance_3d_m": float(distance_3d),
                    "point_uv": [int(u), int(v)],
                    "position_camera_xyz_m": [float(X), float(Y), float(z)],
                })

            if candidates:
                nearest = min(candidates, key=lambda x: x["distance_3d_m"])
                final_results.append(nearest)

        signal = ""

        if final_results:
            global_nearest = min(final_results, key=lambda x: x["distance_3d_m"])
            if global_nearest["distance_3d_m"] < self.trigger_distance_m:
                signal = self._class_to_signal(global_nearest["label"])

        if debug:
            vis_image = self._draw_results(image, final_results, signal)
            vis_image.save("output.jpg")

        return final_results, signal


if __name__ == "__main__":
    predictor = NearestObjectsPredictor(
        detection_model="hustvl/yolos-tiny",
        depth_model="depth-anything/Depth-Anything-V2-Metric-Outdoor-Small-hf",
        target_classes=["person", "cat", "dog", "bus", "car"],
        top_k=5,
        conf_thres=0.05,
        iphone_fov_deg=70.0,
        trigger_distance_m=4.0,
    )

    example = torch.rand(3, 1280, 720)
    results, signal = predictor.predict(example, debug=True)

    print("signal:", signal)
    for item in results:
        print(item)