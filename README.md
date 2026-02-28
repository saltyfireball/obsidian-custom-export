# Custom Export

![Framerate](https://img.shields.io/badge/framerate-cinematic%2012fps-fff?style=flat&logo=nvidia&logoColor=FFFFFF&label=framerate&labelColor=5B595C&color=FF6188) ![Cursor](https://img.shields.io/badge/cursor-waiting%20hourglass-fff?style=flat&logo=windows95&logoColor=FFFFFF&label=cursor&labelColor=5B595C&color=5C7CFA) ![Inbox](https://img.shields.io/badge/inbox-9999%2B%20adventures-fff?style=flat&logo=gmail&logoColor=FFFFFF&label=inbox&labelColor=5B595C&color=A9DC76) ![Yoink](https://img.shields.io/badge/yoink-borrowed%20code-fff?style=flat&logo=github&logoColor=FFFFFF&label=yoink&labelColor=5B595C&color=A9DC76) ![Lurking](https://img.shields.io/badge/lurking-professional-fff?style=flat&logo=twitch&logoColor=FFFFFF&label=lurking&labelColor=5B595C&color=78DCE8) ![IRC](https://img.shields.io/badge/irc-/join%20chaos-fff?style=flat&logo=matrix&logoColor=FFFFFF&label=IRC&labelColor=5B595C&color=FFD866) ![License](https://img.shields.io/badge/license-good%20luck-fff?style=flat&logo=opensourceinitiative&logoColor=FFFFFF&label=license&labelColor=5B595C&color=78DCE8) ![Pog Level](https://img.shields.io/badge/pog%20level-over%209000-fff?style=flat&logo=twitch&logoColor=FFFFFF&label=pog%20level&labelColor=5B595C&color=5C7CFA) ![Sticker Bombed](https://img.shields.io/badge/sticker%20bombed-laptop%20edition-fff?style=flat&logo=stickermule&logoColor=FFFFFF&label=sticker%20bombed&labelColor=5B595C&color=FF6188)

<p align="center">
  <img src="assets/header.svg" width="600" />
</p>

An Obsidian plugin for exporting notes to HTML, Markdown, and PDF with full theme support, asset handling, and per-device output folders.

## Features

- **HTML export** - Renders the current note with Obsidian theme CSS, local images, and code block copy buttons
- **Markdown export** - Converts wikilinks, callouts, and embeds to portable standard Markdown
- **PDF export** - Generates PDFs via a configurable Lambda API with viewport and timeout controls
- **Selection export** - Export just the selected text as HTML or Markdown
- **Theme CSS inlining** - Captures active theme and snippet styles so exports match your vault appearance
- **Local asset handling** - Inline images as base64 or copy them to an assets folder
- **Per-device output folders** - Each device can have its own default export location
- **Banner image support** - Exports banner images from frontmatter if present
- **Mobile support** - Uses the system share sheet on mobile devices

## Installation

### Community Plugins (Recommended)

1. Open **Settings > Community Plugins** in Obsidian
2. Search for **Custom Export**
3. Click **Install**, then **Enable**

### Manual Installation

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/saltyfireball/obsidian-custom-export/releases/latest)
2. Create a folder at `<vault>/.obsidian/plugins/obsidian-custom-export/`
3. Place the downloaded files in that folder
4. Restart Obsidian and enable the plugin in **Settings > Community Plugins**

## Usage

### Export Commands

Use the command palette (Ctrl/Cmd+P) to access:

- **Export current note to HTML**
- **Export current note to Markdown**
- **Export current note to PDF**
- **Export selection to HTML**
- **Export selection to Markdown**

You can also right-click a file in the file explorer for export options.

### Settings

The plugin settings are organized into three tabs:

- **General** - Output folder, CSS inclusion, asset handling, post-process delay
- **PDF** - API URL, API key, viewport dimensions, timeout, waitFor selector
- **Markdown** - Embed expansion, callout conversion, wikilink conversion, Dataview handling

### PDF Export

PDF export requires a configured Lambda API endpoint. Set the API URL and key in the PDF settings tab.

**Note:** The API key is stored in plaintext in the plugin's `data.json` file. Do not share your vault data if it contains sensitive keys.

## License

MIT
