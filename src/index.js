'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = require("chalk");
const fs = require("fs-extra");
const isImage = require("is-image");
const ora = require("ora");
const os = require("os");
const pMap = require("p-map");
const Path = require("path");
const PDFDocument = require("pdfkit");
const ProgressBar = require("progress");
const recursive = require("recursive-readdir");
const sharp = require("sharp");
const cpuCount = os.cpus().length;
const error = chalk_1.default.bold.red;
function start({ imagesDirectory, width, height, output, }) {
    return __awaiter(this, void 0, void 0, function* () {
        const doc = new PDFDocument({
            autoFirstPage: false,
        });
        const imagesDir = Path.resolve(imagesDirectory);
        const outputStream = fs.createWriteStream(Path.resolve(output));
        doc.pipe(outputStream);
        const docSpinner = ora('Creating document...');
        output.on('close', () => {
            docSpinner.succeed();
            process.exit();
        });
        const images = yield getImages(imagesDir);
        const resizingImagesProgressBar = new ProgressBar('Processing images [:bar] :current/:total', {
            total: images.length,
            width: 17,
        });
        const resizingImagesPromises = pMap(images, (imagePath) => __awaiter(this, void 0, void 0, function* () {
            const parentDirName = getParentDirName(imagePath);
            const imageBuffer = yield fs.readFile(imagePath);
            return new Promise((resolve, reject) => sharp(imageBuffer)
                .trim()
                .toBuffer((err, trimmedImageBuffer, info) => {
                if (err)
                    return reject(err);
                const name = parentDirName + Path.parse(imagePath).name;
                const newSize = calculateOutputImageSize(info, { width, height });
                const resizeAndArchive = sharp(trimmedImageBuffer)
                    .resize(...newSize)
                    .png()
                    .toBuffer()
                    .then((buffer) => {
                    resizingImagesProgressBar.tick();
                    return {
                        buffer,
                        name,
                        size: newSize,
                    };
                });
                resolve(resizeAndArchive);
            }));
        }), { concurrency: cpuCount });
        yield resizingImagesPromises.then((res) => {
            docSpinner.start();
            res
                .sort(sortImagesByName) // tslint:disable-line no-misleading-array-reverse
                .forEach((resizedImage) => addImageToDoc(resizedImage, doc));
        });
        doc.end();
    });
}
exports.default = start;
function getImages(imagesDir) {
    return __awaiter(this, void 0, void 0, function* () {
        const files = yield recursive(imagesDir);
        return files.filter(isImage);
    });
}
function getParentDirName(imagePath) {
    return Path.dirname(imagePath)
        .split('/')
        .pop();
}
function calculateOutputImageSize(imageSize, viewportSize) {
    const outputRatio = viewportSize.width / viewportSize.height;
    const imageRatio = imageSize.width / imageSize.height;
    // determs if the image orientation will be portrait or landscape
    // if landscape, fit the image by viewport's height
    const outputImageRatio = imageRatio < outputRatio
        ? viewportSize.width / viewportSize.height
        : (viewportSize.width * 2) / viewportSize.height;
    return imageRatio > outputImageRatio
        ? [viewportSize.width, Math.round(viewportSize.width / imageRatio)]
        : [Math.round(viewportSize.height * imageRatio), viewportSize.height];
}
function sortImagesByName(prev, next) {
    const prevName = prev.name.toLowerCase();
    const nextName = next.name.toLowerCase();
    if (prevName < nextName)
        return -1;
    if (prevName > nextName)
        return 1;
    return 0;
}
function addImageToDoc({ buffer, size }, doc) {
    doc.addPage({ size });
    doc.image(buffer, 0, 0, { fit: size });
}
process.on('unhandledRejection', (err) => {
    throw err;
});
process.on('uncaughtException', ({ message, stack }) => {
    console.error(error(message));
    console.error(stack);
    process.exit(1);
});
