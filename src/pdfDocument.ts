import { IO } from 'fp-ts/lib/IO'
import { WriteStream } from 'fs'
import { ResizedImageBag } from '.'

export const pipeDoc = (doc: PDFKit.PDFDocument) => (
  stream: WriteStream,
): IO<WriteStream> => () => doc.pipe(stream)

export const addImageToDoc = (doc: PDFKit.PDFDocument) => (
  img: ResizedImageBag,
): IO<void> => () => {
  const size = [img.size.width, img.size.height]
  doc.addPage({ size })
  doc.image(img.buffer, 0, 0, { fit: size })
}

export const closeDoc = (doc: PDFKit.PDFDocument): IO<void> => () => doc.end()
