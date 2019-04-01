import { WriteStream } from 'fs'

export const pipe = <R extends NodeJS.ReadStream>(rStream: R) => (
  wStream: WriteStream,
) => rStream.pipe(wStream)
