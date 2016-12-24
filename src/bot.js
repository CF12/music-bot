"use strict"
// Import Requirements
const DiscordJS = require('discord.js')
const fs = require('fs')
const path = require('path')
const ytdl = require('ytdl-core')
const YouTubeAPIHandler = require('./youtubeapihandler')
const mh = require('./messagehandler')

// Load Files
try {
  var cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'config.json')))
  var blacklist = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'blacklist.json')))
  var radiolist = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'radio_playlists.json')))
} catch (err) {
  if (err) throw err
}

// Object Construction
const bot = new DiscordJS.Client()
const yth = new YouTubeAPIHandler(cfg.youtube_api_key)

// Variable Declaration
let pf = '$'
let voiceConnection
let voiceChannel
let dispatcher
let songQueue = []
let volume = 0.15
let mchannel
let radioMode = false
let radioType

// Init Bot
bot.login(cfg.bot_token)

/*
// Bot Events
*/

// On: Bot ready
bot.on('ready', () => {
  console.log('BOT >> Music Bot started')
  bot.user.setGame('v0.2.3 - By CF12')
})

// On: Message Creation
bot.on('message', (msg) => {
  /*
   * TODO: Create Skip command
   * TODO: Radio Functionality
   * TODO: Repeats and Shuffles
   * TODO: Song Queue Showcase
   * TODO: User and Song Blacklists
   * TODO: Temporary DJ's
   */

  // Cancels messages without pf or user is a bot
  if (msg.author.bot || !msg.content.startsWith(pf)) return

  // Command variables
  mchannel = msg.channel
  let member = msg.member
  let fullMsgArray = msg.content.split(' ')
  let cmd = fullMsgArray[0].slice(1, fullMsgArray[0].length).toUpperCase()
  let args = fullMsgArray.slice(1, fullMsgArray.length)

  // Command: Ping
  if (cmd === 'PING') {
    msg.channel.sendMessage('**INFO > **Pong!')
  }

  // Command: DB
  if (cmd === 'DB') {
    console.log(voiceChannel)
    console.log(voiceConnection)
    console.log(dispatcher)
    console.log(volume)
  }

  // Command: Play from YouTube Link
  if (cmd === 'PLAY') {
    let sourceID
    if (!member.voiceChannel) return mh.logChannel(mchannel, 'err', 'User is not in a voice channel!')
    if (args.length === 0) return mh.logChannel(mchannel, 'info', 'Adds a YouTube link to the playlist. Usage: *' + pf + 'play [url]*')
    if (args.length > 1) return mh.logChannel(mchannel, 'err', 'Invalid usage! Usage: ' + pf + 'play [url]')
    if (blacklist.users.includes(member.id)) return mh.logChannel(mchannel, 'bl', 'User is blacklisted!')
    if (playlist) return mh.logChannel(mchannel, 'err', 'User is blacklisted!') // TODO: FIX THIS

    try {
      sourceID = parseYTUrl(args[0])
    } catch (err) {
      return mh.logChannel(mchannel, 'err', 'Error while parsing URL. Please make sure the URL is a valid YouTube link.')
    }

    if (sourceID.includes('p:')) {
      let playlistID = sourceID.substring(2)
      addPlaylist(playlistID, member, () => {
        mh.logChannel(mchannel, 'musinf', 'Playlist successfully added!')
        if (!voiceConnection) voiceConnect(member.voiceChannel)
      })
      return
    }

    addSong(sourceID, msg.member, false, () => {
      if (!voiceConnection) voiceConnect(member.voiceChannel)
    })
  }

  // Command: List Song Queue
  if (cmd === 'QUEUE') {
    if (songQueue.length === 0) return mh.logChannel(mchannel, 'info', 'Song Queue:\n```' + 'No songs have been queued yet. Use ' + pf + 'play [YouTube URL] to queue a song.' + '```')

    let firstVideoTitle = songQueue[0].title
    let firstVideoDuration = songQueue[0].duration
    if (firstVideoTitle.length >= 60) firstVideoTitle = firstVideoTitle.slice(0, 55) + ' ...'
    let queue = firstVideoTitle + ' '.repeat(60 - firstVideoTitle.length) + '|' + ' ' + firstVideoDuration + '\n'

    for (let i = 1; i < songQueue.length; i++) {
      let videoTitle = songQueue[i].title
      let videoDuration = songQueue[i].duration

      if (videoTitle.length >= 60) videoTitle = videoTitle.slice(0, 55) + ' ...'
      if (queue.length > 1800) {
        queue = queue + '...and ' + (songQueue.length - i) + ' more'
        break
      }

      queue = queue + videoTitle + ' '.repeat(60 - videoTitle.length) + '|' + ' ' + videoDuration + '\n'
    }

    mh.logChannel(mchannel, 'info', 'Song Queue:\n```' + queue + '```')
  }

  // Command: Leave Voice Channel
  if (cmd === 'LEAVE') {
    if (!voiceConnection) return mh.logChannel(mchannel, 'err', 'The bot is not in a voice channel!')
    if (radioMode) {
      radioMode = false
      mh.logChannel(mchannel, 'musinf', 'Radio Mode has been toggled to: **OFF**')
    }

    songQueue = []
    dispatcher.end()
    voiceConnection = undefined
  }

  // Command: Volume Control
  if (cmd === 'VOLUME') {
    if (args.length === 0) return mh.logChannel(mchannel, 'info', 'Sets the volume of music. Usage: ' + pf + 'volume [1-100]')
    if (args.length === 1 && args[0] <= 100 && args[0] >= 1) {
      volume = args[0] * 0.002
      if (dispatcher) dispatcher.setVolume(volume)
      mh.logChannel(mchannel, 'vol', 'Volume set to: ' + args[0])
    } else mh.logChannel(mchannel, 'err', 'Invalid usage! Usage: ' + pf + 'volume [1-100]')
  }

  if (cmd === 'RADIO') {
    console.log(args.length)
    if (args[0].toUpperCase() === 'SET') {
      if (args.length === 2) {
        mh.logConsole('db', 'test')
        if (voiceConnection) return mh.logChannel(mchannel, 'err', 'Bot cannot be in a voice channel while activating radio mode. Please disconnect the bot by using ' + pf + 'leave.')
        if (!member.voiceChannel) return mh.logChannel(mchannel, 'err', 'User is not in a voice channel!')

        radioMode = true
        mh.logChannel(mchannel, 'musinf', 'Radio Mode has been toggled to: **ON**')

        addPlaylist("PLUU1mC42CNXFYb8OtOsKslYb28TLoEIqL", msg.member, () => { voiceConnect(member.voiceChannel) })
        return
      }
    }

    if (args[0] === 'OFF' && args.length === 1) {
      radioMode = false
      mh.logChannel(mchannel, 'musinf', 'Radio Mode has been toggled to: **OFF**')

      songQueue = []
      dispatcher.end()
      voiceConnection = undefined
      return
    }
  }
})

