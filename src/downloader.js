'use strict'

const readline = require('readline')
const fs = require('fs')
const ytdl = require('ytdl-core')
const vidl = require('vimeo-downloader')
const xlsx = require('xlsx')

const log = require('debug')('paratii:downloader')
log.error = require('debug')('paratii:downloader:error')

var downloader = {

  download: function download (url, output, cb) {
    let exists = fs.existsSync(output)
    if (exists) {
      return cb(null, output)
    }

    let starttime
    let video = ytdl(url)
    video.pipe(fs.createWriteStream(output))
    video.once('response', () => {
      log(`starting ${url}`)
      starttime = Date.now()
    })

    video.on('progress', (chunkLength, downloaded, total) => {
      const floatDownloaded = downloaded / total
      const downloadedMinutes = (Date.now() - starttime) / 1000 / 60
      readline.cursorTo(process.stdout, 0)
      process.stdout.write(`${(floatDownloaded * 100).toFixed(2)}% downloaded`)
      process.stdout.write(`(${(downloaded / 1024 / 1024).toFixed(2)}MB of ${(total / 1024 / 1024).toFixed(2)}MB)\n`)
      process.stdout.write(`running for: ${downloadedMinutes.toFixed(2)}minutes`)
      process.stdout.write(`, estimated time left: ${(downloadedMinutes / floatDownloaded - downloadedMinutes).toFixed(2)}minutes `)
      readline.moveCursor(process.stdout, 0, -1)
    })

    video.on('end', () => {
      process.stdout.write('\n\n')
      cb(null, output)
    })
  },
  viDownload: function viDownload (url, output, cb) {
    let exists = fs.existsSync(output)
    if (exists) {
      return cb(null, output)
    }

    let starttime
    let video = vidl(url, {quality: '720p'})
    video.pipe(fs.createWriteStream(output))
    video.once('response', () => {
      log(`starting ${url}`)
      starttime = Date.now()
    })
    let total = 0
    video.on('data', (chunk) => {
      total += chunk.length / 1024 / 1024
      readline.cursorTo(process.stdout, 0)
      process.stdout.write(`${total.toFixed(2)}MB downloaded\n`)
      readline.moveCursor(process.stdout, 0, -1)
    })

    video.on('end', () => {
      process.stdout.write('\n\n')
      cb(null, output)
    })
  },
  parseXlsx: function parseXlsx (file, cb) {
    if (!file) {
      return
    }

    let output, xlsxFile
    let result = {}

    try {
      xlsxFile = xlsx.readFile(file)
    } catch (e) {
      if (e) throw e
    }

    xlsxFile.SheetNames.forEach((name) => {
      log('worksheet ', name)
      let worksheet = xlsxFile.Sheets[name]
      output = xlsx.utils.sheet_to_json(worksheet, {header: 'A'})
    })

    // cb(null, output)
    output.forEach((row) => {
      if (!row || !row.E) {
        // no url
        result.noUrl = result.noUrl || []
        result.noUrl.push(row)
        return
      }

      if (row.E.match(/youtube\.com/g)) {
        result.youtube = result.youtube || []
        result.youtube.push({
          name: row.C,
          url: row.E
        })
      } else if (row.E.match(/vimeo\.com/g)) {
        result.vimeo = result.vimeo || []
        result.vimeo.push({
          name: row.C,
          url: row.E
        })
      } else if (row.E.match(/ted\.com/g)) {
        result.ted = result.ted || []
        result.ted.push({
          name: row.C,
          url: row.E
        })
      } else {
        // unknown format
        result.unknown = result.unknown || []
        result.unknown.push(row)
      }
    })

    cb(null, result)
  },
  yt: {
    getInfo: ytdl.getInfo
  },
  vi: {
    getInfo: vidl.getInfo
  }
}

module.exports = downloader
