import { sequenceT } from 'fp-ts/lib/Apply'
import { array, chunksOf, flatten, last, sort } from 'fp-ts/lib/Array'
import { either, left } from 'fp-ts/lib/Either'
import { flow } from 'fp-ts/lib/function'
import * as IO from 'fp-ts/lib/IO'
import * as O from 'fp-ts/lib/Option'
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

import { pipe } from 'fp-ts/lib/pipeable'
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

const ioParallel = array.sequence(IO.io)
const tEParallel = array.sequence(TE.taskEither)
const tESeries = array.sequence(TE.taskEitherSeq)
const sequenceTIo = sequenceT(IO.io)

const cpuCountIO: IO.IO<number> = IO.io.map(() => os.cpus(), (_) => _.length)
const exit: IO.IO<void> = () => process.exit()

const createProgressBar = (total: number) =>
  progressBar.create('Processing images [:bar] :current/:total', {
    total,
    width: 17,
  })

const getImagePaths = (imagesDir: string): TE.TaskEither<Error, string[]> =>
  TE.taskEither.map(recursiveTE(imagesDir), (files) => files.filter(isImage))

const getParentDirName = (imagePath: string): O.Option<string> =>
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
      IO.io.chain(
        fs.createWriteStream(Path.resolve(outputFile)),
        d.pipeDoc(doc),
      ),
      ora.create('Creating document...'),
    ),
  )

const processImage = (progressBarInstance: ProgressBar) => (
  imagePath: string,
  { width, height }: Size,
): TE.TaskEither<Error, ResizedImageBag> => {
  const fileName = Path.parse(imagePath).name
  const fullName = pipe(
    getParentDirName(imagePath),
    O.fold(() => fileName, (dirName) => dirName + fileName),
  )
  return pipe(
    fs.readFile(imagePath),
    TE.chain(img.trimImage),
    TE.chain(
      ([buffer, info]): TE.TaskEither<Error, ResizedImageBag> => {
        const outputSize = img.calculateOutputImageSize(info, { width, height })
        return pipe(
          img.resizeImage(outputSize, buffer),
          TE.chain(() =>
            TE.taskEither.chain(
              TE.rightIO<Error, void>(progressBar.tick(progressBarInstance)),
              () => TE.right({ buffer, name: fullName, size: outputSize }),
            ),
          ),
        )
      },
    ),
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
  return TE.taskEither.map(
    tESeries(
      chunksOf(cpuCount)(imagePaths).map((chunk) =>
        tEParallel(
          chunk.map((imagePath) =>
            processImageWithProgressBar(imagePath, outputSize),
          ),
        ),
      ),
    ),
    toSortedByName,
  )
}

const writeImagesToDocument = <L>(doc: PDFKit.PDFDocument, docSpinner: Ora) => (
  images: ResizedImageBag[],
): TE.TaskEither<L, void> =>
  TE.rightIO(
    pipe(
      ora.start(docSpinner),
      IO.chain(() => ioParallel(images.map(d.addImageToDoc(doc)))),
      IO.chain(() => d.closeDoc(doc)),
    ),
  )

const getCpuCountAndCreateProgressBar = <L>(
  progressBarLength: number,
): TE.TaskEither<L, [number, ProgressBar]> =>
  TE.rightIO<L, [number, ProgressBar]>(
    sequenceTIo(cpuCountIO, createProgressBar(progressBarLength)),
  )

export function main(cliArguments: unknown): TE.TaskEither<Error, void> {
  return TE.taskEither.chain(
    TE.fromEither(
      either.mapLeft(
        CLIArguments.decode(cliArguments),
        (errors) => new Error(failure(errors).join('\n')),
      ),
    ),
    ({ imagesDirectory, width, height, output }) => {
      const doc = new PDFDocument({ autoFirstPage: false })
      const imagesDir = Path.resolve(imagesDirectory)
      const outputSize: Size = { width, height }

      return TE.taskEither.chain(
        initOutputAndCreateSpinner<Error>(output, doc),
        ([outputStream, docSpinner]) => {
          outputStream.on('close', () =>
            (docSpinner.isSpinning
              ? sequenceTIo(ora.succeed(docSpinner, 'Done!'), exit)
              : exit)(),
          )

          return TE.taskEither.chain(getImagePaths(imagesDir), (imagePaths) =>
            pipe(
              getCpuCountAndCreateProgressBar<Error>(imagePaths.length),
              TE.chain(([cpuCount, progressBarInstance]) =>
                prepareImages(
                  imagePaths,
                  outputSize,
                  cpuCount,
                  progressBarInstance,
                ),
              ),
              TE.chain(writeImagesToDocument(doc, docSpinner)),
              TE.fold(
                (err) =>
                  TE.taskEither.chain(
                    TE.rightIO<Error, void>(
                      IO.io.chain(ora.fail(docSpinner, err.message), () =>
                        IO.io.of(undefined),
                      ),
                    ),
                    () => TE.fromEither(left(err)),
                  ),
                () => TE.taskEither.of(undefined),
              ),
            ),
          )
        },
      )
    },
  )
}
