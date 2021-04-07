const fs = require('fs');
const gi = require('node-gtk');
const ytMusic = require('node-youtube-music').default;

const GObject = gi.require('GObject');
const Gtk = gi.require('Gtk', '3.0');

const SEARCH_COLUMNS = ['title', 'artist', 'album', 'duration'];
const UI_XML = fs.readFileSync(__dirname + '/ui.glade').toString();

gi.startLoop();
Gtk.init();

const settings = Gtk.Settings.getDefault();
settings.gtkApplicationPreferDarkTheme = true;

class GUI {
    constructor(ytMusicGTK) {
        this.ytMusicGTK = ytMusicGTK;

        this.builder = Gtk.Builder.newFromString(UI_XML, UI_XML.length);

        this.stores = {
            searchResults: this.builder.getObject('search-result-store')
        };

        this.window = this.builder.getObject('root-window');
        this.durationAdjustment = this.builder.getObject('duration-adjustment');
    }

    addSearchResult(track) {
        const iter = this.stores.searchResults.append();

        for (const [index, columnName] of Object.entries(SEARCH_COLUMNS)) {
            const column = new GObject.Value();

            column.init(GObject.TYPE_STRING);
            column.setString(track[columnName]);

            this.stores.searchResults.setValue(iter, +index, column);
        }
    }

    showSearchResults() {
        const searchLabel = this.builder.getObject('search-label');
        const rootBox = this.builder.getObject('root-box');
        const results = this.builder.getObject('search-result-box');

        results.expand = true;

        rootBox.remove(searchLabel);
        rootBox.add(results);
        rootBox.reorderChild(results, 0);
    }

    setPlayerSensitive(sensitive) {
        const playerWidgets = this.builder
            .getObject('player-box')
            .getChildren();

        for (const widget of playerWidgets) {
            widget.sensitive = sensitive;
        }
    }

    setDuration(current, max) {
        if (typeof max !== 'undefined') {
            this.durationAdjustment.setUpper(max);
        }

        this.durationAdjustment.setValue(current);
    }

    init() {
        this.window.on('destroy', () => {
            this.ytMusicGTK.quit();
            Gtk.mainQuit();
        });

        this.window.on('delete-event', () => false);

        this.builder.connectSignals({
            onQueueButtonToggled: () => {
                console.log('hi');
            },
            onSearchEntryActivate: async () => {
                const searchEntry = this.builder.getObject('search-entry');
                searchEntry.sensitive = false;

                const terms = searchEntry.getText().trim();
                const tracks = await this.ytMusicGTK.searchTracks(terms);

                searchEntry.sensitive = true;

                this.ytMusicGTK.searchResultTracks = tracks;

                this.stores.searchResults.clear();

                for (const track of tracks) {
                    this.addSearchResult(track);
                }

                this.showSearchResults();
            },
            onSearchTrackActivated: async () => {
                const searchResultTreeView = this.builder.getObject(
                    'search-result-tree-view'
                );

                // get the index of the row selected
                const selection = searchResultTreeView.getSelection();
                const [path] = selection.getSelectedRows()[0];
                const [index] = path.getIndices();

                const track = this.ytMusicGTK.searchResultTracks[index];
                await this.ytMusicGTK.setTrack(track);

                this.ytMusicGTK.playTrack();
            },
            onDurationScaleButtonPress: () => {
                this.ytMusicGTK.isSeeking = true;
            },
            onDurationScaleButtonRelease: () => {
                const position = Math.floor(this.durationAdjustment.getValue());
                this.ytMusicGTK.currentTrackPosition = position;
                this.ytMusicGTK.isSeeking = false;
            },
            onPlayButtonClicked: () => {
                this.ytMusicGTK.isPlaying = !this.ytMusicGTK.isPlaying;
            }
        });

        this.window.showAll();

        this.setPlayerSensitive(true);

        // not sure why i need to do this yet
        setImmediate(() => Gtk.main());
    }
}

module.exports = GUI;
