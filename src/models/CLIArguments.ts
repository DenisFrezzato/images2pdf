import * as t from 'io-ts'
import { IntFromString } from 'io-ts-types/lib/IntFromString'

export const CLIArguments = t.type({
  imagesDirectory: t.string,
  width: IntFromString,
  height: IntFromString,
  output: t.string,
})

export type CLIArguments = t.TypeOf<typeof CLIArguments>
