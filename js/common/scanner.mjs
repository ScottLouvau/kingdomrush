import allPositions from "../data/positions.min.mjs";
import towers from "../data/towers.min.mjs";
import settings from '../data/settings.mjs';

const towerNames = ['Arca', 'Arch', 'Arch2', 'Arch3', 'Arti', 'Arti2', 'Arti3', 'Barb', 'Barr', 'Barr2', 'Barr3', 'BigB', 'Holy', 'Mage', 'Mage2', 'Mage3', 'Map', 'Musk', 'None', 'Rang', 'Sorc', 'Tesl'];
const IMAGE_WIDTH = 80;
const IMAGE_HEIGHT = 80;
const IMAGE_CHANNELS = 3;
const IMAGE_SIZE = IMAGE_WIDTH * IMAGE_HEIGHT * IMAGE_CHANNELS;

const ConfidenceThreshold = 0.95;
const SecondsPerFrame = 5;
const PlanEmptyLineAfterSeconds = 40;

const pipGeo = {
    w: 17, h: 17,
    high: { relX: 0, relY: -17 },
    "2x": { n: "2x", relX: -78, relY: -118, w: 17, h: 17 },
    "2y": { n: "2y", relX: 62, relY: -118 },
    "3x": { n: "3x", relX: -95, relY: -99, w: 17, h: 17 },
    "3y": { n: "3y", relX: -8, relY: -144 },
    "3z": { n: "3z", relX: 79, relY: -99 },
    l2: { relX: 25, relY: 10 },
    l3: { relX: 25 + 9, relY: 10 + 24 }
};

export default class Scanner {
    constructor(tf, towerModel, logger, pipModel) {
        this.tf = tf;
        this.towerModel = towerModel;
        this.pipModel = pipModel;
        this.logger = logger;
        this.diagnosticDrawing = null;
    }

    circleAtPosition(ctx, drawing) {
        const id = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (!this.positions) { return null; }

        const positionCount = Object.keys(this.positions).length;
        const pixels = { array: new Float32Array(4 * positionCount * pipGeo.w * pipGeo.h * 3), out: 0 };

        // Look for ability circles at 2x1 and 3x1 high and low for every position
        for (let posName in this.positions) {
            for (let high of [true, false]) {
                for (let abilityCount of [2, 3]) {
                    let r = this.toRect(this.positions[posName], pipGeo[`${abilityCount}x`]);
                    if (high) { r.y -= 17; }
                    this.appendPixels(id, r, pixels);
                }
            }
        }

        const inTensor = this.tf.tensor4d(pixels.array, [4 * positionCount, pipGeo.w, pipGeo.h, 3]);
        const outTensor = this.pipModel.predict(inTensor);
        const firstCircle = this.firstCircle(outTensor);

        inTensor.dispose();
        outTensor.dispose();

        return this.upgradeLevels(id, firstCircle);
    }

    firstCircle(outTensor) {
        const array = outTensor.dataSync();

        let i = 0;
        for (let posName in this.positions) {
            for (let high of [true, false]) {
                for (let abilityCount of [2, 3]) {
                    if (array[3 * i + 2] < 0.1) {
                        return { posName: posName, high: high, abilityCount: abilityCount };
                    }

                    i++;
                }
            }
        }

        return null;
    }

    upgradeLevels(id, firstCircle) {
        if (firstCircle === null) { return null; }
        let result = { posName: firstCircle.posName };

        let rootR = this.positions[firstCircle.posName];
        if (firstCircle.high) { rootR.y -= 17; }

        const pixels = { array: new Float32Array(3 * firstCircle.abilityCount * pipGeo.w * pipGeo.h * 3), out: 0 };

        // Look for ability circles for L1, L2, L3 for each ability present
        for (let ability of (firstCircle.abilityCount === 3 ? ["3x", "3y", "3z"] : ["2x", "2y"])) {
            for (let level of [1, 2, 3]) {
                let r = { ...this.toRect(rootR, pipGeo[ability]), w: pipGeo.w, h: pipGeo.h };
                if (level !== 1) {
                    r = this.toRect(r, pipGeo[`l${level}`]);
                }

                this.appendPixels(id, r, pixels)
            }
        }

        const inTensor = this.tf.tensor4d(pixels.array, [3 * firstCircle.abilityCount, pipGeo.w, pipGeo.h, 3]);
        const outTensor = this.pipModel.predict(inTensor);
        const array = outTensor.dataSync();

        inTensor.dispose();
        outTensor.dispose();

        let i = 0;
        for (let ability of (firstCircle.abilityCount === 3 ? ["3x", "3y", "3z"] : ["2x", "2y"])) {
            let pips = [];

            for (let level of [1, 2, 3]) {
                const black = array[3 * i + 0];
                const blue = array[3 * i + 1];
                const other = array[3 * i + 2];
                const color = (black > 0.9 ? "black" : (blue > 0.9 ? "blue" : "other"));
                pips[level] = color;
                i++;
            }

            let letter = ability[1];
            result[letter] = null;

            if (pips[3] === "blue") {
                if (pips[2] === "blue" && pips[1] === "blue") {
                    result[letter] = 3;
                }
            } else if (pips[2] === "blue") {
                if (pips[1] === "blue") {
                    result[letter] = 2;
                }
            } else if (pips[1] === "blue") {
                result[letter] = 1;
            } else if (pips[1] === "blacK") {
                result[letter] = 0;
            }
        }

        if (result?.x === null || result?.y === null || result?.z === null) { result = null; }
        return result;
    }

