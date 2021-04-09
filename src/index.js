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

const BPS = 176400; // bytes per second
const PCM_INTERVAL = 1000;

class YoutubeMusicGTK {
    constructor() {
        this.gui = new GUI(this);

        this.speaker = new Speaker({
            channels: 2,
            bitDepth: 16,
            sampleRate: 44100
        });

        /*const sox = cp.spawn('play', ['-traw', '-r44.1k', '-b16', '-esigned', '-c2', '-']);
        sox.stdout.on('data', (data) => console.log(data.toString()));
        sox.stderr.on('data', (data) => console.log(data.toString()));
        this.speaker = sox.stdin;*/

        this.volume = new Volume();

        // [ { id, title, album, artist } ]
        this.searchResultTracks = [];
        this.trackQueue = [];

        // { id, title, album, artist }
        this.currentTrack = {};

        // position in seconds
        this.currentTrackPosition = 0;

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

        return new Promise((resolve) => {
            const pcmConcat = concat((pcmBuffer) => {
                this.currentTrackPCM = pcmBuffer;
                console.log(Date.now(), 'done setting track');
                resolve();
            });

            pcmOutputStream.pipe(pcmConcat);
            //pcmOutputStream.pipe(this.volume);
            compressedStream.pipe(input);

            converter.run().then(() => {
                console.log(Date.now(), 'done converting');
            });
        });
    }

    playTrack() {
        this.isPlaying = true;
    }

    setVolume(volume) {
        this.volume.setVolume(volume);
    }

    tick() {
        const delta = Date.now() - this.expected;

        if (this.isPlaying && this.currentTrackPCM) {
            // position of the PCM buffer to begin the sample
            const start = BPS * this.currentTrackPosition;

            // buffer of sample we're sending to the speaker
            const pcmChunk = this.currentTrackPCM.slice(start, start + BPS);

            //this.speaker.write(pcmChunk);
            this.volume.write(pcmChunk);

            if (this.currentTrackPosition === 0) {
                const start2 = start + BPS;

                // buffer of sample we're sending to the speaker
                const pcmChunk = this.currentTrackPCM.slice(start2, start2 + BPS);

                //this.speaker.write(pcmChunk);
                this.volume.write(pcmChunk);

                this.currentTrackPosition += 1;
            }

            // add a second to the song position
            this.currentTrackPosition += 1;

            if (!this.isSeeking) {
                this.gui.setDuration(this.currentTrackPosition);
            }
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
        //this.tick();
        this.gui.init();
    }
}

module.exports = YoutubeMusicGTK;
