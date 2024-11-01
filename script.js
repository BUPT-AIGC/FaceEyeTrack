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

// 保持摄像机的初始方向
let initialCameraRotation = camera.rotation.clone();
let lastRotationOffsetX = 0;
let lastRotationOffsetY = 0;

// 在用户启用摄像头时，记录初始的摄像机方向
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

    // 记录摄像机的初始方向
    initialCameraRotation = camera.rotation.clone();
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

// 眼睛中点相对于物理摄像头的位置
let lastEyeCenterX = 0;
let lastEyeCenterY = 0;

let socket;

// 初始化 WebSocket
function initWebSocket() {
  socket = new WebSocket('ws://localhost:8060'); // 连接到 WebSocket 服务器

  socket.onopen = () => {
    console.log('WebSocket 连接已打开');
  };

  socket.onclose = () => {
    console.log('WebSocket 连接已关闭');
    // 可以添加重连逻辑
  };

  socket.onerror = (error) => {
    console.error('WebSocket 错误:', error);
  };
}

// 调用初始化 WebSocket
initWebSocket();

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
      // 绘制面部关键点 (注意关键点的翻转处理)
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

      // ---- 获取眼睛的位置，并模拟摄像头移动 ----
      const leftEye = landmarks[473];  // 左眼索引
      const rightEye = landmarks[468]; // 右眼索引

      const eyeCenterX = (leftEye.x + rightEye.x) / 2;
      const eyeCenterY = (leftEye.y + rightEye.y) / 2;

      // 构建要发送的数据
      const eyeData = {
        eyeCenterX: eyeCenterX,
        eyeCenterY: eyeCenterY
      };

      // 如果 WebSocket 连接已经打开，则发送数据
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(eyeData));
      }

      // 计算眼睛中心点的偏移量
      const offsetX = (eyeCenterX - 0.5) * 2;
      const offsetY = (eyeCenterY - 0.5) * 2;

      const deltaX = offsetX - lastEyeCenterX;
      const deltaY = offsetY - lastEyeCenterY;

      lastEyeCenterX = offsetX;
      lastEyeCenterY = offsetY;

      // 获取摄像机的“右向”和“上向”向量
      const rightDirection = new THREE.Vector3();
      camera.getWorldDirection(rightDirection); // 获取摄像机朝向
      rightDirection.crossVectors(camera.up, rightDirection); // 摄像机的右方向

      const upDirection = camera.up.clone(); // 摄像机的上方向

      const cameraMoveSpeed = 0.5;

      // 根据面部移动方向，沿着摄像机的“右向”和“上向”移动摄像机
      camera.position.addScaledVector(rightDirection, deltaX * cameraMoveSpeed);
      camera.position.addScaledVector(upDirection, -deltaY * cameraMoveSpeed);

      // 继续让摄像机看向模型中心
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