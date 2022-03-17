/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

const classNames = ['black', 'blue', 'other'];

const IMAGE_WIDTH = 17;
const IMAGE_HEIGHT = 17;
const IMAGE_CHANNELS = 3; // 1;

const TRAIN_PERCENTAGE = 0.75;

const CountsUrl = `../data/train-sprites/pip/counts.json`;
const SpriteUrl = `../data/train-sprites/pip/pips.png`;

/**
 * A class that fetches the sprited Towers dataset and returns shuffled batches.
 */
export class TowerData {
  constructor() {
    this.shuffledTrainIndex = 0;
    this.shuffledTestIndex = 0;

    this.width = IMAGE_WIDTH;
    this.height = IMAGE_HEIGHT;
    this.channels = IMAGE_CHANNELS;
    this.labels = classNames;
  }

  async load() {
    let total = 0;

    await fetch(CountsUrl).then(response => response.text()).then(data => {
      // Labels come as a count per tower type in class order, as are the images
      const counts = JSON.parse(data);

      for (var towerName in counts) {
        total += counts[towerName];
      }

      let labels = new Uint8Array(total * this.labels.length);
      labels.fill(0);

      let out = 0;
      let classIndex = 0;
      for (var towerName in counts) {
        // Find how many images there are for this class
        var count = counts[towerName];

        // Mark the next 'count' images as the current class index
        for (var j = 0; j < count; ++j) {
          labels[out * this.labels.length + classIndex] = 1;
          out++;
        }

        classIndex++;
      }

      this.datasetLabels = labels;
    });

    const datasetBytes = new Uint8Array(total * this.width * this.height * this.channels);
    this.datasetImages = datasetBytes;

    // Make a request for the sprited images.
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    await new Promise((resolve, reject) => {
      img.crossOrigin = '';
      img.onload = () => {
        img.width = img.naturalWidth;
        img.height = img.naturalHeight;
        canvas.width = img.width;
        canvas.height = img.height;

        ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, img.width, img.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const a8 = imageData.data;

        // Put each 80x80 sprites RGB values into the array in single rows
        const rows = img.height / this.height;
        const cols = img.width / this.width;

        console.log(`Spritesheet is ${img.naturalWidth}w x ${img.naturalHeight}h as ${rows} rows by ${cols} cols.`);

        let bad = 0;
        let out = 0;
        for (let row = 0; row < rows; ++row) {
          for (let col = 0; col < cols; ++col) {
            if (row * cols + col >= total) { break; }

            for (let y = 0; y < this.height; ++y) {
              for (let x = 0; x < this.width; ++x) {
                let px = (row * this.height + y) * img.width + (col * this.width) + x;
                let j = 4 * px;
                datasetBytes[out++] = a8[j];
                datasetBytes[out++] = a8[j + 1];
                datasetBytes[out++] = a8[j + 2];

                // [Monochrome]
                //datasetBytes[out++] = Math.floor(0.2126 * a8[j] + 0.7152 * a8[j + 1] + 0.0722 * a8[j + 2])

                bad += (j + 3 >= a8.length ? 1 : 0);
              }
            }
          }
        }

        console.log(`Loaded ${out.toLocaleString()} of ${datasetBytes.length.toLocaleString()}; ERRORS: ${bad.toLocaleString()}.`);
        resolve();
      };
      img.src = SpriteUrl;
    });

    this.total = total;
    this.trainCount = Math.floor(total * TRAIN_PERCENTAGE);
    this.testCount = total - this.trainCount;

    // Create shuffled indices into the data set and separate into those
    // which will be for training and testing.
    const shuffledIndices = tf.util.createShuffledIndices(total);
    this.trainIndices = shuffledIndices.slice(0, this.trainCount);
    this.testIndices = shuffledIndices.slice(this.trainCount);
  }

  nextTrainBatch(batchSize) {
    return this.nextBatch(batchSize, [this.datasetImages, this.datasetLabels], () => {
      this.shuffledTrainIndex =
        (this.shuffledTrainIndex + 1) % this.trainIndices.length;
      return this.trainIndices[this.shuffledTrainIndex];
    });
  }

  nextTestBatch(batchSize) {
    return this.nextBatch(batchSize, [this.datasetImages, this.datasetLabels], () => {
      this.shuffledTestIndex =
        (this.shuffledTestIndex + 1) % this.testIndices.length;
      return this.testIndices[this.shuffledTestIndex];
    });
  }

  nextBatch(batchSize, data, index) {
    const batchImagesArray = new Float32Array(batchSize * this.width * this.height * this.channels);
    const batchLabelsArray = new Uint8Array(batchSize * this.labels.length);

    for (let i = 0; i < batchSize; i++) {
      const idx = index();

      for (let j = 0; j < this.width * this.height * this.channels; ++j) {
        batchImagesArray[i * this.width * this.height * this.channels + j] = data[0][idx * this.width * this.height * this.channels + j] / 255;
      }

      for (let j = 0; j < this.labels.length; ++j) {
        batchLabelsArray[i * this.labels.length + j] = data[1][idx * this.labels.length + j];
      }
    }

    const xs = tf.tensor2d(batchImagesArray, [batchSize, this.width * this.height * this.channels]);
    const labels = tf.tensor2d(batchLabelsArray, [batchSize, this.labels.length]);

    return { xs, labels };
  }
}
