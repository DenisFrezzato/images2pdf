import { IO } from 'fp-ts/lib/IO'
import ora, { Ora } from 'ora'

export const create = (message: string): IO<Ora> => new IO(() => ora(message))

export const start = (oraInstance: Ora): IO<Ora> =>
  new IO(() => oraInstance.start())

export const succeed = (oraInstance: Ora, message: string): IO<Ora> =>
  new IO(() => oraInstance.succeed(message))

export const fail = (oraInstance: Ora, message: string): IO<Ora> =>
  new IO(() => oraInstance.fail(message))
