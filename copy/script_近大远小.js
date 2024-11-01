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
const fpsDisplay = document.getElementById("fpsDisplay");

// 摄像机控制相关变量
let baseCameraZ = 5; // 摄像机的初始距离
let minCameraZ = 1; // 最小摄像机距离
let maxCameraZ = 10; // 最大摄像机距离
let zoomFactor = 0.0001; // 缩放因子，控制摄像机距离变化的灵敏度

// 用于面积变化判断的变量
let lastArea = null; // 用于存储上一帧的三角形面积

// 眼睛位置用于摄像机旋转的变量
let lastEyeCenterX = 0;
let lastEyeCenterY = 0;

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

// 计算三角形面积函数
function calculateTriangleArea(p1, p2, p3) {
  return Math.abs(
    (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y)) / 2
  );
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

  // 水平翻转 canvas
  canvasCtx.save();
  canvasCtx.scale(-1, 1); // 水平翻转
  canvasCtx.translate(-canvasElement.width, 0); // 需要平移回来

  // 绘制翻转后的摄像头画面
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
      // 绘制面部关键点
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

      // ---- 计算三角形面积 ----
      const leftEye = landmarks[473];  // 左眼坐标
      const rightEye = landmarks[468]; // 右眼坐标
      const noseTip = landmarks[1];    // 鼻尖坐标

      const area = calculateTriangleArea(
        { x: leftEye.x * canvasElement.width, y: leftEye.y * canvasElement.height },
        { x: rightEye.x * canvasElement.width, y: rightEye.y * canvasElement.height },
        { x: noseTip.x * canvasElement.width, y: noseTip.y * canvasElement.height }
      );

      // 如果之前有记录面积，计算变化率
      if (lastArea != null) {
        const areaChange = area - lastArea;

        // 根据面积变化调整摄像机距离
        const adjustedCameraZ = camera.position.z - areaChange * zoomFactor;
        camera.position.z = Math.min(maxCameraZ, Math.max(minCameraZ, adjustedCameraZ));
      }

      lastArea = area; // 更新上一帧的面积

      // ---- 基于眼睛中点调整虚拟摄像机的旋转 ----
      const eyeCenterX = (leftEye.x + rightEye.x) / 2;
      const eyeCenterY = (leftEye.y + rightEye.y) / 2;

      // 计算水平和垂直方向的偏移
      const offsetX = (eyeCenterX - 0.5) * 2;
      const offsetY = (eyeCenterY - 0.5) * 2;

      const deltaX = offsetX - lastEyeCenterX;
      const deltaY = offsetY - lastEyeCenterY;

      lastEyeCenterX = offsetX;
      lastEyeCenterY = offsetY;

      // 根据眼睛位置变化调整摄像机位置
      const cameraMoveSpeed = 0.5;
      camera.position.x -= deltaX * cameraMoveSpeed;
      camera.position.y -= deltaY * cameraMoveSpeed;

      // 渲染场景
      camera.lookAt(scene.position);
      renderer.render(scene, camera);
    }
  }

  canvasCtx.restore(); // 恢复翻转前的状态

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