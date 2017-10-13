'use strict'

const Transcoder = require('./transcoder')

const testHash = '/ipfs/QmeG4popSYeipnvuvP6u4UxuRfKWTzy6eEMyC54ArFRNiG'

let transcoder = new Transcoder({
  sourcePath: testHash
})

transcoder.start((err, res) => {
  if (err) throw err

  console.log('done!')
})
