from __future__ import annotations

import io
import os
import gc
import signal
import subprocess
import threading
import time
from typing import Any, Dict, List, Tuple

import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

os.environ.setdefault(
	"FLAGS_fraction_of_gpu_memory_to_use",
	os.getenv("PADDLE_OCR_GPU_MEMORY_FRACTION", "0.12"),
)
os.environ.setdefault(
	"FLAGS_eager_delete_tensor_gb",
	os.getenv("PADDLE_OCR_EAGER_DELETE_TENSOR_GB", "0.0"),
)

from paddleocr import PaddleOCR
from PIL import Image


def _normalize_language_profile(raw: str | None) -> str:
	profile = (raw or "hu+en+nl").strip().lower().replace(",", "+")
	parts = [segment.strip() for segment in profile.split("+") if segment.strip()]
	if not parts:
		return "hu+en+nl"
	unique: List[str] = []
	for part in parts:
		if part not in unique:
			unique.append(part)
	return "+".join(unique)


def _pick_backend_lang(language_profile: str) -> str:
	parts = _normalize_language_profile(language_profile).split("+")
	return parts[0] if parts else "en"


DEVICE = os.getenv("PADDLE_OCR_DEVICE", "gpu:0")
OCR_VERSION = os.getenv("PADDLE_OCR_VERSION", "PP-OCRv5")
DET_MODEL_NAME = os.getenv("PADDLE_OCR_DET_MODEL_NAME", "PP-OCRv5_server_det")
USE_TEXTLINE_ORIENTATION = os.getenv("PADDLE_OCR_USE_TEXTLINE_ORIENTATION", "false").lower() == "true"
TEXT_DET_LIMIT_SIDE_LEN = int(os.getenv("PADDLE_OCR_TEXT_DET_LIMIT_SIDE_LEN", "640"))
TEXT_RECOGNITION_BATCH_SIZE = int(os.getenv("PADDLE_OCR_TEXT_RECOGNITION_BATCH_SIZE", "1"))

PREWARM_LANGS = [
	segment.strip().lower()
	for segment in os.getenv("PADDLE_OCR_PREWARM_LANGS", "").split(",")
	if segment.strip()
]

PREWARM_ON_STARTUP = os.getenv("PADDLE_OCR_PREWARM_ON_STARTUP", "false").lower() == "true"
PREWARM_DELAY_SECONDS = max(0.0, float(os.getenv("PADDLE_OCR_PREWARM_DELAY_SECONDS", "8")))
WAIT_FOR_GPU_HEADROOM = os.getenv("PADDLE_OCR_WAIT_FOR_GPU_HEADROOM", "true").lower() == "true"
MIN_FREE_GPU_MB = max(0, int(os.getenv("PADDLE_OCR_MIN_FREE_GPU_MB", "4096")))
GPU_HEADROOM_TIMEOUT_SECONDS = max(1, int(os.getenv("PADDLE_OCR_GPU_HEADROOM_TIMEOUT_SECONDS", "90")))
SAFE_SHUTDOWN_MODE = os.getenv("PADDLE_OCR_SAFE_SHUTDOWN_MODE", "true").lower() == "true"
CLEAR_MODEL_CACHE_ON_SHUTDOWN = os.getenv("PADDLE_OCR_CLEAR_MODEL_CACHE_ON_SHUTDOWN", "false").lower() == "true"

PHYSICAL_GPU_INDEX = os.getenv("PADDLE_OCR_PHYSICAL_GPU_INDEX", "")
if not PHYSICAL_GPU_INDEX:
	visible_devices = os.getenv("CUDA_VISIBLE_DEVICES", "").split(",")
	PHYSICAL_GPU_INDEX = visible_devices[0].strip() if visible_devices and visible_devices[0].strip() else "0"

MAX_LOADED_MODELS = max(1, int(os.getenv("PADDLE_OCR_MAX_LOADED_MODELS", "1")))

OCR_CACHE: Dict[Tuple[str, str, str], PaddleOCR] = {}
_CACHE_LOCK = threading.Lock()
_SHUTDOWN_EVENT = threading.Event()


def _query_free_gpu_mb(physical_gpu_index: str) -> int | None:
	try:
		result = subprocess.run(
			[
				"nvidia-smi",
				"--query-gpu=memory.free",
				"--format=csv,noheader,nounits",
				"-i",
				physical_gpu_index,
			],
			capture_output=True,
			text=True,
			check=False,
			timeout=5,
		)
		if result.returncode != 0:
			return None
		line = result.stdout.strip().splitlines()[0].strip()
		return int(line)
	except Exception:
		return None


