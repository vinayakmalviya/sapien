# Sapien

Sapien is a multi modal authenticity API. Sapien checks if a live video, audio, image, or text session is real or synthetic. Sapien returns one signal, in real time, through one integration point.

## What the demo proves

1. A single API can carry a live liveness check and a voice check.
2. The check returns a real or synthetic signal in real time, during a live session.

Image authenticity and text authenticity are not part of this build. They are roadmap items only.

## Tech stack

| Layer | Tool | Notes |
|---|---|---|
| Face and head tracking | MediaPipe Face Landmarker | Runs client side, in the browser, via WebAssembly |
| Challenge response scoring | Hand written rule logic | Deterministic code, no model |
| Deepfake artifact detection | `dima806/deepfake_vs_real_image_detection` (Hugging Face) | Pretrained ViT classifier, inference only |
| Voice authenticity | Existing prototype | Reused as is, not rebuilt |
| Backend | FastAPI (or Flask) | Python |
| Frontend | React or plain HTML/JS | Kept to the screens the demo needs |

No model is trained or fine tuned in this build. All ML use is pretrained inference only.

## Architecture

Candidate browser sends video and audio to the frontend. The frontend runs MediaPipe locally and shows the prompt. The frontend sends a landmark motion score, sampled frames, and an audio clip to the API layer. The API layer routes each input to its detection service. Each service returns a score. The decision engine combines the three scores into one signal. The signal returns to the frontend's result panel.

Reference files:
- `docs/architecture-diagram.svg`
- `docs/architecture-diagram.png`

## Getting started

This section follows ASD-STE100 (Simplified Technical English). Each step gives one instruction.

### Prerequisites

Install Python 3.10 or a later version.
Install Node.js 18 or a later version. Install Node.js only if you use the React frontend.
Install Git.
Install pip.

### Clone the repository

Open a terminal.
Run this command:

```bash
git clone <repo-url>
cd sapien
```

### Backend setup

Go to the backend folder:

```bash
cd backend
```

Create a virtual environment:

```bash
python -m venv venv
```

Activate the virtual environment.

On macOS or Linux, run this command:

```bash
source venv/bin/activate
```

On Windows, run this command:

```bash
venv\Scripts\activate
```

Install the backend dependencies:

```bash
pip install -r requirements.txt --break-system-packages
```

Start the API server:

```bash
uvicorn app.main:app --reload
```

The API server runs at `http://localhost:8000`.

### Frontend setup

Open a new terminal.
Go to the frontend folder:

```bash
cd frontend
```

Install the frontend dependencies:

```bash
npm install
```

Start the frontend dev server:

```bash
npm run dev
```

The frontend runs at `http://localhost:5173` (or the port your dev server reports).

### Run the full demo

Start the backend server first.
Start the frontend server second.
Open the frontend URL in a browser.
Allow camera and microphone access when the browser asks.

## API overview

All requests go through the API layer. No detection service is called directly by the frontend.

| Method | Path | Purpose |
|---|---|---|
| POST | `/start-session` | Start a session and get the first prompt |
| POST | `/submit-response` | Submit one prompt response and get the next prompt or the completion status |
| GET | `/get-result` | Get the combined real or synthetic signal |


## Project structure

```
sapien/
  backend/
    app/
      main.py
      session_handler.py
      liveness_scorer.py
      frame_classifier.py
      voice_detection.py
      decision_engine.py
    requirements.txt
  frontend/
    src/
    public/
    package.json
  docs/
    architecture-diagram.svg
    architecture-diagram.png
  README.md
```

Keep the model layer separate from the route layer in the backend. This makes it easier to swap a model later without a rewrite.

## Out of scope for this weekend

Do not build these. They are roadmap items only.

- Image authenticity module
- Text authenticity module
- White label licensing or embedding into a third party platform
- Any trained or fine tuned model
- A custom deepfake generator for test clips
- User accounts, persistent storage beyond a session, or production grade auth

## Team notes

For the full pitch, the market context, and the competitive landscape, see the project's pitch summary document.
For every build decision, the tool stack rationale, and the API contract.

Project: Sapien. Built for Origin Weekend, Fall 2026.
