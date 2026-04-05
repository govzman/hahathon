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
        device: str | None = None,
    ):
        self.detection_model_name = detection_model
        self.depth_model_name = depth_model
        self.target_classes = set(target_classes or ["person", "cat", "dog", "bus", "car"])
        self.top_k = top_k
        self.conf_thres = conf_thres
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")

        self.det_processor = AutoImageProcessor.from_pretrained(self.detection_model_name)
        self.det_model = AutoModelForObjectDetection.from_pretrained(self.detection_model_name).to(self.device)
        self.det_model.eval()

        self.depth_processor = AutoImageProcessor.from_pretrained(self.depth_model_name)
        self.depth_model = AutoModelForDepthEstimation.from_pretrained(self.depth_model_name).to(self.device)
        self.depth_model.eval()

    def _tensor_to_pil(self, image_tensor: torch.Tensor) -> Image.Image:
        if not isinstance(image_tensor, torch.Tensor):
            raise TypeError("image_tensor must be torch.Tensor")

        tensor = image_tensor.detach().cpu()

        if tensor.ndim == 4:
            if tensor.shape[0] != 1:
                raise ValueError("Only batch size 1 is supported")
            tensor = tensor[0]

        if tensor.ndim != 3:
            raise ValueError("image_tensor must have shape [C,H,W] or [1,C,H,W]")

        if tensor.shape[0] not in (1, 3):
            raise ValueError("Channel dimension must be 1 or 3")

        tensor = tensor.float()

        if tensor.max() > 1.0 or tensor.min() < 0.0:
            tensor = tensor.clamp(0, 255) / 255.0

        tensor = tensor.clamp(0.0, 1.0)

        if tensor.shape[0] == 1:
            tensor = tensor.repeat(3, 1, 1)

        array = (tensor.permute(1, 2, 0).numpy() * 255.0).astype(np.uint8)
        return Image.fromarray(array).convert("RGB")

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
            label_name = self.det_model.config.id2label[label_id]
            detections.append({
                "score": float(score.item()),
                "label": label_name,
                "bbox": [float(v) for v in box.tolist()],
            })

        return detections

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
            return None

        bw = x2 - x1
        bh = y2 - y1

        rx1 = x1 + int(0.30 * bw)
        rx2 = x1 + int(0.70 * bw)
        ry1 = y1 + int(0.70 * bh)
        ry2 = y2

        rx1, ry1, rx2, ry2 = self._clamp_box(rx1, ry1, rx2, ry2, w, h)
        if rx2 <= rx1 or ry2 <= ry1:
            return None

        roi = depth_map[ry1:ry2, rx1:rx2]
        if roi.size == 0:
            return None

        return float(np.median(roi))

    def _draw_result(self, image_pil: Image.Image, result: dict | None):
        image = image_pil.copy()
        draw = ImageDraw.Draw(image)

        if result is not None:
            x1, y1, x2, y2 = result["bbox"]
            draw.rectangle([x1, y1, x2, y2], outline="lime", width=3)
            text = f'{result["label"]} conf={result["score"]:.2f} dist={result["distance_m"]:.2f}m'
            draw.text((int(x1), max(0, int(y1) - 18)), text, fill="lime")
        else:
            draw.text((10, 10), "No valid object", fill="yellow")

        return image

    def predict(self, image_tensor: torch.Tensor, debug: bool = False):
        image = self._tensor_to_pil(image_tensor)

        if debug:
            image.save("input.jpg")

        detections = self._detect_objects_pil(image)
        detections = [d for d in detections if d["label"] in self.target_classes]
        detections = sorted(detections, key=lambda x: x["score"], reverse=True)[: self.top_k]

        if not detections:
            if debug:
                self._draw_result(image, None).save("output.jpg")
            return None

        depth_map = self._estimate_depth_map_pil(image)

        candidates = []
        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            z = self._get_object_depth(depth_map, x1, y1, x2, y2)

            if z is None:
                continue

            candidates.append({
                "label": det["label"],
                "distance_m": float(z),
                "score": det["score"],
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
            })

        result = min(candidates, key=lambda x: x["distance_m"]) if candidates else None

        if debug:
            self._draw_result(image, result).save("output.jpg")

        if result is None:
            return None

        return {
            "label": result["label"],
            "distance_m": result["distance_m"],
            "bbox": result["bbox"],
        }


if __name__ == "__main__":
    predictor = NearestObjectsPredictor(
        target_classes=["person", "cat", "dog", "bus", "car"],
        top_k=5,
        conf_thres=0.05,
    )

    example = torch.rand(3, 1280, 720)
    result = predictor.predict(example, debug=True)
    print(result)