def _wait_for_gpu_headroom() -> None:
	if not WAIT_FOR_GPU_HEADROOM or DEVICE.startswith("cpu"):
		return

	deadline = time.time() + GPU_HEADROOM_TIMEOUT_SECONDS
	while time.time() < deadline and not _SHUTDOWN_EVENT.is_set():
		free_mb = _query_free_gpu_mb(PHYSICAL_GPU_INDEX)
		if free_mb is None:
			return
		if free_mb >= MIN_FREE_GPU_MB:
			return
		print(
			f"[PADDLE_OCR] waiting for GPU headroom: free={free_mb}MB < required={MIN_FREE_GPU_MB}MB (gpu={PHYSICAL_GPU_INDEX})"
		)
		time.sleep(1.0)


def _clear_ocr_cache() -> None:
	with _CACHE_LOCK:
		OCR_CACHE.clear()


def _clear_ocr_cache_with_cuda_cleanup() -> None:
	_clear_ocr_cache()
	gc.collect()
	try:
		import paddle

		if hasattr(paddle, "device") and hasattr(paddle.device, "cuda"):
			if hasattr(paddle.device.cuda, "empty_cache"):
				paddle.device.cuda.empty_cache()
			if hasattr(paddle.device.cuda, "synchronize") and DEVICE.startswith("gpu"):
				try:
					gpu_id = int(DEVICE.split(":", 1)[1]) if ":" in DEVICE else 0
					paddle.device.cuda.synchronize(gpu_id)
				except Exception:
					pass
	except Exception:
		pass


def _build_ocr(lang: str) -> PaddleOCR:
	rec_model_name = "PP-OCRv5_server_rec"
	return PaddleOCR(
		lang=lang,
		ocr_version=OCR_VERSION,
		device=DEVICE,
		enable_hpi=False,
		text_detection_model_name=DET_MODEL_NAME,
		text_recognition_model_name=rec_model_name,
		text_det_limit_side_len=TEXT_DET_LIMIT_SIDE_LEN,
		text_recognition_batch_size=TEXT_RECOGNITION_BATCH_SIZE,
		use_doc_orientation_classify=False,
		use_doc_unwarping=False,
		use_textline_orientation=USE_TEXTLINE_ORIENTATION,
	)


def _get_ocr(lang: str) -> PaddleOCR:
	key = (lang, OCR_VERSION, DEVICE)
	with _CACHE_LOCK:
		if key in OCR_CACHE:
			return OCR_CACHE[key]

	_wait_for_gpu_headroom()
	created = _build_ocr(lang)

	with _CACHE_LOCK:
		if key in OCR_CACHE:
			return OCR_CACHE[key]
		if len(OCR_CACHE) >= MAX_LOADED_MODELS:
			OCR_CACHE.clear()
			gc.collect()
		OCR_CACHE[key] = created
		return OCR_CACHE[key]


def _prewarm() -> None:
	for lang in PREWARM_LANGS:
		if _SHUTDOWN_EVENT.is_set():
			return
		try:
			_get_ocr(lang)
			print(f"[PADDLE_OCR] prewarm ok: lang={lang}, version={OCR_VERSION}, device={DEVICE}")
		except Exception as exc:
			print(f"[PADDLE_OCR] prewarm failed: lang={lang}, error={exc}")


def _deferred_prewarm_worker() -> None:
	if not PREWARM_ON_STARTUP:
		return
	if PREWARM_DELAY_SECONDS > 0:
		time.sleep(PREWARM_DELAY_SECONDS)
	if _SHUTDOWN_EVENT.is_set():
		return
	_prewarm()


def _request_shutdown(_signum: int, _frame: Any) -> None:
	print(
		f"[PADDLE_OCR] shutdown signal received: safe_mode={SAFE_SHUTDOWN_MODE}, clear_cache={CLEAR_MODEL_CACHE_ON_SHUTDOWN}"
	)
	_SHUTDOWN_EVENT.set()
	if SAFE_SHUTDOWN_MODE:
		if CLEAR_MODEL_CACHE_ON_SHUTDOWN:
			_clear_ocr_cache()
		return
	_clear_ocr_cache_with_cuda_cleanup()


signal.signal(signal.SIGTERM, _request_shutdown)
signal.signal(signal.SIGINT, _request_shutdown)