/*
// Functions
*/

// Function: Parse YT Url
function parseYTUrl (url, callback) {
  let videoID

  if (url.includes('youtube.com') && url.includes('watch?v=')) videoID = url.split('watch?v=')[1].split('#')[0].split('&')[0]
  else if (url.includes('youtu.be')) videoID = url.split('be/')[1].split('?')[0]
  else if (url.includes('youtube.com') && url.includes('playlist?list=')) videoID = 'p:' + url.split('playlist?list=')[1]
  else throw Error('Not a YouTube Link')

  if (callback) return callback(videoID)
  return videoID
}

// Function: Adds song to queue
function addSong (videoID, member, suppress, callback) {
  yth.getVideo(videoID, (err, info) => {
    if (err) return mh.logChannel(mchannel, 'err', 'Error while parsing video(es). Please make sure the URL is valid.')
    if (!suppress || !radioMode) mh.logChannel(mchannel, 'info', 'Song successfully added to queue.')
    let video = info.items[0]

    songQueue.push({
      video_ID: videoID,
      link: String('http://youtube.com/?v=' + videoID),
      requester: member.toString(),
      title: video.snippet.title,
      duration: convertDuration(video.contentDetails.duration)
    })

    if (callback) callback()
  })
}

// Function: Queues an entire playlist
function addPlaylist (playlistID, member, callback) {
  if (!radioMode) mh.logChannel(mchannel, 'musinf', 'Fetching playlist information...')
  yth.getPlaylist(playlistID, (err, playlist) => {
    if (err) return mh.logChannel(mchannel, 'err', 'Error while parsing playlist URL. Please make sure the URL is valid.')

    for (const index in playlist) {
      addSong(playlist[index].snippet.resourceId.videoId, member, true, () => {
        if ((playlist[0] === playlist[index]) && (typeof callback === 'function')) callback()
      })
    }
  })
}

// Function: Plays next song
function nextSong () {
  let song
  if (radioMode) song = songQueue[Math.floor(Math.random(0, songQueue.length))]
  else song = songQueue[0]

  if (!radioMode) {
    mh.logChannel(mchannel, 'musinf', 'NOW PLAYING: ' + song.title + ' - [' + song.duration + '] - requested by ' + song.requester)
    mh.logConsole('info', 'Now streaming: ' + song.title)
  }

  return voiceConnection.playStream((ytdl(song.link)), {
    'volume': volume
  })
  .on('end', () => {
    if (!radioMode) {
      songQueue.shift()
      if (songQueue.length === 0) return voiceDisconnect()
    }
    dispatcher = nextSong()
  })
}

// Function Connects to Voice Channel
function voiceConnect (channel) {
  voiceChannel = channel
  channel.join()
  .then((connection) => {
    mh.logConsole('info', 'Joining Voice Channel <' + voiceChannel.id + '>')
    voiceConnection = connection
    dispatcher = nextSong()
  })
}

// Function: Disconnect from Voice Channel
function voiceDisconnect () {
  mh.logConsole('info', 'Leaving Voice Channel <' + voiceChannel.id + '>')
  mh.logChannel(mchannel, 'musinf', 'Queue ended. Disconnecting...')

  voiceConnection.disconnect()
  voiceConnection = undefined
}

// Function: Convert Durations from ISO 8601
function convertDuration (duration) {
  let reptms = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/
  let hours = 0
  let minutes = 0
  let seconds = 0

  if (reptms.test(duration)) {
    let matches = reptms.exec(duration)
    if (matches[1]) hours = Number(matches[1])
    if (matches[2]) minutes = Number(matches[2])
    if (matches[3]) seconds = Number(matches[3]) - 1
  }

  if (hours >= 1) return (hours < 10 ? '0' + hours : hours) + ':' + (minutes < 10 ? '0' + minutes : minutes) + ':' + (seconds < 10 ? '0' + seconds : seconds)
  if (minutes >= 1) return (minutes < 10 ? '0' + minutes : minutes) + ':' + (seconds < 10 ? '0' + seconds : seconds)
  else return '00:' + (seconds < 10 ? '0' + seconds : seconds)
}