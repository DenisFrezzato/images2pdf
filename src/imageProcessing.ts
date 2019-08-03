import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/pipeable'
import * as TE from 'fp-ts/lib/TaskEither'
import * as sharp from 'sharp'

import { Size } from '.'

export const calculateOutputImageSize = (
  imageSize: sharp.OutputInfo,
  viewportSize: { width: number; height: number },
): Size => {
  const outputRatio = viewportSize.width / viewportSize.height
  const imageRatio = imageSize.width / imageSize.height

  // Determs if the image orientation will be portrait or landscape.
  // If landscape, fit the image by viewport's height.
  const outputImageRatio =
    imageRatio < outputRatio
      ? viewportSize.width / viewportSize.height
      : (viewportSize.width * 2) / viewportSize.height

  return imageRatio > outputImageRatio
    ? {
        width: viewportSize.width,
        height: Math.round(viewportSize.width / imageRatio),
      }
    : {
        width: Math.round(viewportSize.height * imageRatio),
        height: viewportSize.height,
      }
}

export const trimImage = (
  buffer: Buffer,
): TE.TaskEither<Error, [Buffer, sharp.OutputInfo]> => () =>
  new Promise((resolve) =>
    sharp(buffer)
      .trim()
      .toBuffer((err, resizedBuffer, info) =>
        err ? resolve(E.left(err)) : resolve(E.right([resizedBuffer, info])),
      ),
  )

const sharpResize = (
  { width, height }: Size,
  buffer: Buffer,
): E.Either<Error, sharp.Sharp> =>
  E.tryCatch(() => sharp(buffer).resize(width, height), E.toError)

export const resizeImage = (
  size: Size,
  buffer: Buffer,
): TE.TaskEither<Error, Buffer> => () =>
  pipe(
    sharpResize(size, buffer),
    E.map((sharpInstance) => sharpInstance.png().toBuffer()),
    E.fold(
      (err) => Promise.resolve(E.left(err)),
      (p) => p.then(E.right).catch((err) => E.left(err)),
    ),
  )
