import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import canvas from 'canvas';
import { performance } from 'perf_hooks';

import { loadJson, saveAsPng } from './nodeBindings.mjs';
import Animator from '../common/animator.mjs';

const ffmpeg = "\\Users\\slouv\\OneDrive\\Tools\\bin\\ffmpeg\\ffmpeg.exe";

async function animate(planPath) {
    console.log(`Animating '${planPath}'...`);

    const pngPath = './playthrough';
    await fs.promises.rm(pngPath, { recursive: true, force: true });
    await fs.promises.mkdir(pngPath);

    const can = canvas.createCanvas(1920, 1080);
    const animator = new Animator(canvas.loadImage, can);

    const planText = await fs.promises.readFile(planPath, 'utf8');
    const plan = await animator.parsePlan(planText);

    if (plan.errors.length > 0) {
        for (let i = 0; i < plan.errors.length; ++i) {
            console.log(plan.errors[i]);
        }

        return;
    }

    let frame = 1;
    while (!animator.isDone()) {
        animator.next();
        console.log(` ${frame}. ${plan.steps[frame - 1].text}`)
        await saveAsPng(`${pngPath}/S${frame.toString().padStart(3, '0')}.png`, can);
        frame++;
    }

    const planParsed = path.parse(planPath);
    const outPath = `${planParsed.dir}/animated/${planParsed.name}.mp4`;
    console.log(`Converting to ${outPath}...`);
    await fs.promises.mkdir(`${planParsed.dir}/animated`, { recursive: true });
    child_process.execSync(`${ffmpeg} -r 1 -i "${pngPath}\\S%03d.png" -c:v libx264 -preset veryfast -vf format=yuv420p,scale=1920:1080,fps=30 -y  "${outPath}"`);
    
    // "%magick%" -quality 70 -loop 1 -delay 75 "node\playthrough\*.png" "animation.webp" [700 KB]
    // "%ffmpeg%" -r 1 -i "%~dp0node\playthrough\S%%03d.png" -filter:v fps=fps=1 -lossless 0 -q:v 70 animation.ffmpeg.webm [1,290 KB]
    // "%img2webp%" [argsFile] ... ArgsFile: -o [outFile] -loop 1 -lossy -q 70 -d 750 [listOfPngs]

    //await fs.promises.rm(pngPath, { recursive: true, force: true });
}

async function main() {
    const start = performance.now();
    const args = process.argv.slice(2);

    await animate(args[0]);

    const end = performance.now();
    console.log();
    console.log(`Done in ${((end - start) / 1000).toFixed(1)}s.`);
}

main();