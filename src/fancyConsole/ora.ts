import { IO } from 'fp-ts/lib/IO'
import ora, { Ora } from 'ora'

export const create = (message: string): IO<Ora> => () => ora(message)

export const start = (oraInstance: Ora): IO<Ora> => () => oraInstance.start()

export const succeed = (oraInstance: Ora, message: string): IO<Ora> => () =>
  oraInstance.succeed(message)

export const fail = (oraInstance: Ora, message: string): IO<Ora> => () =>
  oraInstance.fail(message)
