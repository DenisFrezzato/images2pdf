import { left, right } from 'fp-ts/lib/Either'
import { Task } from 'fp-ts/lib/Task'
import { TaskEither } from 'fp-ts/lib/TaskEither'
import { Tuple } from 'fp-ts/lib/Tuple'
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
): TaskEither<Error, Tuple<Buffer, sharp.OutputInfo>> =>
  new TaskEither(
    new Task(
      () =>
        new Promise((resolve) =>
          sharp(buffer)
            .trim()
            .toBuffer(
              (err, resizedBuffer, info) =>
                err
                  ? resolve(left(err))
                  : resolve(right(new Tuple(resizedBuffer, info))),
            ),
        ),
    ),
  )

export const resizeImage = (
  { width, height }: Size,
  buffer: Buffer,
): TaskEither<Error, Buffer> =>
  new TaskEither(
    new Task(() =>
      sharp(buffer)
        .resize(width, height)
        .png()
        .toBuffer()
        .then(right)
        .catch((err) => left(err)),
    ),
  )
