from typing import Annotated
from fastapi import FastAPI, File, UploadFile

from app.frame_classifier import classify_frame, load_model

app = FastAPI()

@app.on_event("startup")
def startup():
    load_model()

# dev
@app.post("/classify-frame")
async def classify_uploaded_frame(
    frame: Annotated[UploadFile, File(...)],
):
    frame_bytes = await frame.read()
    return classify_frame(frame_bytes)