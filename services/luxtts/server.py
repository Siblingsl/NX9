#!/usr/bin/env python3
"""
NX9 LuxTTS sidecar — local voice-cloning TTS.
https://github.com/ysharma3501/LuxTTS

Start: python server.py
Env:   NX9_LUXTTS_HOST, NX9_LUXTTS_PORT, NX9_LUXTTS_DEVICE, NX9_LUXTTS_MODEL, NX9_ROOT
"""

from __future__ import annotations

import hashlib
import io
import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="[luxtts] %(levelname)s %(message)s")
log = logging.getLogger("nx9.luxtts")

HOST = os.getenv("NX9_LUXTTS_HOST", "127.0.0.1")
PORT = int(os.getenv("NX9_LUXTTS_PORT", "17880"))
MODEL_ID = os.getenv("NX9_LUXTTS_MODEL", "YatharthS/LuxTTS")
DEVICE = os.getenv("NX9_LUXTTS_DEVICE", "auto")
CPU_THREADS = int(os.getenv("NX9_LUXTTS_THREADS", "2"))
NX9_ROOT = Path(os.getenv("NX9_ROOT", Path(__file__).resolve().parents[2])).resolve()

AUDIO_EXTS = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac"}

lux_engine: Any = None
model_error: Optional[str] = None
encoded_cache: dict[str, Any] = {}


def allowed_roots() -> list[Path]:
    roots = [
        NX9_ROOT / "storage",
        NX9_ROOT / "data",
        NX9_ROOT / "services" / "luxtts" / "samples",
    ]
    extra = os.getenv("NX9_LUXTTS_ALLOWED_DIRS", "")
    for part in extra.split(os.pathsep):
        part = part.strip()
        if part:
            roots.append(Path(part).resolve())
    return roots


def resolve_allowed_path(path_str: str) -> Path:
    raw = Path(path_str)
    candidate = raw.resolve() if raw.is_absolute() else (NX9_ROOT / raw).resolve()
    if not candidate.is_file():
        raise HTTPException(status_code=400, detail=f"Audio file not found: {path_str}")
    suffix = candidate.suffix.lower()
    if suffix not in AUDIO_EXTS:
        raise HTTPException(status_code=400, detail=f"Unsupported audio type: {suffix}")
    for root in allowed_roots():
        try:
            candidate.relative_to(root.resolve())
            return candidate
        except ValueError:
            continue
    raise HTTPException(status_code=403, detail="Audio path outside allowed NX9 directories")


def pick_device() -> str:
    if DEVICE and DEVICE != "auto":
        return DEVICE
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def load_engine() -> None:
    global lux_engine, model_error
    if lux_engine is not None or model_error is not None:
        return
    try:
        from zipvoice.luxvoice import LuxTTS
    except ImportError as exc:
        model_error = (
            "LuxTTS not installed. Run: pip install -r requirements.txt "
            "&& pip install git+https://github.com/ysharma3501/LuxTTS.git"
        )
        log.error(model_error)
        return

    device = pick_device()
    try:
        if device == "cpu":
            lux_engine = LuxTTS(MODEL_ID, device="cpu", threads=CPU_THREADS)
        else:
            lux_engine = LuxTTS(MODEL_ID, device=device)
        log.info("Model loaded on %s (%s)", device, MODEL_ID)
    except Exception as exc:
        model_error = f"Failed to load LuxTTS: {exc}"
        log.error(model_error)


def profile_key(reference_path: Path, profile_id: Optional[str]) -> str:
    if profile_id:
        return profile_id
    digest = hashlib.sha1(str(reference_path).encode("utf-8")).hexdigest()[:16]
    return f"path-{digest}"


def encode_reference(
    reference_path: Path,
    profile_id: Optional[str],
    rms: float,
    ref_duration: float,
) -> Any:
    if lux_engine is None:
        raise HTTPException(status_code=503, detail=model_error or "LuxTTS model not loaded")
    key = profile_key(reference_path, profile_id)
    if key in encoded_cache:
        return encoded_cache[key]
    log.info("Encoding reference %s -> %s", reference_path.name, key)
    encoded = lux_engine.encode_prompt(str(reference_path), rms=rms, duration=ref_duration)
    encoded_cache[key] = encoded
    return encoded


class EncodeBody(BaseModel):
    reference_audio_path: str
    profile_id: Optional[str] = None
    rms: float = Field(0.01, ge=0.001, le=0.2)
    ref_duration: float = Field(5.0, ge=1.0, le=60.0)


class SynthesizeBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)
    reference_audio_path: Optional[str] = None
    profile_id: Optional[str] = None
    rms: float = Field(0.01, ge=0.001, le=0.2)
    t_shift: float = Field(0.9, ge=0.1, le=1.5)
    num_steps: int = Field(4, ge=1, le=12)
    speed: float = Field(1.0, ge=0.5, le=2.0)
    return_smooth: bool = False
    ref_duration: float = Field(5.0, ge=1.0, le=60.0)


@asynccontextmanager
async def lifespan(_: FastAPI):
    load_engine()
    yield


