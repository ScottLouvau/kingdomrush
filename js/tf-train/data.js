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

const NUM_CLASSES = 22;

const IMAGE_WIDTH = 80;
const IMAGE_HEIGHT = 80;
const IMAGE_CHANNELS = 3; // 1;
const IMAGE_SIZE = IMAGE_WIDTH * IMAGE_HEIGHT * IMAGE_CHANNELS;

const NUM_DATASET_ELEMENTS = 9449;
const NUM_TRAIN_ELEMENTS = 8750;
const NUM_TEST_ELEMENTS = NUM_DATASET_ELEMENTS - NUM_TRAIN_ELEMENTS;

const CountsUrl = `../data/train-sprites/counts.json`;
const SpriteUrl = `../data/train-sprites/sprites.webp`; //.png`;

/**
 * A class that fetches the sprited Towers dataset and returns shuffled batches.
 */
export class TowerData {
  constructor() {
    this.shuffledTrainIndex = 0;
    this.shuffledTestIndex = 0;
  }

  async load() {
    const datasetBytes = new Uint8Array(NUM_DATASET_ELEMENTS * IMAGE_SIZE);
    this.datasetImages = datasetBytes;

    // Make a request for the sprited images.
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const imgRequest = new Promise((resolve, reject) => {
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
        const rows = img.height / IMAGE_HEIGHT;
        const cols = img.width / IMAGE_WIDTH;

        console.log(`Spritesheet is ${img.naturalWidth}w x ${img.naturalHeight}h as ${rows} rows by ${cols} cols.`);

        let bad = 0;
        let out = 0;
        for (let row = 0; row < rows; ++row) {
          for (let col = 0; col < cols; ++col) {
            if (row * cols + col >= NUM_DATASET_ELEMENTS) { break; }

            for (let y = 0; y < IMAGE_HEIGHT; ++y) {
              for (let x = 0; x < IMAGE_WIDTH; ++x) {
                let px = (row * IMAGE_HEIGHT + y) * img.width + (col * IMAGE_WIDTH) + x;
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

    const labelsRequest = fetch(CountsUrl).then(response => response.text()).then(data => {
      // Labels come as a count per tower type in class order, as are the images
      const counts = JSON.parse(data);
      let labels = new Uint8Array(NUM_DATASET_ELEMENTS * NUM_CLASSES);
      labels.fill(0);

      let out = 0;
      let towerClassIndex = 0;
      for (var towerName in counts) {
        // Find how many images there are for this class
        var count = counts[towerName];

        // Mark the next 'count' images as the current class index
        for (var j = 0; j < count; ++j) {
          labels[out * NUM_CLASSES + towerClassIndex] = 1;
          out++;
        }

        towerClassIndex++;
      }

      this.datasetLabels = labels;
    });

    const [imgResponse, labelsResponse] =
      await Promise.all([imgRequest, labelsRequest]);

    // Create shuffled indices into the data set and separate into those
    // which will be for training and testing.
    const shuffledIndices = tf.util.createShuffledIndices(NUM_DATASET_ELEMENTS);
    this.trainIndices = shuffledIndices.slice(0, NUM_TRAIN_ELEMENTS);
    this.testIndices = shuffledIndices.slice(NUM_TRAIN_ELEMENTS);
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
    const batchImagesArray = new Float32Array(batchSize * IMAGE_SIZE);
    const batchLabelsArray = new Uint8Array(batchSize * NUM_CLASSES);

    for (let i = 0; i < batchSize; i++) {
      const idx = index();

      for (let j = 0; j < IMAGE_SIZE; ++j) {
        batchImagesArray[i * IMAGE_SIZE + j] = data[0][idx * IMAGE_SIZE + j] / 255;
      }

      for (let j = 0; j < NUM_CLASSES; ++j) {
        batchLabelsArray[i * NUM_CLASSES + j] = data[1][idx * NUM_CLASSES + j];
      }
    }

    const xs = tf.tensor2d(batchImagesArray, [batchSize, IMAGE_SIZE]);
    const labels = tf.tensor2d(batchLabelsArray, [batchSize, NUM_CLASSES]);

    return { xs, labels };
  }
}
