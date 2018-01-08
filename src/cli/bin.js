#! /usr/bin/env node

'use strict'

const yargs = require('yargs')
const cli = yargs
  .commandDir('commands')
  .demandCommand(1)
  .fail((msg, err, yargs) => {
    if (err) {
      throw err // preserve stack
    }
    yargs.showHelp()
  })

const args = process.argv.slice(2)

yargs().parse(process.argv, (err, argv, output) => {
  if (err) {
    throw err
  }
  cli
  .help()
  .strict(false)
  .completion()
  .parse(args)
})
