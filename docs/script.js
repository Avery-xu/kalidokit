const {
    Application,
    live2d: { Live2DModel },
} = PIXI;

// Kalidokit provides a simple easing function
// (linear interpolation) used for animation smoothness
// you can use a more advanced easing function if you want
const {
    Face,
    Vector: { lerp },
    Utils: { clamp },
} = Kalidokit;

// Url to Live2D
const modelUrl1 = "../models/hiyori/hiyori_pro_t10.model3.json";
const modelUrl2 = "../models/haru_greeter_pro_jp/runtime/haru_greeter_t03.model3.json";

let currentModel1, currentModel2, facemesh, socket;

const videoElement = document.querySelector(".input_video"),
    guideCanvas = document.querySelector("canvas.guides");

(async function main() {
    // socket connect
    socket = io.connect('http://localhost:8080');
    socket.on("get", (data) => {
        rigFace(JSON.parse(data), 0.5, 2);
      });

    // create pixi application
    const app = new PIXI.Application({
        view: document.getElementById("live2d"),
        autoStart: true,
        backgroundAlpha: 0,
        backgroundColor: 0xffffff,
        resizeTo: window,
    });

    // load live2d model
    currentModel1 = await Live2DModel.from(modelUrl1, { autoInteract: false });
    currentModel1.scale.set(0.4);
    currentModel1.interactive = true;
    currentModel1.anchor.set(0.5, 0.5);
    currentModel1.position.set(window.innerWidth * 0.25, window.innerHeight * 0.8);
    currentModel2 = await Live2DModel.from(modelUrl2, { autoInteract: false });
    currentModel2.scale.set(0.4);
    currentModel2.interactive = true;
    currentModel2.anchor.set(0.5, 0.5);
    currentModel2.position.set(window.innerWidth * 0.75, window.innerHeight * 0.8);

    // Add events to drag model
    currentModel1.on("pointerdown", (e) => {
        currentModel1.offsetX = e.data.global.x - currentModel1.position.x;
        currentModel1.offsetY = e.data.global.y - currentModel1.position.y;
        currentModel1.dragging = true;
    });
    currentModel1.on("pointerup", (e) => {
        currentModel1.dragging = false;
    });
    currentModel1.on("pointermove", (e) => {
        if (currentModel1.dragging) {
            currentModel1.position.set(e.data.global.x - currentModel1.offsetX, e.data.global.y - currentModel1.offsetY);
        }
    });
    currentModel2.on("pointerdown", (e) => {
        currentModel2.offsetX = e.data.global.x - currentModel2.position.x;
        currentModel2.offsetY = e.data.global.y - currentModel2.position.y;
        currentModel2.dragging = true;
    });
    currentModel2.on("pointerup", (e) => {
        currentModel2.dragging = false;
    });
    currentModel2.on("pointermove", (e) => {
        if (currentModel2.dragging) {
            currentModel2.position.set(e.data.global.x - currentModel2.offsetX, e.data.global.y - currentModel2.offsetY);
        }
    });

    // Add mousewheel events to scale model
    document.querySelector("#live2d").addEventListener("wheel", (e) => {
        e.preventDefault();
        currentModel1.scale.set(clamp(currentModel1.scale.x + event.deltaY * -0.001, -0.5, 10));
    });
    document.querySelector("#live2d").addEventListener("wheel", (e) => {
        e.preventDefault();
        currentModel2.scale.set(clamp(currentModel2.scale.x + event.deltaY * -0.001, -0.5, 10));
    });

    // add live2d model to stage
    app.stage.addChild(currentModel1);
    app.stage.addChild(currentModel2);

    // create media pipe facemesh instance
    facemesh = new FaceMesh({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        },
    });

    // set facemesh config
    facemesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
    });

    // pass facemesh callback function
    facemesh.onResults(onResults);

    startCamera();

    // get data every 30ms
    setInterval(getData, 30);
})();

const getData = () => {
    socket.emit("get");
}

const onResults = (results) => {
    drawResults(results.multiFaceLandmarks[0]);
    let data = solveData(results.multiFaceLandmarks[0]); 
    sendData(dataFilter(data));
    rigFace(data, 0.5, 1);
};

// draw connectors and landmarks on output canvas
const drawResults = (points) => {
    if (!guideCanvas || !videoElement || !points) return;
    guideCanvas.width = videoElement.videoWidth;
    guideCanvas.height = videoElement.videoHeight;
    let canvasCtx = guideCanvas.getContext("2d");
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
    // Use `Mediapipe` drawing functions
    drawConnectors(canvasCtx, points, FACEMESH_TESSELATION, {
        color: "#C0C0C070",
        lineWidth: 1,
    });
    if (points && points.length === 478) {
        //draw pupils
        drawLandmarks(canvasCtx, [points[468], points[468 + 5]], {
            color: "#ffe603",
            lineWidth: 2,
        });
    }
};

