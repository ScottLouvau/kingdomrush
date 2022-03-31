import * as tf from '../ref/tf.fesm.min.js';
import Scanner from '../common/scanner.mjs';
import Drawing from '../common/drawing.mjs';
import towers from "../data/towers.min.mjs";

const playbackRate = 8;
const circleIntervalSec = 0.333;
const scanIntervalSec = 5;

let pauseOnChange = false;
let videoQueue = [];

// Video element and state of scanning
let image = null;
let video = null;
let duration = null;
let start = null;

let callback = null;
let nextTowerScan = null;
let nextAbilityScan = null;

// Canvas capturing video frames and code to scan frames and parse plans
let scanner = null;
let can = null;
let ctx = null;

let planOut = null;
let lastStep = null;
let diagnostic = null;
let drawing = null;

let state = null;
let circles = null;

async function onLoaded() {
    duration = video.duration;
    start = performance.now();

    nextTowerScan = 0.5;
    nextAbilityScan = 0.5;

    // Play at faster speed
    video.playbackRate = playbackRate;
    video.play();

    callback = setTimeout(onFrame, 50);
}

async function onFrame(e) {
    const elapsed = video.currentTime;
    let next = Math.min(nextTowerScan, nextAbilityScan);
    let log = `@${elapsed.toFixed(2)}`;

    if (elapsed >= next) {
        // Grab a frame
        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, 1920, 1080);
        drawing.drawImage(can, 0, 0);
        progress.style.width = `${(100 * elapsed / duration).toFixed(2)}%`;
    }

    let circle = null;
    if (elapsed >= nextAbilityScan) {
        const thisAbilityScan = nextAbilityScan;
        nextAbilityScan = elapsed + circleIntervalSec;

        const start = performance.now();
        let circleIterations = 1;
        for (let i = 0; i < circleIterations; ++i) {
            circle = scanner.circleAtPosition(ctx);
        }
        const end = performance.now();
        log += `\n Ability in ${(end - start).toFixed(0)}ms, wanted @${thisAbilityScan.toFixed(2)}, lag ${((elapsed - thisAbilityScan) * 1000).toFixed(0)}ms`;
    }

    if (elapsed >= nextTowerScan) {
        const thisTowerScan = nextTowerScan;
        nextTowerScan = elapsed + scanIntervalSec;

        const start = performance.now();
        let towerIterations = 1;
        for (let i = 0; i < towerIterations; ++i) {
            state = scanner.nextFrame(ctx);
        }
        const end = performance.now();

        if (!circles.map && scanner.mapName) {
            circles.map = scanner.mapName;
        }

        log += `\n Towers in ${(end - start).toFixed(0)}ms, wanted @${thisTowerScan.toFixed(2)}, lag ${((elapsed - thisTowerScan) * 1000).toFixed(0)}ms`;
    }

    if (circle !== null) {
        let last = scanner.world[circle.posName];

        if (last?.base?.sn?.[1] ?? 0 < 4) {
            state = scanner.nextFrame(ctx);
            last = scanner.world[circle.posName];
        }

        circles.circles.push({ "pos": circle.posName, "at": Math.floor(elapsed * 100) / 100, "hi": circle.hi, "on": last?.base?.sn, "x": circle.x, "y": circle.y, "z": circle.z });

        if (!last?.base?.sn) {
            console.log(`ERROR: Didn't find tower for ability upgrade at ${circle.posName}`);
        } else {
            checkForNewUpgrade(last, circle, "x");
            checkForNewUpgrade(last, circle, "y");
            checkForNewUpgrade(last, circle, "z");
        }
    }

    const last = scanner.plan?.[scanner?.plan?.length - 1];
    if (lastStep !== last) {
        lastStep = last;
        const planText = scanner.plan?.join('\r\n') ?? "Identifying Map...";
        planOut.value = planText;
        planOut.scrollTop = planOut.scrollHeight - planOut.clientHeight;

        if (pauseOnChange) {
            video.pause();
            return;
        }
    }

    next = Math.min(nextTowerScan, nextAbilityScan);
    if (next < duration) {
        const waitMs = Math.floor(Math.max(10, 1000 * (next - 0.05 - video.currentTime) / playbackRate));
        callback = setTimeout(onFrame, waitMs);
        log += `\n Sleep ${waitMs}ms`;
    }

    console.log(log);
}

function scanImage() {
    ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, 1920, 1080);
    drawing.drawImage(can);
    state = scanner.nextFrame(ctx);
    let circle = scanner.circleAtPosition(ctx);
    console.log(`Detected Map ${scanner.mapName}; circle:`);
    console.log(circle);
}

