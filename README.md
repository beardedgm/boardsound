# Professional Soundboard

A browser-based soundboard for quickly loading and playing audio clips. Sounds can be added from local files or remote URLs and organized across multiple tabs. Each clip has individual playback controls along with volume, looping and seek functions. A built-in library stores uploaded files using IndexedDB so they can be reused later.

## Usage

1. Open `index.html` in a modern browser.
2. Drag and drop or select an MP3/WAV file to add it to the current tab.
3. Use "Load from URL" to add audio from a remote address.
4. Manage your clips with play, pause, stop, loop and volume controls.
5. Create additional tabs for different groups of sounds.
6. The "Library" button shows previously added files saved in your browser.

Saved state is stored in `localStorage` and audio files are kept in IndexedDB so they persist between sessions.
