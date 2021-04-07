#!/usr/bin/env node

const YoutubeMusicGTK = require('./');

(async () => {
    const youtubeMusicGTK = new YoutubeMusicGTK();
    await youtubeMusicGTK.start();
})();
