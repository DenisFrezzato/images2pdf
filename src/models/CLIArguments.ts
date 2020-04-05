import * as D from 'io-ts/lib/Decoder'
import { Natural } from './Natural'

export const CLIArguments = D.type({
  imagesDirectory: D.string,
  width: Natural,
  height: Natural,
  output: D.string,
})
export interface CLIArguments extends D.TypeOf<typeof CLIArguments> {}
