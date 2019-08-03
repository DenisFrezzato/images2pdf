import * as t from 'io-ts'

export const CLIArguments = t.type({
  imagesDirectory: t.string,
  width: t.Int,
  height: t.Int,
  output: t.string,
})

export type CLIArguments = t.TypeOf<typeof CLIArguments>
