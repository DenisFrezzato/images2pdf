import * as D from 'io-ts/lib/Decoder'

interface NaturalBrand {
  readonly Natural: unique symbol
}

export type Natural = number & NaturalBrand

export const Natural: D.Decoder<Natural> = D.refinement(
  D.number,
  (n): n is Natural => n > 0 && n === Math.floor(n),
  'Natural',
)
