# A plain long-running container, for a host like Render, Railway, or
# Fly.io — not a Vercel Python Function. This backend keeps sessions in an
# in-memory dict (see app/session_api.py's SessionStore), so it needs one
# persistent process, not an autoscaled/stateless serverless function.
FROM python:3.12-slim

# ffmpeg: the audio pipeline's fallback decode path shells out to it
# (vendor/vishield/training/features.py). Without it, any non-WAV audio
# clip (the browser's WebM/Opus recordings) fails to decode.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Install the CPU-only torch build explicitly, before the rest of
# requirements.txt. The plain PyPI wheel on Linux bundles the full CUDA
# stack (cuBLAS, cuDNN, NCCL, ...) — several GB, and unused here; this
# container never sees a GPU. Once torch satisfies requirements.txt's
# `torch>=2.5`, the second install leaves it alone.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt \
    # openai-whisper unconditionally requires triton on Linux x86_64, even
    # for CPU-only use. Triton only backs whisper's CUDA median-filter/DTW
    # kernels for word-level timestamps (whisper/timing.py, gated behind
    # `if x.is_cuda`) — dead code here, since word_match.py transcribes
    # with fp16=False and no word_timestamps, entirely on CPU. Uninstalling
    # it after the fact (rather than fighting pip's resolver) keeps the
    # image smaller with no behavior change.
    && pip uninstall -y triton || true

COPY . .

ENV PORT=8000
EXPOSE 8000

# The lifespan handler loads Whisper, Wav2Vec2, and the frame classifier
# once, at container startup — not per request. Give the host a generous
# health-check grace period on first deploy.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
