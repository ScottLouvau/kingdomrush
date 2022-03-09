import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import { performance } from 'perf_hooks';
import { loadJson, createCanvas, loadImage, loadToContext } from './nodeBindings.mjs';
import tf from '@tensorflow/tfjs-node';

import Scanner from '../common/scanner.mjs';

const SecondsPerFrame = 20;
const ffmpeg = "\\Users\\slouv\\OneDrive\\Tools\\bin\\ffmpeg\\ffmpeg.exe";

// Extract periodic frames from a gameplay video, scan them, and write the build plan seen.
async function scanVideo(scanner, videoPath, planOutputFilePath) {
    const start = performance.now();
    const videoParsed = path.parse(videoPath);
    const videoStats = await fs.promises.stat(videoPath);
    const cacheFramesPath = `/Working/Frames/${videoParsed.name}-${(videoStats.mtimeMs / 1000).toFixed(0)}`;
    planOutputFilePath ??= `${videoParsed.dir}/../Plans/${videoParsed.name}.txt`;
    console.log(`Transcribing "${videoParsed.name}"...`);

    if (fs.existsSync(cacheFramesPath)) {
        console.log(`Extracted frames already found at "${cacheFramesPath}".`);
    } else {
        console.log(`Extracting frames from "${videoPath}" to "${cacheFramesPath}"...`);

        await fs.promises.rm(cacheFramesPath, { force: true, recursive: true });
        await fs.promises.mkdir(cacheFramesPath, { recursive: true });
        child_process.execSync(`"${ffmpeg}" -i "${videoPath}" -vf "fps=1/${SecondsPerFrame}" -vsync vfr -f image2 -y "${cacheFramesPath}/F%03d.png"`);

        console.log(`Done in ${((performance.now() - start) / 1000).toFixed(1)} sec.`);
        console.log();
    }

    const can = createCanvas(1920, 1080);
    const ctx = can.getContext('2d');
    const imageFilePaths = await fs.promises.readdir(cacheFramesPath);

    let i = 0;
    const plan = await scanner.scanFrames(async () => {
        if (i >= imageFilePaths.length) {
            return null;
        } else {
            ctx.drawImage(await loadImage(`${cacheFramesPath}/${imageFilePaths[i]}`), 0, 0);
            i++;
            return ctx;
        }
    });

    await fs.promises.rm(cacheFramesPath, { force: true, recursive: true });

    if (planOutputFilePath) {
        await fs.promises.mkdir(path.parse(planOutputFilePath).dir, { recursive: true });
        await fs.promises.writeFile(planOutputFilePath, plan);
        console.log(`Saved to ${planOutputFilePath}.`);
    }
}

async function scanAllVideos(scanner, inputPath, outputPath) {
    outputPath ??= `${inputPath}/../Plans`;
    await fs.promises.mkdir(outputPath, { recursive: true });
    console.log(`Transcribing all missing plans from "${inputPath}" to "${outputPath}"...`);

    const videoPaths = await fs.promises.readdir(inputPath);
    const planPaths = await fs.promises.readdir(outputPath);

    for (let i = 0; i < videoPaths.length; ++i) {
        const videoPath = videoPaths[i];
        const videoParsed = path.parse(videoPath);
        const outName = `${videoParsed.name}.txt`;

        if (videoParsed.ext.toLowerCase() === ".mp4" && !planPaths.find((t) => t.toLowerCase() === outName.toLowerCase())) {
            await scanVideo(scanner, `${inputPath}/${videoPath}`, `${outputPath}/${outName}`);
        }
    }

    console.log(`Done.`);
}

async function testFolder(scanner, path) {
    console.log(`Looking for Ability Upgrades in images under "${path}"...`);

    const can = createCanvas(1920, 1080);
    const ctx = can.getContext('2d');

    const imagePaths = await fs.promises.readdir(path);
    for (let i = 0; i < imagePaths.length; ++i) {
        const imagePath = `${path}/${imagePaths[i]}`;
        await testImage(scanner, imagePath, ctx);
    }
}

async function testImage(scanner, imagePath, ctx) {
    if (!ctx) {
        const can = createCanvas(1920, 1080);
        ctx = can.getContext('2d');
    }

    const name = path.parse(imagePath).name;
    await loadToContext(imagePath, ctx);

    if (!scanner.mapName) {
        scanner.init(ctx);
    }

    const upgrades = scanner.circleAtPosition(ctx);
    if (upgrades === null) {
        console.log(` - ${name}: None`);
    } else if (upgrades.z === undefined) {
        console.log(` - ${name} ${upgrades.posName}: x=${upgrades.x}, y=${upgrades.y}`);
    } else {
        console.log(` - ${name} ${upgrades.posName}: x=${upgrades.x}, y=${upgrades.y}, z=${upgrades.z}`);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const mode = args[0].toLowerCase();

    if (args.length < 1) {
        console.log("Usage: node scan.js <mode> <inPath> <outPlanPath?>");
        console.log("Modes:");
        console.log(" video:      List build plan found in video.");
        console.log(" allVideos:  Generate all missing build plans in <outPath> for videos in <inPath>.");
        return;
    }

    const scanner = new Scanner(
        tf,
        await tf.loadGraphModel('file://../data/models/v2-u8-graph/model.json'),
    );

    const inputPath = args[1];
    const planOutPath = args[2];

    if (mode === "video") {
        await scanVideo(scanner, inputPath, planOutPath);
    } else if (mode === "allvideos") {
        await scanAllVideos(scanner, inputPath);
    } else if (mode === "test") {
        if (path.parse(inputPath).ext.toLowerCase() === ".png") {
            await testImage(scanner, inputPath);
        } else {
            await testFolder(scanner, inputPath);
        }
    } else {
        console.log(`Unknown Mode: ${mode}`);
    }
}

main();