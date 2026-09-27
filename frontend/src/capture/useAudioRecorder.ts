import { useCallback, useRef } from "react";

export interface RecordedAudio {
  /** Base64, no data URI prefix. Section 5.4 of ui-contract.md. */
  audioBase64: string;
  /** The browser's exact MIME type, e.g. "audio/webm;codecs=opus". */
  mimeType: string;
}

/** Preference order. The browser reports back its actual choice either way. */
const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm"];

function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK_SIZE = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

/**
 * Records the microphone with `MediaRecorder`. Section 6.5 of
 * frontend-handoff.md.
 *
 * The browser produces WebM audio with the Opus codec. `stopRecording`
 * reports the exact MIME type the browser actually used, for the
 * `audio_mime` field — Section 5.4 of ui-contract.md.
 */
export function useAudioRecorder() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");

  const startRecording = useCallback((stream: MediaStream): boolean => {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return false;

    const audioOnlyStream = new MediaStream(audioTracks);
    const preferredMimeType = pickSupportedMimeType();
    const recorder = preferredMimeType
      ? new MediaRecorder(audioOnlyStream, { mimeType: preferredMimeType })
      : new MediaRecorder(audioOnlyStream);

    mimeTypeRef.current = recorder.mimeType || preferredMimeType;
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.start();
    recorderRef.current = recorder;
    return true;
  }, []);

  const stopRecording = useCallback((): Promise<RecordedAudio | null> => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder || recorder.state === "inactive") {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeTypeRef.current,
        });
        if (blob.size === 0) {
          resolve(null);
          return;
        }
        blobToBase64(blob).then((audioBase64) => {
          resolve({ audioBase64, mimeType: mimeTypeRef.current });
        });
      };
      recorder.stop();
    });
  }, []);

  return { startRecording, stopRecording };
}
