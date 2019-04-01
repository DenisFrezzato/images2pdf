import { EventEmitter } from 'events'
import { IO } from 'fp-ts/lib/IO'
import { taskify } from 'fp-ts/lib/TaskEither'
import * as fs from 'fs'

export const createWriteStream = (p: string) =>
  new IO(() => fs.createWriteStream(p))

export const readFile = taskify(fs.readFile)

export const addEventHandler = <T extends EventEmitter>(
  e: T,
  event: string,
  handler: () => void,
): IO<T> => new IO(() => e.on(event, handler))
