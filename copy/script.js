import vision from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
const { FaceLandmarker, FilesetResolver, DrawingUtils } = vision;
const demosSection = document.getElementById("demos");

let faceLandmarker;
let runningMode = "IMAGE"; // "IMAGE" or "VIDEO"
let enableWebcamButton;
let webcamRunning = false;
const videoWidth = 480;

// FPS 相关变量
let lastFrameTime = 0;
let frameCount = 0;
let fps = 0;

// 获取 FPS 显示的 DOM 元素
const fpsDisplay = document.getElementById("fpsDisplay");

async function createFaceLandmarker() {
  const filesetResolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );
  faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
      delegate: "GPU"
    },
    runningMode,
    numFaces: 1
  });
  demosSection.classList.remove("invisible");
}
createFaceLandmarker();

// 摄像头检测
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");

function hasGetUserMedia() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

if (hasGetUserMedia()) {
  enableWebcamButton = document.getElementById("webcamButton");
  enableWebcamButton.addEventListener("click", enableCam);
} else {
  console.warn("getUserMedia() 不被您的浏览器支持");
}

function enableCam() {
  if (!faceLandmarker) {
    console.log("还在加载面部标记器，请稍等...");
    return;
  }

  if (webcamRunning) {
    webcamRunning = false;
    enableWebcamButton.innerText = "启用摄像头";
  } else {
    webcamRunning = true;
    enableWebcamButton.innerText = "禁用摄像头";
  }

  const constraints = { video: true };
  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    video.srcObject = stream;
    video.addEventListener("loadeddata", predictWebcam);
  });
}

// 实时预测
let lastVideoTime = -1;
let results = undefined;
const drawingUtils = new DrawingUtils(canvasCtx);

async function predictWebcam() {
  const radio = video.videoHeight / video.videoWidth;
  video.style.width = videoWidth + "px";

  canvasElement.style.width = videoWidth + "px";
  canvasElement.style.height = videoWidth * radio + "px";
  canvasElement.width = video.videoWidth;
  canvasElement.height = video.videoHeight;

  // 清空 canvas
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);

  if (runningMode === "IMAGE") {
    runningMode = "VIDEO";
    await faceLandmarker.setOptions({ runningMode });
  }

  let startTimeMs = performance.now();
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;
    results = faceLandmarker.detectForVideo(video, startTimeMs);
  }

  if (results.faceLandmarks) {
    for (const landmarks of results.faceLandmarks) {
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_TESSELATION,
        { color: "#C0C0C070", lineWidth: 1 }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
        { color: "#FF3030" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
        { color: "#FF3030" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
        { color: "#30FF30" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
        { color: "#30FF30" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
        { color: "#E0E0E0" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LIPS,
        { color: "#E0E0E0" }
      );
    }
  }

  // 计算 FPS
  calculateFPS();

  if (webcamRunning) {
    window.requestAnimationFrame(predictWebcam);
  }
}

// 计算 FPS 并显示
function calculateFPS() {
  const now = performance.now();
  frameCount++;

  if (now - lastFrameTime >= 1000) {
    fps = frameCount;
    frameCount = 0;
    lastFrameTime = now;
    fpsDisplay.innerText = `FPS: ${fps}`;
  }
}