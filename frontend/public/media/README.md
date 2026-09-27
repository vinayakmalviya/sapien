# Synthetic candidate clip

Add the prepared MP4 clip here, named exactly:

```
synthetic-candidate.mp4
```

`src/capture/useVideoSource.ts` points the "file" video source at
`/media/synthetic-candidate.mp4`. No clip has been added yet — this
directory exists so the path is ready.

## What the clip needs

- A visible human face, roughly centred, for the calibration check to pass
  (`useFaceLandmarker` needs 5 consecutive frames with a detected face).
- At least ~15 seconds, to cover all 3 prompts (lead-in + recording window
  each), or set it to loop (the `CameraFeed` component already loops it).
- H.264 video, in an MP4 container, for the widest browser support.

## Try it

On the launcher (`/`), turn on "Use synthetic candidate clip", then press
Start. The interview window opens at `/interview/$sessionId?source=file`
and plays this file instead of requesting the webcam.
