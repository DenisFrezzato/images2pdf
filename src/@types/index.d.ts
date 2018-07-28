export type Size = [number, number]

export interface IResizedImage {
  name: string
  buffer: Buffer
  size: Size
}
