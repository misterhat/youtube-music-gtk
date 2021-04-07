const Speaker = require('speaker');
const Throttle = require('throttle-stream');
const concat = require('concat-stream');
const stream = require('stream');
const through = require('through');
const { Converter } = require('ffmpeg-stream');
const { createReadStream, createWriteStream } = require('fs');

let playing = true;

const stdin = process.openStdin();
stdin.setRawMode(true);
stdin.resume();

// i don't want binary, do you?
stdin.setEncoding('utf8');

// Create the Speaker instance
const speaker = new Speaker({
    channels: 2, // 2 channels
    bitDepth: 16, // 16-bit samples
    sampleRate: 44100, // 44,100 Hz sample rate
    samplesPerFrame: 176400
});

speaker.on('end', () => console.log('flush'));

const converter = new Converter();
const input = converter.createInputStream();

const pcmOutputStream = converter.createOutputStream({
    f: 's16le',
    ar: '44100'
});

const pcmConcat = concat((pcmBuffer) => {
    const bps = 176400;

    //const test = pcmBuffer.slice(0, bps * 5);
    //speaker.write(test);

    let pos = 0;

    setInterval(() => {
        if (playing) {
            const start = bps * pos;
            const test = pcmBuffer.slice(start, start + bps);
            speaker.write(test);
            pos += 1;
        }
    }, 1000);
});

// on any data into stdin
stdin.on('data', function (key) {
    // ctrl-c ( end of text )
    if (key === '\u0003') {
        process.exit();
    }

    if (key === 'p') {
        playing = !playing;
    }
});

pcmOutputStream.pipe(pcmConcat);

createReadStream('./test.mp3').pipe(input);

(async () => {
    await converter.run();
})();
