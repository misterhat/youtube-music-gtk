const Speaker = require('speaker');
const concat = require('concat-stream');
const { Converter } = require('ffmpeg-stream');
const { createReadStream } = require('fs');

const BPS = 176400 / 4; // bytes per second

let playing = true;

const stdin = process.openStdin();
stdin.setRawMode(true);
stdin.setEncoding('utf8');
stdin.resume();

// Create the Speaker instance
const speaker = new Speaker({
    channels: 2, // 2 channels
    bitDepth: 16, // 16-bit samples
    sampleRate: 44100 // 44,100 Hz sample rate
});

speaker.on('end', () => console.log('flush'));

const converter = new Converter();
const input = converter.createInputStream();

const pcmOutputStream = converter.createOutputStream({
    f: 's16le',
    ar: '44100'
});

let firstFlush = true;

const pcmConcat = concat((pcmBuffer) => {
    // position in seconds
    let position = 0;

    setInterval(() => {
        if (playing) {
            const start = BPS * position;
            let end = start + BPS;

            if (firstFlush) {
                end += BPS;
                position += 1;
                firstFlush = false;
            }

            const chunk = pcmBuffer.slice(start, end);
            speaker.write(chunk);
            position += 1;
        }
    }, 250);
});

// on any data into stdin
stdin.on('data', function (key) {
    // ctrl-c ( end of text )
    if (key === '\u0003') {
        process.exit();
    } else if (key === 'p') {
        playing = !playing;

        if (playing) {
            firstFlush = true;
        }
    }
});

pcmOutputStream.pipe(pcmConcat);
createReadStream('./test.opus').pipe(input);

(async () => {
    await converter.run();
})();
