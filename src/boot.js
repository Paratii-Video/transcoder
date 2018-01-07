'use strict'

/**
 * Boots up the PublisherNode
 */
const paratiiStartupWelcome = () => {
  console.log('...............................................................................................')
  console.log('...............................................................................................')
  console.log('...............................................................................................')
  console.log('...............................................................................................')
  console.log('....XXX........................................................................................')
  console.log('....XX00XX.....................................................................................')
  console.log('.....XXXX0XX...................................................................................')
  console.log('.....XXXXXXXXXX................................................................................')
  console.log('.....XXXXXXXXX0XX........X0XXXXXX0.....X00X......X0XXXXXX0X......000....XXXX00XXXX...0X...0X...')
  console.log('.....XXXXXXXXXXXXX.......X0......XX...X0.X0......X0X.....X0.....X0.X0.......X0.......0X...0X...')
  console.log('.....XXXXXXXXXXXXXXX.....X0.....X0X...0X..00.....X0X....X0X....X0X..0X......X0.......0X...0X...')
  console.log('.....XXXXXXXXXXXXXXX.....X0..XXXX....0X....0X....X0X.XXX0X.....0X....0X.....X0.......0X...0X...')
  console.log('....XXXXXXXXXXXXX........X0.........X0......0X...X0X....00....0X.....X0.....X0.......0X...0X...')
  console.log('....XXXXXXX..............X0........X0..XXXXX00...X0X.....0X..X0..XXXX000....X0.......0X...0X...')
  console.log('...............................................................................................')
  console.log('...............................................................................................')
  console.log('...............................................................................................')
  console.log('...............................................................................................')
  console.log('...............................................................................................')
}
const PublisherNode = require('./node')

const node = new PublisherNode({})
node.on('ready', () => {
  paratiiStartupWelcome()
  console.log('PARATII Transcoder Ready!')
})
