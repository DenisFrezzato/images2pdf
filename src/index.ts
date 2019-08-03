import { sequenceT } from 'fp-ts/lib/Apply'
import { array, chunksOf, flatten, last, sort } from 'fp-ts/lib/Array'
import { left } from 'fp-ts/lib/Either'
import { flow } from 'fp-ts/lib/function'
import { IO, io } from 'fp-ts/lib/IO'
import { Option } from 'fp-ts/lib/Option'
import { contramap, Ord, ordString } from 'fp-ts/lib/Ord'
import * as TE from 'fp-ts/lib/TaskEither'
import { WriteStream } from 'fs'
import { failure } from 'io-ts/lib/PathReporter'
import isImage = require('is-image')
import { Ora } from 'ora'
import * as os from 'os'
import * as Path from 'path'
import * as PDFDocument from 'pdfkit'
import * as ProgressBar from 'progress'

import * as ora from './fancyConsole/ora'
import * as progressBar from './fancyConsole/progress'
import * as fs from './fs'
import * as img from './imageProcessing'
import { CLIArguments } from './models/CLIArguments'
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
const tEParallel = array.sequence(TE.taskEither)
const tESeries = array.sequence(TE.taskEitherSeq)
const sequenceTIo = sequenceT(io)

const cpuCountIO: IO<number> = new IO(() => os.cpus()).map((_) => _.length)
const exit: IO<void> = new IO(() => process.exit())

const createProgressBar = (total: number) =>
  progressBar.create('Processing images [:bar] :current/:total', {
    total,
    width: 17,
  })

const getImagePaths = (imagesDir: string): TE.TaskEither<Error, string[]> =>
  recursiveTE(imagesDir).map((files) => files.filter(isImage))

const getParentDirName = (imagePath: string): Option<string> =>
  last(Path.dirname(imagePath).split('/'))

const ordImagesByName: Ord<ResizedImageBag> = contramap(
  (image: ResizedImageBag) => image.name.toLowerCase(),
)(ordString)

const initOutputAndCreateSpinner = <L>(
  outputFile: string,
  doc: PDFKit.PDFDocument,
): TE.TaskEither<L, [WriteStream, Ora]> =>
  TE.rightIO(
    sequenceTIo(
      fs.createWriteStream(Path.resolve(outputFile)).chain(d.pipeDoc(doc)),
      ora.create('Creating document...'),
    ),
  )

const processImage = (progressBarInstance: ProgressBar) => (
  imagePath: string,
  { width, height }: Size,
): TE.TaskEither<Error, ResizedImageBag> => {
  const fileName = Path.parse(imagePath).name
  const fullName = getParentDirName(imagePath).fold(
    fileName,
    (dirName) => dirName + fileName,
  )
  return fs
    .readFile(imagePath)
    .chain(img.trimImage)
    .chain(
      ({ fst: buffer, snd: info }): TE.TaskEither<Error, ResizedImageBag> => {
        const outputSize = img.calculateOutputImageSize(info, { width, height })
        return img
          .resizeImage(outputSize, buffer)
          .chain(() =>
            TE.rightIO<Error, void>(
              progressBar.tick(progressBarInstance),
            ).chain(() =>
              TE.taskEither.of({ buffer, name: fullName, size: outputSize }),
            ),
          )
      },
    )
}

const toSortedByName: (as: ResizedImageBag[][]) => ResizedImageBag[] = flow(
  flatten,
  sort(ordImagesByName),
)

const prepareImages = (
  imagePaths: string[],
  outputSize: Size,
  cpuCount: number,
  progressBarInstance: ProgressBar,
): TE.TaskEither<Error, ResizedImageBag[]> => {
  const processImageWithProgressBar = processImage(progressBarInstance)
  // Let's take advantage on multithreading by running the tasks asynchronously.
  // The tasks are being chunked, each chunk runs in series, in order to bail out
  // as soon as a task fails.
  return tESeries(
    chunksOf<string>(cpuCount)(imagePaths).map((chunk) =>
      tEParallel(
        chunk.map((imagePath) =>
          processImageWithProgressBar(imagePath, outputSize),
        ),
      ),
    ),
  ).map(toSortedByName)
}

const writeImagesToDocument = <L>(doc: PDFKit.PDFDocument, docSpinner: Ora) => (
  images: ResizedImageBag[],
): TE.TaskEither<L, void> =>
  TE.rightIO(
    ora
      .start(docSpinner)
      .chain(() => ioParallel(images.map(d.addImageToDoc(doc))))
      .chain(() => d.closeDoc(doc)),
  )

const getCpuCountAndCreateProgressBar = <L>(
  progressBarLength: number,
): TE.TaskEither<L, [number, ProgressBar]> =>
  TE.rightIO<L, [number, ProgressBar]>(
    sequenceTIo(cpuCountIO, createProgressBar(progressBarLength)),
  )

export function main(cliArguments: unknown): TE.TaskEither<Error, void> {
  return TE.fromEither(
    CLIArguments.decode(cliArguments).mapLeft(
      (errors) => new Error(failure(errors).join('\n')),
    ),
  ).chain(({ imagesDirectory, width, height, output }) => {
    const doc = new PDFDocument({ autoFirstPage: false })
    const imagesDir = Path.resolve(imagesDirectory)
    const outputSize: Size = { width, height }

    return initOutputAndCreateSpinner<Error>(output, doc).chain(
      ([outputStream, docSpinner]) => {
        outputStream.on('close', () =>
          (docSpinner.isSpinning
            ? sequenceTIo(ora.succeed(docSpinner, 'Done!'), exit)
            : exit
          ).run(),
        )

        return getImagePaths(imagesDir).chain((imagePaths) =>
          getCpuCountAndCreateProgressBar<Error>(imagePaths.length)
            .chain(([cpuCount, progressBarInstance]) =>
              prepareImages(
                imagePaths,
                outputSize,
                cpuCount,
                progressBarInstance,
              ),
            )
            .chain(writeImagesToDocument(doc, docSpinner))
            .foldTaskEither(
              (err) =>
                TE.rightIO<Error, void>(
                  ora
                    .fail(docSpinner, err.message)
                    .chain(() => io.of(undefined)),
                ).chain(() => TE.fromEither(left(err))),
              () => TE.taskEither.of(undefined),
            ),
        )
      },
    )
  })
}
