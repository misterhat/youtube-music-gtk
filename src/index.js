const GUI = require('./gui');
const Speaker = require('speaker');
const Volume = require('pcm-volume');
const concat = require('concat-stream');
const fs = require('fs');
const globalCacheDir = require('global-cache-dir');
const mkdirp = require('mkdirp');
const path = require('path');
const stream = require('stream');
const ytMusic = require('node-youtube-music').default;
const ytdl = require('ytdl-core');
const { Converter } = require('ffmpeg-stream');
const cp = require('child_process');

// bytes per second
const BPS = 176400;

// how often to pump the speaker buffer
const PCM_INTERVAL = 250;

// how much data to pump into the speaker
const PCM_LENGTH = BPS / (1000 / PCM_INTERVAL);

class YoutubeMusicGTK {
    constructor() {
        this.gui = new GUI(this);

        this.speaker = new Speaker({
            channels: 2,
            bitDepth: 16,
            sampleRate: 44100
        });

        this.volume = new Volume();

        // this.volume -> this.speaker via pipe

        // [ { id, title, album, artist, duration } ]
        this.searchResultTracks = [];
        this.trackQueue = [];

        // { id, title, album, artist, duration }
        this.currentTrack = {};

        // position of PCM buffer
        this.pcmPosition = 0;

        // add extra data to avoid underrun when starting or resuming a track
        this.pcmFirstFlush = true;

        // whether or not there's a track playing
        this.isPlaying = false;

        // decompressed PCM Buffer
        this.currentTrackPCM = undefined;

        this.boundTick = this.tick.bind(this);
    }

    async getSuggestions(id) {}

    async searchTracks(terms) {
        const tracks = (await ytMusic.searchMusics(terms)).map((track) => {
            return {
                id: track.youtubeId,
                title: track.title,
                artist: track.artist,
                album: track.album,
                duration: track.duration.totalSeconds
            };
        });

        this.searchResultTracks = tracks;

        return tracks;
    }

    getTrackPath(id) {
        return path.join(this.cacheDir, 'tracks', id);
    }

    // get a local (cached) or stream from youtube directly
    getTrackStream(id) {
        const localPath = this.getTrackPath(id);
        const trackStream = new stream.PassThrough();
        const fileStream = fs.createReadStream(localPath);

        fileStream.once('error', () => {
            const downloadStream = ytdl(`https://youtube.com/watch?v=${id}`, {
                filter: 'audioonly'
            });

            downloadStream.pipe(trackStream);
            downloadStream.pipe(fs.createWriteStream(localPath));
        });

        fileStream.pipe(trackStream);

        return trackStream;
    }

    setTrack(track) {
        this.isPlaying = false;
        this.pcmPosition = 0;
        this.currentTrack = track;

        console.log('API duration: ', track.duration);

        this.gui.setDuration(0, track.duration);

        const converter = new Converter();
        const input = converter.createInputStream();

        const pcmOutputStream = converter.createOutputStream({
            f: 's16le',
            ar: '44100'
        });

        const compressedStream = this.getTrackStream(track.id);

        return new Promise((resolve) => {
            const pcmConcat = concat((pcmBuffer) => {
                this.currentTrackPCM = pcmBuffer;
                console.log('calculated duration: ', this.getTrackDuration());
                resolve();
            });

            pcmOutputStream.pipe(pcmConcat);
            compressedStream.pipe(input);

            converter.run();
        });
    }

    // get the track position in seconds
    getTrackPosition() {
        const position = Math.floor(this.pcmPosition / (1000 / PCM_INTERVAL));
        return position;
    }

    // get the track duration in seconds
    getTrackDuration() {
        return Math.floor(this.currentTrackPCM.length / BPS);
    }

    setTrackPosition(position) {
        this.pcmPosition = position * (1000 / PCM_INTERVAL);
        this.pcmFirstFlush = true;
    }

    playTrack() {
        this.isPlaying = true;
        this.pcmFirstFlush = true;
    }

    setVolume(volume) {
        this.volume.setVolume(volume);
    }

    tick() {
        const delta = Date.now() - this.expected;

        if (this.isPlaying && this.currentTrackPCM) {
            // position of the PCM buffer to begin the sample
            const start = PCM_LENGTH * this.pcmPosition;

            let end = start + PCM_LENGTH;

            if (this.pcmFirstFlush) {
                console.log('first flush');
                end += PCM_LENGTH;
                this.pcmPosition += 1;
                this.pcmFirstFlush = false;
            }

            // buffer of sample we're sending to the speaker
            const pcmChunk = this.currentTrackPCM.slice(start, end);

            this.volume.write(pcmChunk);

            // if isSeeking is true, the user is moving the bar, so don't reset
            // the position while they're changing it
            if (!this.isSeeking) {
                this.gui.setDuration(this.getTrackPosition());
            }

            this.pcmPosition += 1;
        }

        if (this.isRunning) {
            this.expected += PCM_INTERVAL;

            setTimeout(this.boundTick, Math.max(0, PCM_INTERVAL - delta));
        }
    }

    quit() {
        this.isRunning = false;
    }

    async start() {
        this.volume.pipe(this.speaker);

        this.cacheDir = await globalCacheDir('youtube-music-gtk');

        await mkdirp(this.cacheDir);
        await mkdirp(path.join(this.cacheDir, 'tracks'));

        this.isRunning = true;

        this.expected = Date.now() + PCM_INTERVAL;
        setTimeout(this.boundTick, PCM_INTERVAL);

        this.gui.init();
    }
}

module.exports = YoutubeMusicGTK;
