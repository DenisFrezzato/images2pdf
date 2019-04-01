import { IO } from 'fp-ts/lib/IO'
import * as ProgressBar from 'progress'

export const create = (
  message: string,
  options: ProgressBar.ProgressBarOptions,
): IO<ProgressBar> => new IO(() => new ProgressBar(message, options))

export const tick = (progressBar: ProgressBar): IO<void> =>
  new IO(() => progressBar.tick())