app = FastAPI(title="NX9 LuxTTS", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def detect_hardware() -> dict[str, bool]:
    cuda = False
    mps = False
    try:
        import torch

        cuda = bool(torch.cuda.is_available())
        mps = bool(hasattr(torch.backends, "mps") and torch.backends.mps.is_available())
    except Exception:
        pass
    return {
        "cudaAvailable": cuda,
        "mpsAvailable": mps,
        "gpuAvailable": cuda or mps,
    }


def normalize_device_name(device: Any) -> str:
    text = str(device).lower()
    if "cuda" in text:
        return "cuda"
    if "mps" in text:
        return "mps"
    if "cpu" in text:
        return "cpu"
    return text


@app.get("/health")
def health():
    hw = detect_hardware()
    if lux_engine is not None:
        active = normalize_device_name(getattr(lux_engine, "device", pick_device()))
    else:
        active = normalize_device_name(pick_device())
    running_on_cpu = active == "cpu"
    no_gpu = not hw["gpuAvailable"] or running_on_cpu
    recommendation = None
    if no_gpu:
        recommendation = (
            "未检测到可用 GPU（当前为 CPU 推理）。"
            "请在 NX9 设置 → LuxTTS 中选择保底策略：继续使用 CPU 本地克隆，或改走云端 TTS。"
        )
    return {
        "ok": lux_engine is not None,
        "service": "nx9-luxtts",
        "model": MODEL_ID,
        "device": active,
        "activeDevice": active,
        "modelLoaded": lux_engine is not None,
        "cachedProfiles": len(encoded_cache),
        "message": "LuxTTS ready" if lux_engine else (model_error or "Model not loaded"),
        "nx9Root": str(NX9_ROOT),
        "gpuAvailable": hw["gpuAvailable"],
        "cudaAvailable": hw["cudaAvailable"],
        "mpsAvailable": hw["mpsAvailable"],
        "runningOnCpu": running_on_cpu,
        "recommendedFallback": "cloud" if no_gpu else None,
        "recommendation": recommendation,
    }


@app.get("/profiles")
def list_profiles():
    return {
        "profiles": [
            {"id": key, "cached": True}
            for key in sorted(encoded_cache.keys())
        ]
    }


@app.post("/encode")
def encode(body: EncodeBody):
    path = resolve_allowed_path(body.reference_audio_path)
    encoded = encode_reference(path, body.profile_id, body.rms, body.ref_duration)
    key = profile_key(path, body.profile_id)
    return {"ok": True, "profileId": key, "encoded": encoded is not None}


@app.post("/synthesize")
def synthesize(body: SynthesizeBody):
    if lux_engine is None:
        raise HTTPException(status_code=503, detail=model_error or "LuxTTS model not loaded")

    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    encoded = None
    if body.profile_id and body.profile_id in encoded_cache:
        encoded = encoded_cache[body.profile_id]
    elif body.reference_audio_path:
        path = resolve_allowed_path(body.reference_audio_path)
        encoded = encode_reference(path, body.profile_id, body.rms, body.ref_duration)
    else:
        raise HTTPException(
            status_code=400,
            detail="reference_audio_path or cached profile_id is required for voice cloning",
        )

    wav = lux_engine.generate_speech(
        text,
        encoded,
        num_steps=body.num_steps,
        t_shift=body.t_shift,
        speed=body.speed,
        return_smooth=body.return_smooth,
    )
    arr = wav.detach().cpu().numpy().squeeze() if hasattr(wav, "detach") else np.asarray(wav).squeeze()
    buf = io.BytesIO()
    sf.write(buf, arr, 48000, format="WAV")
    return Response(content=buf.getvalue(), media_type="audio/wav")


@app.post("/synthesize/json")
def synthesize_json(body: SynthesizeBody):
    """Same as /synthesize but returns JSON { ok, sampleRate, bytes } for Node adapter."""
    if lux_engine is None:
        return JSONResponse(status_code=503, content={"ok": False, "message": model_error})

    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    encoded = None
    if body.profile_id and body.profile_id in encoded_cache:
        encoded = encoded_cache[body.profile_id]
    elif body.reference_audio_path:
        path = resolve_allowed_path(body.reference_audio_path)
        encoded = encode_reference(path, body.profile_id, body.rms, body.ref_duration)
    else:
        raise HTTPException(status_code=400, detail="reference_audio_path or profile_id required")

    wav = lux_engine.generate_speech(
        text,
        encoded,
        num_steps=body.num_steps,
        t_shift=body.t_shift,
        speed=body.speed,
        return_smooth=body.return_smooth,
    )
    arr = wav.detach().cpu().numpy().squeeze() if hasattr(wav, "detach") else np.asarray(wav).squeeze()
    buf = io.BytesIO()
    sf.write(buf, arr, 48000, format="WAV")
    data = buf.getvalue()
    return {"ok": True, "sampleRate": 48000, "bytes": len(data), "audioBase64": None, "raw": None}


def main() -> None:
    import uvicorn

    log.info("Starting NX9 LuxTTS on http://%s:%s (NX9_ROOT=%s)", HOST, PORT, NX9_ROOT)
    uvicorn.run("server:app", host=HOST, port=PORT, reload=False, log_level="info")


if __name__ == "__main__":
    main()