    toRect(position, geo) {
        return {
            x: position.x + (geo.relX ?? 0),
            y: position.y + (geo.relY ?? 0),
            w: position.w ?? geo.w,
            h: position.h ?? geo.h
        };
    }

    appendPixels(id, r, result) {
        const a8 = id.data;
        const array = result.array;
        let out = result.out ?? 0;

        let bottom = r.y + r.h;
        let right = r.x + r.w;
        let width = id.width;
        for (let y = r.y; y < bottom; ++y) {
            for (let x = r.x; x < right; ++x) {
                let j = 4 * (y * width + x);
                array[out++] = a8[j] / 255;
                array[out++] = a8[j + 1] / 255;
                array[out++] = a8[j + 2] / 255;
            }
        }

        result.out = out;
    }

    scanImage(ctx, positions, skipDiagnostics) {
        positions ??= this.positions;
        const positionCount = Object.keys(positions).length;

        // Get the profile rectangle pixels for each tower position on the map
        const id = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        const pixels = { array: new Float32Array(positionCount * settings.geo.profile.w * settings.geo.profile.h * 3), out: 0 };

        for (let posName in positions) {
            let r = this.toRect(positions[posName], settings.geo.profile);
            this.appendPixels(id, r, pixels);
        }

        // Classify the tower at every position
        const inTensor = this.tf.tensor4d(pixels.array, [positionCount, settings.geo.profile.w, settings.geo.profile.h, 3]);
        const outTensor = this.towerModel.predict(inTensor);
        const array = outTensor.dataSync();

        inTensor.dispose();
        outTensor.dispose();

        // Return the top predictions at each
        let state = {};

        const classCount = towerNames.length;
        let i = 0;
        for (let posName in positions) {
            let matches = { best: null, prev: null };

            for (let j = 0; j < classCount; ++j) {
                let v = array[j + classCount * i];

                if (matches.best === null || matches.best.confidence < v) {
                    matches.prev = matches.best;
                    matches.best = { name: towerNames[j], confidence: v };
                } else if (matches.prev === null || matches.prev.confidence < v) {
                    matches.prev = { name: towerNames[j], confidence: v };
                }
            }

            state[posName] = matches;
            i++;
        }

        if (!skipDiagnostics) {
            this.drawDiagnostics(positions, state);
        }

        return state;
    }

    drawDiagnostics(positions, state) {
        if (!this.diagnosticDrawing) { return; }

        for (let posName in positions) {
            const prediction = state?.[posName]?.best;

            if (!prediction) { continue; }
            if (prediction.confidence >= 0.95 && (prediction.name === "None" || prediction.name === "Map")) { continue; }

            const color = (prediction.confidence >= 0.95 ? "#0f0" : (prediction.confidence >= 0.85 ? "#f92" : "#f00"));
            const options = { left: true, fontSizePx: 18, textColor: color, backColor: '#222', borderColor: color };
            const r = this.toRect(positions[posName], settings.geo.towerDiagnostics);

            this.diagnosticDrawing.drawBox(r, { borderColor: color });
            this.diagnosticDrawing.drawText({ x: r.x, y: r.y + 17 }, prediction.name, options);
            this.diagnosticDrawing.drawText({ x: r.x, y: r.y + r.h }, `${(prediction.confidence * 100).toFixed(0)}`, options);
        }
    }

    identifyMap(ctx) {
        let best = null;

        // Scan one position at a time per map from every map
        for (let posIndex = 0; posIndex < 20; ++posIndex) {
            let positions = {};

            for (let mapName in allPositions) {
                const pos = Object.values(allPositions[mapName])[posIndex];
                if (!pos) { break; }
                positions[mapName] = { ...pos, name: mapName };
            }

            const state = this.scanImage(ctx, positions, true);
            for (let mapName in state) {
                const matches = state[mapName];
                if (matches.best.name !== 'Map') {
                    if (best === null || matches.best.confidence > best.confidence) {
                        best = { name: mapName, confidence: matches.best.confidence };
                    }

                    // Return on the first high confidence position found
                    if (best.confidence >= ConfidenceThreshold) { break; }
                }
            }

            if (best?.confidence >= ConfidenceThreshold) { break; }
        }

        if (best?.confidence >= ConfidenceThreshold) {
            return best.name;
        } else {
            return null;
        }
    }

