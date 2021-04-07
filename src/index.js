const GUI = require('./gui');
const Speaker = require('speaker');
const concat = require('concat-stream');
const fs = require('fs');
const globalCacheDir = require('global-cache-dir');
const mkdirp = require('mkdirp');
const path = require('path');
const stream = require('stream');
const ytMusic = require('node-youtube-music').default;
const ytdl = require('ytdl-core');
const { Converter } = require('ffmpeg-stream');

const BPS = 176400; // bytes per second

class YoutubeMusicGTK {
    constructor() {
        this.gui = new GUI(this);

        this.speaker = new Speaker({
            channels: 2,
            bitDepth: 16,
            sampleRate: 44100,
            samplesPerFrame: 176400
            //samplesPerFrame: 176400
        });

        // [ { id, title, album, artist } ]
        this.searchResultTracks = [];
        this.queueTracks = [];

        this.isRunning = true;

        // whether or not there's a track playing
        this.isPlaying = false;

        // { id, title, album, artist }
        this.currentTrack = {};

        // position in seconds
        this.currentTrackPosition = 0;

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

    getTrackStream(id) {
        const localPath = this.getTrackPath(id);
        const trackStream = new stream.PassThrough();
        const fileStream = fs.createReadStream(localPath);

        fileStream.once('error', () => {
            const downloadStream = ytdl(`https://youtube.com/watch?v=${id}`, {
                format: 'audioonly'
            });

            downloadStream.pipe(trackStream);
            downloadStream.pipe(fs.createWriteStream(localPath));
        });

        fileStream.pipe(trackStream);

        return trackStream;
    }

    setTrack(track) {
        this.currentTrackPosition = 0;
        this.currentTrack = track;

        this.gui.setDuration(0, track.duration);

        const converter = new Converter();
        const input = converter.createInputStream();

        const pcmOutputStream = converter.createOutputStream({
            f: 's16le',
            ar: '44100'
        });

        const compressedStream = this.getTrackStream(track.id);

        return new Promise(resolve => {
            const pcmConcat = concat((pcmBuffer) => {
                this.currentTrackPCM = pcmBuffer;
                resolve();
            });

            pcmOutputStream.pipe(pcmConcat);
            compressedStream.pipe(input);

            converter.run().then(() => {
                console.log('done converting');
            });
        });
    }

    playTrack() {
        this.isPlaying = true;
    }

    pauseTrack() {}

    setVolume(volume) {}

    tick() {
        if (this.isPlaying && this.currentTrackPCM) {
            // position of the PCM buffer to begin the sample
            const start = BPS * this.currentTrackPosition;

            // buffer of sample we're sending to the speaker
            const pcmChunk = this.currentTrackPCM.slice(start, start + BPS);

            this.speaker.write(pcmChunk);

            // add a second to the song position
            this.currentTrackPosition += 1;

            if (!this.isSeeking) {
                this.gui.setDuration(this.currentTrackPosition);
            }
        }

        if (this.isRunning) {
            setTimeout(this.boundTick, 1000);
        }
    }

    quit() {
        this.isRunning = false;
    }

    async start() {
        this.cacheDir = await globalCacheDir('youtube-music-gtk');

        await mkdirp(this.cacheDir);
        await mkdirp(path.join(this.cacheDir, 'tracks'));

        this.tick();
        this.gui.init();
    }
}

module.exports = YoutubeMusicGTK;