function checkForNewUpgrade(last, circle, letter) {
    const newLevel = circle[letter];
    if (newLevel && newLevel > (last[letter]?.level ?? 0)) {
        let upgrade = towers.upgrades.find((u) => u.on === last.base.sn && u.sn === letter);

        if (!upgrade) {
            console.log(`ERROR: Didn't find upgrade ${letter}${newLevel} on ${last.base.ln} at ${circle.posName}`);
        } else {
            last[letter] = { level: newLevel };
            const step = `${circle.posName} ${upgrade.ln}${newLevel}`;
            if (scanner.plan[scanner.plan.length - 1].startsWith(step.slice(0, -1))) {
                scanner.plan[scanner.plan.length - 1] = step;
            } else {
                scanner.plan.push(step);
            }
        }
    }
}

async function onEnded(e) {
    const end = performance.now();
    const timeSeconds = (end - start) / 1000;
    console.log(`Video Played through in: ${timeSeconds.toFixed(1)}s (${(video.duration / timeSeconds).toFixed(1)}x)`);

    // Disabling while testing
    //downloadData();
    nextVideo();
}

async function onDrop(e) {
    // Suppress browser opening file
    e.preventDefault();

    if (e.dataTransfer.items && e.dataTransfer.items.length >= 1) {
        for (var i = 0; i < e.dataTransfer.items.length; ++i) {
            let item = e.dataTransfer.items[i];
            if (item.kind === 'file') {
                const file = await item.getAsFile();
                const url = URL.createObjectURL(file);
                const name = file.name.replace(/\.[^\.]+$/, '');
                videoQueue.push({ name: name, url: url, type: item.type });
            }
        }

        nextVideo();
    }
}

function nextVideo() {
    if (videoQueue?.length > 0) {
        const item = videoQueue[0];
        videoQueue.shift();

        scanner.mapName = null;
        state = null;
        circles = { "name": item.name, "circles": [] };

        if (item.type.startsWith("image/")) {
            image.src = item.url;
        } else if (item.type.startsWith("video/")) {
            video.src = item.url;
        }
    }
}

function downloadData() {
    download(circlesJson(), "text/json", `${circles.name}.json`);
    download(planOut.value, "text/plain", `${circles.name}.txt`);
}

function circlesJson() {
    let out = `{ "name": "${circles.name}", "map": "${circles.map}", "circles": [`;

    for (let i = 0; i < circles.circles.length; ++i) {
        out += `${(i > 0 ? ',' : '')}\n\t${JSON.stringify(circles.circles[i])}`;
    }

    out += "\n]}\n";
    return out;
}

function download(text, type, fileName) {
    const blob = new Blob([text], { type: type });
    const tempLink = document.createElement("a");

    tempLink.download = fileName;
    tempLink.href = URL.createObjectURL(blob);
    document.body.appendChild(tempLink);
    tempLink.click();
    document.body.removeChild(tempLink);
}

function keyDown(e) {
    if (e.keyCode === 32) {
        e.preventDefault();

        if (video.paused) {
            video.play();
            onFrame();
        } else {
            video.pause();
            clearTimeout(callback);
            callback = null;
        }
    }
}

async function run() {
    // Create an image element to get dropped images
    image = document.createElement('img');
    image.addEventListener('load', scanImage);

    // Create a video element to get dropped videos to extract frames from
    video = document.getElementById('video');
    video.width = 1920;
    video.height = 1080;
    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('ended', onEnded);
    video.style.display = "none";

    // Build canvas to copy frames to
    can = document.createElement("canvas");
    can.width = 1920;
    can.height = 1080;
    ctx = can.getContext('2d');

    planOut = document.getElementById('planOut');

    // Get canvas diagnostics are drawn to
    diagnostic = document.getElementById("diagnostic");
    drawing = new Drawing(diagnostic);

    // Initialize AI scanner
    const model = await tf.loadGraphModel('../data/models/v2-u8-graph/model.json');
    const pipModel = await tf.loadLayersModel('../data/models/pips-tiny/pips.json');
    scanner = new Scanner(tf, model, pipModel, drawing);//, console.log);

    // Precompile AI models for faster first frame handling
    scanner.prewarm();

    // Accept drag-and-drop video anywhere
    document.body.addEventListener('dragover', (e) => { e.preventDefault(); });
    document.body.addEventListener('drop', onDrop);
    document.addEventListener('keydown', keyDown);

    // Enable pause on each change if querystring requests
    const params = new URLSearchParams(window.location.search);
    pauseOnChange = (!!params.get("pause"));
}

document.addEventListener('DOMContentLoaded', run);