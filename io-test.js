const fs = require('fs').promises;
const gi = require('node-gtk');

const GObject = gi.require('GObject');
const Gtk = gi.require('Gtk', '3.0');

function test() {
    return new Promise(resolve => {
        setTimeout(resolve, 1000);
    });
}

gi.startLoop();
Gtk.init();

(async () => {
    const win = new Gtk.Window();

    win.on('destroy', () => Gtk.mainQuit());
    win.on('delete-event', () => false);

    win.setDefaultSize(200, 80);
    const button = new Gtk.Button({ label: 'farts' });

    button.on('clicked', async () => {
        await test();
        console.log('hi');

        const test2 = await fs.readFile('/home/zorian/qr.png');
        console.log('done', test2);
    });

    win.add(button);

    win.showAll();
})();

Gtk.main();
