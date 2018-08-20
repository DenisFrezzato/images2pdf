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
import { Arguments } from 'yargs'
import { IResizedImage, Size } from './@types'

const cpuCount: number = os.cpus().length
const error = chalk.bold.red

export default async function start({
  imagesDirectory,
  width,
  height,
  output,
}: Arguments) {
  const doc = new PDFDocument({
    autoFirstPage: false,
  })
  const imagesDir = Path.resolve(imagesDirectory)

  const outputStream = fs.createWriteStream(Path.resolve(output))
  doc.pipe(outputStream)

  const docSpinner = ora('Creating document...')

  outputStream.on('close', () => {
    docSpinner.succeed()
    process.exit()
  })

  const images = await getImages(imagesDir)
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
      const imageBuffer = await fs.readFile(imagePath)

      return new Promise<IResizedImage>((resolve, reject) =>
        sharp(imageBuffer)
          .trim()
          .toBuffer((err, trimmedImageBuffer, info) => {
            if (err) return reject(err)

            const name = parentDirName + Path.parse(imagePath).name
            const newSize = calculateOutputImageSize(info, { width, height })

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
  const files = await recursive(imagesDir)

  return files.filter(isImage)
}

function getParentDirName(imagePath: string): string | undefined {
  return Path.dirname(imagePath)
    .split('/')
    .pop()
}

function calculateOutputImageSize(
  imageSize: sharp.OutputInfo,
  viewportSize: { width: number; height: number },
): Size {
  const outputRatio = viewportSize.width / viewportSize.height
  const imageRatio = imageSize.width / imageSize.height

  // determs if the image orientation will be portrait or landscape
  // if landscape, fit the image by viewport's height
  const outputImageRatio =
    imageRatio < outputRatio
      ? viewportSize.width / viewportSize.height
      : (viewportSize.width * 2) / viewportSize.height

  return imageRatio > outputImageRatio
    ? [viewportSize.width, Math.round(viewportSize.width / imageRatio)]
    : [Math.round(viewportSize.height * imageRatio), viewportSize.height]
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

process.on('unhandledRejection', (err) => {
  throw err
})

process.on('uncaughtException', ({ message, stack }) => {
  console.error(error(message))
  console.error(stack)
  process.exit(1)
})
