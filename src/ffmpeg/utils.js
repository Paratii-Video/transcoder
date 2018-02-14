'use strict'

const MAX_BIT_RATE = {
  '1080': '2760700',
  '720': '1327100',
  '480': '763900',
  '360': '423900',
  '240': '155600',
  '144': '64000'
}

module.exports = {
  /**
   * get an array of possible downsampled bitrates
   * @param  {number} height Video height, grabbed from ffmpeg probe
   * @return {array}        Array of possible downsample sizes.
   */
  getPossibleBitrates: function (height) {
    if (!height) {
      return null
    }

    if (height < 144) {
      // very small bitrate, use the original format.
      return ['?x' + height]
    } else if (height < 240) {
      return ['?x144']
    } else if (height < 360) {
      return ['?x240', '?x144']
    } else if (height < 480) {
      return ['?x360', '?x240', '?x144']
    } else if (height < 720) {
      return ['?x480', '?x360', '?x240', '?x144']
    } else if (height < 1080) {
      return ['?x720', '?x480', '?x360', '?x240', '?x144']
    } else if (height < 1440) {
      return ['?x1080', '?x720', '?x480', '?x360', '?x240', '?x144']
    } else if (height < 2160) {
      return ['?x1440', '?x1080', '?x720', '?x480', '?x360', '?x240', '?x144']
    } else {
      // 8k !! get the fuck outta here. do your own transcoding for now.
      return ['?x2160', '?x1440', '?x1080', '?x720', '?x480', '?x360', '?x240', '?x144']
    }
  },

  /**
   * get BANDWIDTH for a specific height
   * @param  {number} height video height.
   * @return {String}        BANDWIDTH
   */
  getBandwidth: function (height) {
    if (!height) {
      return null
    }

    // default to the lowest height. in case the video is smaller than that.
    return MAX_BIT_RATE[String(height)] || MAX_BIT_RATE['144']
  },

  /**
   * get video height from size String
   * @param  {String} size string from ffmpeg @example '?x720'
   * @return {number}      height integer.
   */
  getHeight: function (size) {
    return parseInt(size.split('x')[1])
  },

  /**
   * calculate new width based on downsampled height and codecData derived aspect-ratio
   * @param  {Object} codecData     ffmpeg codecData Object, can be grabbed from ffmpeg.on('codecData')
   * @param  {number} currentHeight downsampled height.
   * @return {String}               returns resolution value used in HLS manifest
   * @example codecData {
   *     format: 'mov,mp4,m4a,3gp,3g2,mj2',
   *     audio: 'aac (LC) (mp4a / 0x6134706D)',
   *     video: 'h264 (Constrained Baseline) (avc1 / 0x31637661)',
   *     duration: '00:01:00.19',
   *     audio_details: [
   *       'aac (LC) (mp4a / 0x6134706D)',
   *       '22050 Hz',
   *       'stereo',
   *       'fltp',
   *       '65 kb/s (default)'
   *     ],
   *     video_details: [
   *       'h264 (Constrained Baseline) (avc1 / 0x31637661)',
   *       'yuv420p(tv',
   *       'smpte170m/smpte170m/bt709)',
   *       '640x360',
   *       '612 kb/s',
   *       '23.96 fps',
   *       '24 tbr',
   *       '600 tbn',
   *       '1200 tbc (default)'
   *     ]
   *   }
   */
  calculateWidth: function (codecData, currentHeight) {
    let resString = /^\d{3,}x\d{3,}$/g // test
    // test all video_details against resString
    let res = codecData.video_details.filter((str) => { return (resString.test(str)) })
    if (res && res.length > 0) {
      res = res[0]
      res = res.split('x')
    } else {
      console.log('RES IS NULL , ', res)
      return null
    }
    let width = parseInt(res[0])
    let height = parseInt(res[1])

    let s = parseInt(currentHeight)

    return String(Math.floor((width * s) / height) + 'x' + s)
  },

  /**
   * convert duration string to seconds
   * @param  {string} duration duration string @example '00:01:00.19'
   * @return {Float}          duration in seconds.
   */
  getDurationInSeconds: function (duration) {
    if (!duration) {
      return null
    }

    let durationArray = duration.split(':')
    let hours = parseInt(durationArray[0])
    let minutes = parseInt(durationArray[1])
    let seconds = parseFloat(durationArray[2])

    return (hours * 60 * 60) + (minutes * 60) + seconds
  },

  /**
   * get percent of transcoded video
   * @param  {String} currentTimemark duration string of the current timemark
   * @param  {String} duration        video duration
   * @return {Float}                 percent completed.
   */
  getProgressPercent: function (currentTimemark, duration) {
    if (!duration) {
      return null
    }

    currentTimemark = module.exports.getDurationInSeconds(currentTimemark)
    duration = module.exports.getDurationInSeconds(duration)

    // never divide by zero. cuz math.
    if (parseInt(duration) === 0) {
      return 0
    }

    return parseFloat((currentTimemark / duration) * 100)
  },

  generateBitrateDefinition: function (bitrate) {

  }
}
