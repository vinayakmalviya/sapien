const recordButton = document.querySelector("#record");
const stopButton = document.querySelector("#stop");
const analyzeButton = document.querySelector("#analyze");
const fileInput = document.querySelector("#audio-file");
const preview = document.querySelector("#preview");
const message = document.querySelector("#message");
const resultPanel = document.querySelector("#result");

let recorder;
let stream;
let selectedFile;

const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;

function setAudio(file) {
  selectedFile = file;
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  analyzeButton.disabled = false;
}

recordButton.addEventListener("click", async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorder = new MediaRecorder(stream);
    const chunks = [];

    recorder.addEventListener("dataavailable", (event) => chunks.push(event.data));
    recorder.addEventListener("stop", () => {
      const type = recorder.mimeType || "audio/webm";
      const extension = type.includes("mp4") ? "m4a" : "webm";
      setAudio(new File([new Blob(chunks, { type })], `recording.${extension}`, { type }));
      stream.getTracks().forEach((track) => track.stop());
      document.querySelector("#recording-status").textContent = "Recording ready";
    });

    recorder.start();
    recordButton.disabled = true;
    stopButton.disabled = false;
    document.querySelector("#recording-status").textContent = "Recording…";
  } catch (error) {
    message.textContent = `Microphone error: ${error.message}`;
  }
});

stopButton.addEventListener("click", () => {
  recorder.stop();
  recordButton.disabled = false;
  stopButton.disabled = true;
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) setAudio(fileInput.files[0]);
});

analyzeButton.addEventListener("click", async () => {
  const expectedWord = document.querySelector("#expected-word").value.trim();
  if (!selectedFile || !expectedWord) return;

  const form = new FormData();
  form.append("expected_word", expectedWord);
  form.append("audio_clip", selectedFile);

  analyzeButton.disabled = true;
  resultPanel.hidden = true;
  message.textContent = "Analyzing…";

  try {
    const response = await fetch("/submit-audio", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Analysis failed");

    document.querySelector("#label").textContent = data.voice_detection.label;
    document.querySelector("#confidence").textContent = formatPercent(data.voice_detection.confidence);
    document.querySelector("#human-score").textContent = formatPercent(data.voice_detection.human_probability);
    document.querySelector("#fake-score").textContent = formatPercent(data.voice_detection.score);
    document.querySelector("#expected-result").textContent = data.word_match.expected_word;
    document.querySelector("#transcript").textContent = data.word_match.transcript || "No speech detected";
    document.querySelector("#word-match").textContent = data.word_match.matched ? "Matched" : "Not matched";
    document.querySelector("#flag").textContent = data.flag_reason || "None";

    resultPanel.dataset.label = data.voice_detection.label;
    resultPanel.hidden = false;
    message.textContent = "Analysis complete";
  } catch (error) {
    message.textContent = error.message;
  } finally {
    analyzeButton.disabled = false;
  }
});