@asynccontextmanager
async def _lifespan(_app: FastAPI):
	prewarm_thread: threading.Thread | None = None
	print(
		f"[PADDLE_OCR] startup: device={DEVICE}, version={OCR_VERSION}, safe_shutdown_mode={SAFE_SHUTDOWN_MODE}, clear_model_cache_on_shutdown={CLEAR_MODEL_CACHE_ON_SHUTDOWN}"
	)
	if PREWARM_ON_STARTUP and PREWARM_LANGS:
		prewarm_thread = threading.Thread(target=_deferred_prewarm_worker, daemon=True)
		prewarm_thread.start()
	yield
	print("[PADDLE_OCR] lifespan shutdown begin")
	_SHUTDOWN_EVENT.set()
	if SAFE_SHUTDOWN_MODE:
		if CLEAR_MODEL_CACHE_ON_SHUTDOWN:
			_clear_ocr_cache()
	else:
		_clear_ocr_cache_with_cuda_cleanup()
	if prewarm_thread and prewarm_thread.is_alive():
		prewarm_thread.join(timeout=2.0)
	print("[PADDLE_OCR] lifespan shutdown complete")


app = FastAPI(lifespan=_lifespan)


@app.get("/health")
def health() -> Dict[str, Any]:
	return {
		"status": "ok",
		"device": DEVICE,
		"ocrVersion": OCR_VERSION,
		"prewarmLangs": PREWARM_LANGS,
		"prewarmOnStartup": PREWARM_ON_STARTUP,
		"prewarmDelaySeconds": PREWARM_DELAY_SECONDS,
		"maxLoadedModels": MAX_LOADED_MODELS,
		"textDetectionModelName": DET_MODEL_NAME,
		"useTextlineOrientation": USE_TEXTLINE_ORIENTATION,
		"textDetLimitSideLen": TEXT_DET_LIMIT_SIDE_LEN,
		"textRecognitionBatchSize": TEXT_RECOGNITION_BATCH_SIZE,
		"gpuMemoryFraction": os.environ.get("FLAGS_fraction_of_gpu_memory_to_use"),
		"waitForGpuHeadroom": WAIT_FOR_GPU_HEADROOM,
		"minFreeGpuMb": MIN_FREE_GPU_MB,
		"physicalGpuIndex": PHYSICAL_GPU_INDEX,
		"safeShutdownMode": SAFE_SHUTDOWN_MODE,
		"clearModelCacheOnShutdown": CLEAR_MODEL_CACHE_ON_SHUTDOWN,
	}


def _to_liteparse_results(prediction_row: Dict[str, Any]) -> List[Dict[str, Any]]:
	def to_list(value: Any) -> List[Any]:
		if value is None:
			return []
		if hasattr(value, "tolist"):
			try:
				converted = value.tolist()
				if isinstance(converted, list):
					return converted
			except Exception:
				pass
		if isinstance(value, list):
			return value
		if isinstance(value, tuple):
			return list(value)
		return [value]

	texts = to_list(prediction_row.get("rec_texts"))
	scores = to_list(prediction_row.get("rec_scores"))
	boxes = to_list(prediction_row.get("rec_boxes"))

	results: List[Dict[str, Any]] = []
	for idx, text in enumerate(texts):
		if not isinstance(text, str) or not text.strip():
			continue

		raw_box = boxes[idx] if idx < len(boxes) else None
		if raw_box is None:
			continue

		if hasattr(raw_box, "tolist"):
			raw_box = raw_box.tolist()

		if not isinstance(raw_box, list) or len(raw_box) < 4:
			continue

		try:
			bbox = [float(raw_box[0]), float(raw_box[1]), float(raw_box[2]), float(raw_box[3])]
		except Exception:
			continue

		score_value = 1.0
		if idx < len(scores):
			try:
				score_value = float(scores[idx])
			except Exception:
				score_value = 1.0

		results.append(
			{
				"text": text,
				"bbox": bbox,
				"confidence": max(0.0, min(1.0, score_value)),
			}
		)

	return results


@app.post("/ocr")
async def ocr(file: UploadFile = File(...), language: str = Form("hu+en+nl")):
	try:
		payload = await file.read()
		if not payload:
			return JSONResponse({"error": "empty file"}, status_code=400)

		img = Image.open(io.BytesIO(payload)).convert("RGB")
		img_np = np.array(img)

		lang = _pick_backend_lang(language)
		ocr_engine = _get_ocr(lang)
		prediction = ocr_engine.predict(img_np)

		if prediction is None:
			return {"results": []}

		if hasattr(prediction, "tolist"):
			try:
				prediction = prediction.tolist()
			except Exception:
				pass

		if isinstance(prediction, tuple):
			prediction = list(prediction)

		if not isinstance(prediction, list) or len(prediction) == 0:
			return {"results": []}

		first_row = prediction[0]
		if isinstance(first_row, dict):
			row = first_row.get("res", first_row)
		else:
			row = {}

		if not isinstance(row, dict):
			return {"results": []}

		results = _to_liteparse_results(row)
		return {"results": results}
	except Exception as exc:
		return JSONResponse({"error": str(exc)}, status_code=500)
