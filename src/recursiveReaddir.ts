import { taskify } from 'fp-ts/lib/TaskEither'
import * as recursive from 'recursive-readdir'

export const recursiveTE = taskify<string, Error, string[]>(recursive)
