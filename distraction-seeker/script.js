const videoElement = document.getElementById("video");
const statusBox = document.getElementById("statusBox");
const alertSound = document.getElementById("alertSound");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");

let camera = null;
let isRunning = false;
let isAlertPlaying = false;
let lastWarningTime = 0;

let eyeClosedStart = null;
let noiseLevel = 0;

// ================= STATUS =================
function setStatus(text) {
  statusBox.textContent = text;
}

// ================= ALERT CONTROL =================
function playAlert() {
  const now = Date.now();
  if (!isAlertPlaying && now - lastWarningTime > 3000) {
    alertSound.currentTime = 0;
    alertSound.play().catch(() => {});
    isAlertPlaying = true;
    lastWarningTime = now;
  }
}

function stopAlert() {
  if (isAlertPlaying) {
    alertSound.pause();
    alertSound.currentTime = 0;
    isAlertPlaying = false;
  }
}

// ================= EYE ASPECT RATIO =================
// better eye open detection
function getEyeOpenRatio(landmarks) {
  const top = landmarks[159];
  const bottom = landmarks[145];
  return Math.abs(top.y - bottom.y);
}

// ================= MIC NOISE DETECTION =================
async function startMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();

    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    function checkNoise() {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      noiseLevel = sum / data.length;
      requestAnimationFrame(checkNoise);
    }
    checkNoise();
  } catch (e) {
    console.log("Mic permission denied");
  }
}

// ================= MEDIAPIPE =================
const faceMesh = new FaceMesh({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6,
});

// ================= MAIN AI LOOP =================
faceMesh.onResults((results) => {
  if (!isRunning) return;

  let focusScore = 100;

  // ❌ no face
  if (!results.multiFaceLandmarks.length) {
    setStatus("⚠️ Face not visible");
    playAlert();
    return;
  }

  const landmarks = results.multiFaceLandmarks[0];

  // 👁️ eye logic
  const eyeRatio = getEyeOpenRatio(landmarks);

  if (eyeRatio < 0.012) {
    if (!eyeClosedStart) eyeClosedStart = Date.now();

    const closedDuration = Date.now() - eyeClosedStart;

    if (closedDuration > 2000) {
      setStatus("⚠️ Eyes closed (sleepy)");
      playAlert();
      return;
    } else {
      setStatus("👀 Blinking");
      stopAlert();
      return;
    }
  } else {
    eyeClosedStart = null;
  }

  // 🔊 noise penalty (optional helper)
  if (noiseLevel > 60) {
    focusScore -= 20;
  }

  // ================= FINAL DECISION =================
  if (focusScore < 80) {
    setStatus("⚠️ Distracted");
    playAlert();
  } else {
    stopAlert();
    setStatus("🟢 Focusing");
  }
});

// ================= START =================
startBtn.onclick = async () => {
  if (isRunning) return;

  isRunning = true;
  setStatus("Starting...");

  await startMic();

  camera = new Camera(videoElement, {
    onFrame: async () => {
      await faceMesh.send({ image: videoElement });
    },
    width: 420,
    height: 320,
  });

  camera.start();
};

// ================= STOP =================
stopBtn.onclick = () => {
  isRunning = false;

  if (camera) {
    camera.stop();
    camera = null;
  }

  stopAlert();
  setStatus("⏹️ Stopped");
};