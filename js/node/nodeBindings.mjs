import fs from 'fs';
import canvas from 'canvas';
import webp from '@cwasm/webp';

async function loadJson(url) {
    return JSON.parse(await fs.promises.readFile(url, 'utf8'));
}

async function loadToContext(url, ctx) {
    if (url.toLowerCase().endsWith(".webp")) {
        await loadWebP(url, ctx);
    } else {
        const img = await loadImage(url);
        ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);
    }
}

async function loadImage(url) {
    return canvas.loadImage(url);
}

async function loadWebP(url, ctx) {
    // '@cwasm/webp' provides WebP decoding but the ImageData returned isn't 
    // the same as the 'canvas' type, so interop by copying the pixel bytes.

    const file = await fs.promises.readFile(url);
    const inId = webp.decode(file);

    if (!ctx) {
        const can = createCanvas(inId.width, inId.height);
        ctx = can.getContext('2d');
    }

    const outId = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const i8 = inId.data;
    const o8 = outId.data;

    for (let i = 0; i < i8.length; ++i) {
        o8[i] = i8[i];
    }

    ctx.putImageData(outId, 0, 0);
    return ctx;
}

function createCanvas(width, height) {
    return canvas.createCanvas(width, height);
}

async function loadToCanvas(url) {
    const img = await canvas.loadImage(url);
    const can = createCanvas(img.width, img.height);
    const ctx = can.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return can;
}

async function saveAsPng(path, can, height) {
    let toSave = can;

    if (height && height != can.height) {
        const can2 = createCanvas(Math.floor(can.width * (height / can.height)), height);
        const ctx2 = can2.getContext('2d');
        ctx2.drawImage(can, 0, 0, can2.width, can2.height);
        toSave = can2;
    }

    await fs.promises.writeFile(path, await toSave.toBuffer('image/png'));
}

export { loadJson, loadImage, createCanvas, loadToCanvas, saveAsPng, loadToContext };