'use strict'

import chalk from 'chalk'
import * as fs from 'fs-extra'
import * as isImage from 'is-image'
import * as ora from 'ora'
import * as os from 'os'
import * as pMap from 'p-map'
import * as Path from 'path'
import * as PDFDocument from 'pdfkit'
import * as ProgressBar from 'progress'
import * as recursive from 'recursive-readdir'
import * as sharp from 'sharp'
import * as yargs from 'yargs'
import { IResizedImage, Size } from './@types'

const argv = yargs
  .option('images-directory', {
    describe: 'provide the images directory',
  })
  .option('width', {
    alias: 'w',
    describe: 'width of targeted device',
  })
  .option('height', {
    alias: 'h',
    describe: 'height of targeted device',
  })
  .option('output', {
    alias: 'o',
    describe: 'output file',
  })
  .coerce(['w', 'h'], Number)
  .demandOption(['images-directory', 'w', 'h', 'o']).argv

const cpuCount: number = os.cpus().length
const error = chalk.bold.red

async function start() {
  const doc: PDFKit.PDFDocument = new PDFDocument({
    autoFirstPage: false,
  })
  const imagesDir: string = Path.resolve(argv.imagesDirectory)

  const output: fs.WriteStream = fs.createWriteStream(Path.resolve(argv.output))
  doc.pipe(output)

  const docSpinner = ora('Creating document...')

  output.on('close', () => {
    docSpinner.succeed()
    process.exit()
  })

  const images: ReadonlyArray<string> = await getImages(imagesDir)
  const resizingImagesProgressBar = new ProgressBar(
    'Processing images [:bar] :current/:total',
    {
      total: images.length,
      width: 17,
    },
  )

  const resizingImagesPromises = pMap(
    images,
    async (imagePath: string) => {
      const parentDirName = getParentDirName(imagePath)
      const imageBuffer: Buffer = await fs.readFile(imagePath)

      return new Promise<IResizedImage>((resolve, reject) =>
        sharp(imageBuffer)
          .trim()
          .toBuffer((err, trimmedImageBuffer, info) => {
            if (err) return reject(err)

            const name = parentDirName + Path.parse(imagePath).name
            const newSize = calculateOutputImageSize(info)

            const resizeAndArchive = sharp(trimmedImageBuffer)
              .resize(...newSize)
              .png()
              .toBuffer()
              .then(
                (buffer: Buffer): IResizedImage => {
                  resizingImagesProgressBar.tick()

                  return {
                    buffer,
                    name,
                    size: newSize,
                  }
                },
              )

            resolve(resizeAndArchive)
          }),
      )
    },
    { concurrency: cpuCount },
  )

  await resizingImagesPromises.then((res: IResizedImage[]) => {
    docSpinner.start()
    res
      .sort(sortImagesByName) // tslint:disable-line no-misleading-array-reverse
      .forEach((resizedImage) => addImageToDoc(resizedImage, doc))
  })

  doc.end()
}

async function getImages(imagesDir: string): Promise<ReadonlyArray<string>> {
  const files: ReadonlyArray<string> = await recursive(imagesDir)

  return files.filter(isImage)
}

function getParentDirName(imagePath: string): string | undefined {
  return Path.dirname(imagePath)
    .split('/')
    .pop()
}

function calculateOutputImageSize({ width, height }: sharp.OutputInfo): Size {
  const outputRatio: number = argv.width / argv.height
  const imageRatio: number = width / height

  // determs if the image orientation will be portrait or landscape
  // if landscape, fit the image by viewport's height
  const outputImageRatio: number =
    imageRatio < outputRatio
      ? argv.width / argv.height
      : (argv.width * 2) / argv.height

  return imageRatio > outputImageRatio
    ? [argv.width, Math.round(argv.width / imageRatio)]
    : [Math.round(argv.height * imageRatio), argv.height]
}

function sortImagesByName(prev: IResizedImage, next: IResizedImage): number {
  const prevName = prev.name.toLowerCase()
  const nextName = next.name.toLowerCase()

  if (prevName < nextName) return -1
  if (prevName > nextName) return 1
  return 0
}

function addImageToDoc(
  { buffer, size }: IResizedImage,
  doc: PDFKit.PDFDocument,
): void {
  doc.addPage({ size })
  doc.image(buffer, 0, 0, { fit: size })
}

start()

process.on('unhandledRejection', (err) => {
  throw err
})

process.on('uncaughtException', ({ message, stack }) => {
  console.error(error(message))
  console.error(stack)
  process.exit(1)
})
