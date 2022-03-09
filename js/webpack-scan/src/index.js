import * as tf from './custom_tfjs.js';
//import { loadLayersModel } from '@tensorflow/tfjs-layers';
//import * as tf from '@tensorflow/tfjs';

import Scanner from '../../common/scanner.mjs';

async function loadJson(url) {
    return await (await fetch(url)).json();
}

// tf.loadFrozenModel('./model.pb', 'weights_manifest.json');
// tf.loadGraphModel('./model.json')

async function scanVideo() {
    const scanner = new Scanner(
        await loadJson('../../data/positions.min.json'),
        await loadJson('../../data/towers.json'),
        //await loadLayersModel('../../data/models/V2/towers.json'),
        await tf.loadGraphModel('../../data/models/v2-u8-graph/model.json'),
        tf,
        log
    );

    const can = document.createElement("canvas");
    can.width = 1920;
    can.height = 1080;
    const ctx = can.getContext('2d');

    const video = document.getElementById("video");
    const duration = video.duration;
    let elapsedSeconds = 0;

    ctx.drawImage(video, 0, 0);
    scanner.init(ctx);
    scanner.nextFrame(ctx);

    video.addEventListener('seeked', async () => {
        ctx.drawImage(video, 0, 0);
        scanner.nextFrame(ctx);

        elapsedSeconds += 20;
        if (elapsedSeconds < duration) {
            video.currentTime = elapsedSeconds;
        } else {
            console.log("Done");
            log("Done");
            document.getElementById("planOut").innerText = scanner.plan.join('\r\n');
            video.onseeked = null;
        }
    });

    elapsedSeconds = 20;
    video.currentTime = elapsedSeconds;
}

function log(message) {
    const target = document.getElementById("log");
    target.innerText += message + '\r\n';
    target.scrollTop = target.scrollHeight - target.clientHeight;
}

async function run() {
    const video = document.getElementById("video");
    video.playbackRate = 10;
    //video.addEventListener('loadeddata', scanVideo);
}

document.addEventListener('DOMContentLoaded', run);
document.getElementById("scan").addEventListener('click', scanVideo);