'use strict'
const readPkgUp = require('read-pkg-up')
const pkg = readPkgUp.sync({cwd: __dirname}).pkg

module.exports = {
  command: 'version',
  describe: 'Shows Paratii Transcoder version information',
  handler (argv) {
    // TODO: handle argv.{repo|commit|number}
    console.log('Paratii Transcoder ', pkg.version)
  }
}
