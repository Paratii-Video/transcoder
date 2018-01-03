/* eslint-env mocha */
'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const assert = chai.assert
const expect = chai.expect
chai.use(dirtyChai)
const tutils = require('../src/ffmpeg/utils')

describe('# Transcoder', function () {

})

describe('## Transcoder Utils', function () {
  let codecData = {
    'format': 'mov,mp4,m4a,3gp,3g2,mj2',
    'audio': 'aac (LC) (mp4a / 0x6134706D)',
    'video': 'h264 (Constrained Baseline) (avc1 / 0x31637661)',
    'duration': '00:01:00.19',
    'audio_details': [
      'aac (LC) (mp4a / 0x6134706D)',
      '22050 Hz',
      'stereo',
      'fltp',
      '65 kb/s (default)'
    ],
    'video_details': [
      'h264 (Constrained Baseline) (avc1 / 0x31637661)',
      'yuv420p(tv',
      'smpte170m/smpte170m/bt709)',
      '640x360',
      '612 kb/s',
      '23.96 fps',
      '24 tbr',
      '600 tbn',
      '1200 tbc (default)'
    ]
  }

  it('calculate width and generate resolution String (original)', (done) => {
    let resolutionLine = tutils.calculateWidth(codecData, tutils.getHeight('?x360'))
    // console.log('resolutionLine: ', resolutionLine)
    assert.isOk(resolutionLine)
    expect(resolutionLine).to.equal('640x360')
    done()
  })

  it('calculate width and generate resolution String (240)', (done) => {
    let resolutionLine = tutils.calculateWidth(codecData, tutils.getHeight('?x240'))
    // console.log('resolutionLine: ', resolutionLine)
    assert.isOk(resolutionLine)
    expect(resolutionLine).to.equal('426x240')
    done()
  })

  it('getBandwidth', (done) => {
    let bandwidth = tutils.getBandwidth(tutils.getHeight('?x360'))
    assert.isOk(bandwidth)
    expect(bandwidth).to.equal('423900')
    done()
  })

  it('getBandwidth <144p', (done) => {
    let bandwidth = tutils.getBandwidth(tutils.getHeight('?x140'))
    assert.isOk(bandwidth)
    expect(bandwidth).to.equal('64000')
    done()
  })

  it('getDurationInSeconds', (done) => {
    let durationInSeconds = tutils.getDurationInSeconds('00:01:00.19')
    assert.isOk(durationInSeconds)
    expect(durationInSeconds).to.equal(60.19)
    done()
  })
})
