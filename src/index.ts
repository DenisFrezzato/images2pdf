import { array, chunksOf, filter, flatten, last, sort } from 'fp-ts/lib/Array'
import { left } from 'fp-ts/lib/Either'
import { compose } from 'fp-ts/lib/function'
import { IO, io } from 'fp-ts/lib/IO'
import { Option } from 'fp-ts/lib/Option'
import { contramap, Ord, ordString } from 'fp-ts/lib/Ord'
import {
  fromEither,
  fromIO as tEFromIO,
  TaskEither,
  taskEither,
  taskEitherSeq,
} from 'fp-ts/lib/TaskEither'
import { Tuple } from 'fp-ts/lib/Tuple'
import { WriteStream } from 'fs'
import isImage = require('is-image')
import { Ora } from 'ora'
import * as os from 'os'
import * as Path from 'path'
import * as PDFDocument from 'pdfkit'
import * as ProgressBar from 'progress'
import { Arguments } from 'yargs'

import * as ora from './fancyConsole/ora'
import * as progressBar from './fancyConsole/progress'
import * as fs from './fs'
import * as img from './imageProcessing'
import * as d from './pdfDocument'
import { recursiveTE } from './recursiveReaddir'

export interface Size {
  width: number
  height: number
}

export interface ResizedImageBag {
  name: string
  buffer: Buffer
  size: Size
}

const ioParallel = array.sequence(io)
const tEParallel = array.sequence(taskEither)
const tESeries = array.sequence(taskEitherSeq)

const cpuCountIO: IO<number> = new IO(() => os.cpus()).map((_) => _.length)
const exit: IO<void> = new IO(() => process.exit())

const createProgressBar = (total: number) =>
  progressBar.create('Processing images [:bar] :current/:total', {
    total,
    width: 17,
  })

const getImagePaths = (imagesDir: string): TaskEither<Error, string[]> =>
  recursiveTE(imagesDir).map((files) => filter(files, isImage))

const getParentDirName = (imagePath: string): Option<string> =>
  last(Path.dirname(imagePath).split('/'))

const ordImagesByName: Ord<ResizedImageBag> = contramap(
  (image) => image.name.toLowerCase(),
  ordString,
)

const processImage = (progressBarInstance: ProgressBar) => (
  imagePath: string,
  { width, height }: Size,
): TaskEither<Error, ResizedImageBag> => {
  const fileName = Path.parse(imagePath).name
  const fullName = getParentDirName(imagePath).fold(
    fileName,
    (dirName) => dirName + fileName,
  )
  return fs
    .readFile(imagePath)
    .chain(img.trimImage)
    .chain(
      ({ fst: buffer, snd: info }): TaskEither<Error, ResizedImageBag> => {
        const outputSize = img.calculateOutputImageSize(info, { width, height })
        return img
          .resizeImage(outputSize, buffer)
          .chain(() =>
            tEFromIO<Error, void>(progressBar.tick(progressBarInstance)).chain(
              () => taskEither.of({ buffer, name: fullName, size: outputSize }),
            ),
          )
      },
    )
}

export function main({
  imagesDirectory,
  width,
  height,
  output,
}: Arguments): TaskEither<Error, void> {
  const doc = new PDFDocument({ autoFirstPage: false })
  const imagesDir = Path.resolve(imagesDirectory)
  const outputSize: Size = { width, height }
  return tEFromIO<Error, WriteStream>(
    fs.createWriteStream(Path.resolve(output)).chain(d.pipeDoc(doc)),
  ).chain((outputStream) =>
    tEFromIO<Error, Ora>(ora.create('Creating document...')).chain(
      (docSpinner) => {
        outputStream.on('close', () =>
          (docSpinner.isSpinning
            ? ora.succeed(docSpinner, 'Done!').chain(() => exit)
            : exit
          ).run(),
        )

        return getImagePaths(imagesDir).chain((imagePaths) => {
          return tEFromIO<Error, Tuple<number, ProgressBar>>(
            cpuCountIO.chain((cpuCount) =>
              createProgressBar(imagePaths.length).chain(
                (progressBarInstance) =>
                  io.of(new Tuple(cpuCount, progressBarInstance)),
              ),
            ),
          )
            .chain(({ fst: cpuCount, snd: progressBarInstance }) => {
              const processImageWithProgressBar = processImage(
                progressBarInstance,
              )
              // Let's take advantage on multithreading by running the tasks asynchronously.
              // The tasks are being chunked, each chunk runs in series, in order to bail out
              //  as soon as a task fails.
              return tESeries(
                chunksOf(imagePaths, cpuCount).map((chunk) =>
                  tEParallel(
                    chunk.map((imagePath) =>
                      processImageWithProgressBar(imagePath, outputSize),
                    ),
                  ),
                ),
              )
            })
            .map(
              compose(
                sort(ordImagesByName),
                flatten,
              ),
            )
            .chain((images) =>
              tEFromIO(
                ora
                  .start(docSpinner)
                  .chain(() => ioParallel(images.map(d.addImageToDoc(doc))))
                  .chain(() => d.closeDoc(doc)),
              ),
            )
            .foldTaskEither(
              (err) =>
                tEFromIO<Error, undefined>(
                  ora
                    .fail(docSpinner, err.message)
                    .chain(() => io.of(undefined)),
                ).chain(() => fromEither(left(err))),
              () => taskEither.of(undefined),
            )
        })
      },
    ),
  )
}
