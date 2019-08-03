#!/usr/bin/env node

'use strict'

import * as yargs from 'yargs'

import { fold } from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/pipeable'

import { main } from '../src'

const argv = yargs
  .option('images-directory', {
    describe: 'provide the images directory',
  })
  .option('width', {
    alias: 'w',
    describe: 'width of targeted device',
  })
  .option('height', {
    alias: 'h',
    describe: 'height of targeted device',
  })
  .option('output', {
    alias: 'o',
    describe: 'output file',
  })
  .demandOption(['images-directory', 'w', 'h', 'o']).argv

main(argv)().then((res) =>
  pipe(
    res,
    // tslint:disable-next-line:no-console
    fold(console.error, () => undefined),
  ),
)
