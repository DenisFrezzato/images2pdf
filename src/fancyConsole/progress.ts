import { IO } from 'fp-ts/lib/IO'
import * as ProgressBar from 'progress'

export const create = (
  message: string,
  options: ProgressBar.ProgressBarOptions,
): IO<ProgressBar> => () => new ProgressBar(message, options)

export const tick = (progressBar: ProgressBar): IO<void> => () =>
  progressBar.tick()
