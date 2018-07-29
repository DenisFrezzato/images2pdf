#!/usr/bin/env node

'use strict'

import * as yargs from 'yargs'
import images2PDFBook from '../src'

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
  .coerce(['w', 'h'], Number)
  .demandOption(['images-directory', 'w', 'h', 'o']).argv

images2PDFBook(argv)