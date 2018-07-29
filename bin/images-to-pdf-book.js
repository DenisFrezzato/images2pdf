#!/usr/bin/env node
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const yargs = require("yargs");
const src_1 = require("../src");
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
    .demandOption(['images-directory', 'w', 'h', 'o']).argv;
src_1.default(argv);