    evaluateStep(posName, matches, previous) {
        if (matches?.best?.name === null) {
            return { issue: `ERROR ${posName}: returned no detections.` };
        } else if (matches.best.confidence < ConfidenceThreshold) {
            return { issue: `WARN ${posName}: ignored low confidence ${matches.best.name} (${(matches.best.confidence * 100).toFixed(0)}%)` };
        } else if (matches.best.name === "Map") {
            return { issue: `WARN ${posName}: detection said non-position map space.` };
        } else if (matches.best.name === "None") {
            if (previous !== "None") {
                return { issue: `WARN ${posName}: ignored None where previously ${previous}.` };
            }
        } else if (matches.best.name !== previous) {
            const prevTower = towers.base[previous];
            const currTower = towers.base[matches.best.name];

            if (prevTower) {
                if (currTower.shortName[0] !== prevTower.shortName[0]) {
                    return { issue: `ERROR ${posName}: Can't build ${matches.best.name} on ${previous}.` };
                } else if (currTower.shortName[1] < prevTower.shortName[1]) {
                    return { issue: `ERROR: ${posName}: Tower downgrade to ${matches.best.name} from ${previous}.` };
                }
            }

            return { issue: null, isChange: true };
        }

        return { issue: null, isChange: false };
    }

    logPositionState(posName, matches, previously) {
        let message = `  ${posName}: `;

        if (previously) {
            message += `${previously} => `;
        }

        message += matches.best.name;

        if (matches.best.confidence < 0.98 || matches.prev.confidence > 0.05) {
            message += `     [${(matches?.best?.confidence * 100).toFixed(0)}% or ${(matches?.prev?.confidence * 100).toFixed(0)}% ${matches?.prev?.name}]`;
        }

        this.log(message);
    }

    reset() {
        this.mapName = null;
    }

    init(ctx, mapName) {
        if (!mapName) {
            this.log("Identifying map...");
            mapName = this.identifyMap(ctx);
            if (mapName === null) { return; }
        }

        this.log(mapName);
        this.mapName = mapName;
        this.positions = allPositions[mapName];
        this.plan = [mapName, ''];

        this.world = {};
        for (let posName in this.positions) {
            this.world[posName] = { base: 'None' };
        }

        this.i = 0;
    }

    nextFrame(ctx) {
        if (!this.mapName) {
            this.init(ctx);
            if (!this.mapName) { return; }
        }

        let state = this.scanImage(ctx);
        this.state = state;
        let loggedThisFrame = false;

        for (let posName in state) {
            let matches = state[posName];
            const previous = this.world[posName]?.base?.ln;

            const evaluation = this.evaluateStep(posName, matches, previous);
            if (evaluation.issue === null && evaluation.isChange === false) {
                continue;
            }

            if (loggedThisFrame === false) {
                this.log();
                this.log(`${this.toTimeString(this.i * SecondsPerFrame)}`);
                loggedThisFrame = true;
            }

            if (evaluation.issue != null) {
                this.log(`  ${evaluation.issue}`);
            } else {
                this.logPositionState(posName, matches, previous);

                // Add new step to plan output
                const planStep = `${posName} ${matches.best.name}`;
                if (this.plan[this.plan.length - 1].startsWith(posName)) {
                    // Replace previous step if for same position
                    this.plan[this.plan.length - 1] = planStep;
                } else {
                    // Add log separator if enough time passed since last step
                    if (this.lastChangedFrame < this.i) {
                        if ((this.i - this.lastChangedFrame) >= (PlanEmptyLineAfterSeconds / SecondsPerFrame) && this.plan.length > 2) {
                            this.plan.push('');
                            this.plan.push(`# ${this.toTimeString(this.i * SecondsPerFrame)}`);
                        }
                    }

                    this.plan.push(planStep);
                }


                // Update world state
                this.world[posName].base = towers.base.find((t) => t.ln === matches.best.name);
                this.lastChangedFrame = this.i;
            }
        }

        this.i++;
        return state;
    }

    // Scan a series of PNG frames over time; write the build plan to console and output file
    async scanFrames(nextImage) {
        let ctx = await nextImage();
        this.init(ctx);

        for (; ctx !== null; ctx = await nextImage()) {
            this.nextFrame(ctx);
        }

        return this.plan.join('\r\n');
    }

    log(message) {
        if (!message) { message = ""; }

        if (this.logger) {
            console.log(message);
            this.logger(message);
        }
    }

    toTimeString(totalSeconds) {
        let hours = Math.floor(totalSeconds / 3600);
        let minutes = Math.floor((totalSeconds / 60)) % 60;
        let seconds = Math.floor(totalSeconds) % 60;
        let millis = Math.floor(totalSeconds * 1000) % 1000;

        if (totalSeconds > 0 && totalSeconds < 1) {
            return `${millis.toFixed(0)}ms`;
        }

        let result = `${minutes.toFixed(0).padStart(2, '0')}:${seconds.toFixed(0).padStart(2, '0')}`;

        if (hours > 0) {
            result = `${hours.toFixed(0).padStart(2, '0')}:${result}`;
        }

        if (millis !== 0 && totalSeconds < 10) {
            result += `.${millis.toFixed(0).padStart(3, '0')}`;
        }

        return result;
    }
}