const solveData = (points) => {
    if (!points) return;
    return Face.solve(points, {
            runtime: "mediapipe",
            video: videoElement,
        });
};

const sendData = (data) => {
    if (!data) return;
    socket.emit("post", JSON.stringify(data));
}

// update live2d model internal state
const rigFace = (result, lerpAmount = 0.7, model = 1) => {
    let currentModel;
    if (model === 1) 
        currentModel = currentModel1;
    else 
        currentModel = currentModel2;

    if (!currentModel || !result) return;
    const coreModel = currentModel.internalModel.coreModel;
    result.head.y = result.head.degrees.y * 3.14159265358979324 / 180;

    currentModel.internalModel.motionManager.update = (...args) => {
        // disable default blink animation
        currentModel.internalModel.eyeBlink = undefined;

        coreModel.setParameterValueById(
            "ParamEyeBallX",
            lerp(result.pupil.x, coreModel.getParameterValueById("ParamEyeBallX"), lerpAmount)
        );
        coreModel.setParameterValueById(
            "ParamEyeBallY",
            lerp(result.pupil.y, coreModel.getParameterValueById("ParamEyeBallY"), lerpAmount)
        );

        // X and Y axis rotations are swapped for Live2D parameters
        // because it is a 2D system and KalidoKit is a 3D system
        coreModel.setParameterValueById(
            "ParamAngleX",
            lerp(result.head.degrees.y, coreModel.getParameterValueById("ParamAngleX"), lerpAmount)
        );
        coreModel.setParameterValueById(
            "ParamAngleY",
            lerp(result.head.degrees.x, coreModel.getParameterValueById("ParamAngleY"), lerpAmount)
        );
        coreModel.setParameterValueById(
            "ParamAngleZ",
            lerp(result.head.degrees.z, coreModel.getParameterValueById("ParamAngleZ"), lerpAmount)
        );

        // update body params for models without head/body param sync
        const dampener = 0.3;
        coreModel.setParameterValueById(
            "ParamBodyAngleX",
            lerp(result.head.degrees.y * dampener, coreModel.getParameterValueById("ParamBodyAngleX"), lerpAmount)
        );
        coreModel.setParameterValueById(
            "ParamBodyAngleY",
            lerp(result.head.degrees.x * dampener, coreModel.getParameterValueById("ParamBodyAngleY"), lerpAmount)
        );
        coreModel.setParameterValueById(
            "ParamBodyAngleZ",
            lerp(result.head.degrees.z * dampener, coreModel.getParameterValueById("ParamBodyAngleZ"), lerpAmount)
        );

        // Simple example without winking.
        // Interpolate based on old blendshape, then stabilize blink with `Kalidokit` helper function.
        let stabilizedEyes = Kalidokit.Face.stabilizeBlink(
            {
                l: lerp(result.eye.l, coreModel.getParameterValueById("ParamEyeLOpen"), 0.7),
                r: lerp(result.eye.r, coreModel.getParameterValueById("ParamEyeROpen"), 0.7),
            },
            result.head.y
        );
        // eye blink
        coreModel.setParameterValueById("ParamEyeLOpen", stabilizedEyes.l);
        coreModel.setParameterValueById("ParamEyeROpen", stabilizedEyes.r);

        // mouth
        coreModel.setParameterValueById(
            "ParamMouthOpenY",
            lerp(result.mouth.y, coreModel.getParameterValueById("ParamMouthOpenY"), 0.3)
        );
        // Adding 0.3 to ParamMouthForm to make default more of a "smile"
        coreModel.setParameterValueById(
            "ParamMouthForm",
            0.3 + lerp(result.mouth.x, coreModel.getParameterValueById("ParamMouthForm"), 0.3)
        );
    };
};

// start camera using mediapipe camera utils
const startCamera = () => {
    const camera = new Camera(videoElement, {
        onFrame: async () => {
            await facemesh.send({ image: videoElement });
        },
        width: 640,
        height: 480,
    });
    camera.start();
};

const dataFilter = (data) => {
    if (!data) return;
    return {
        pupil : data.pupil,
        head : {
            degrees : {
                x : data.head.degrees.x,
                y : data.head.degrees.y,
                z : data.head.degrees.z
            }
        },
        eye : data.eye,
        mouth : {
            x : data.mouth.x,
            y : data.mouth.y
        }
    }
}