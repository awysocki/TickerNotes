# TickerNotes - Stock/Security Notes PWA

A Progressive Web App for tracking personal notes on stocks and securities. Pure client-side app with optional cloud sync via Google Drive, OneDrive, or Dropbox.

## Why TickerNotes?

Brokerage platforms like Schwab, Robinhood, and TD Ameritrade let you buy and sell securities, but they don't let you keep private notes about *why* you bought them. Maybe you liked their ads, thought their products were cool, or an AI tool flagged it as a potential winner. Whatever your reasoning, you need a place to track it.

**That's where TickerNotes comes in.** This is purely a note-taking app for your investment ideas and decisions. You can optionally pull in daily stock prices for reference, but there's no real-time quotes or trading functionality. It's just your private notepad for tracking your investment thoughts and strategies.

## Features

- 📝 **Note Management**: Create, edit, and organize notes for your securities
- 🏢 **Group Organization**: Create custom groups (Schwab, Robinhood, etc.) with color coding
- 🔍 **Search & Filter**: Quickly find securities and filter by group or "NO GROUP"
- 📱 **Progressive Web App**: Install on mobile and desktop
- 🔒 **Private & Secure**: All data stored locally in your browser
- ☁️ **Cloud Sync**: Google Drive sync with automatic conflict resolution
- 🔄 **Smart Sync**: Snapshot-based first sync, configurable auto-check interval (1-60 min)
- 🚀 **Offline First**: Works completely offline, syncs when connected
- 📊 **Stock Data Import**: Import 6,400+ US stocks with daily pricing from GitHub
- 📄 **CSV Import**: Import portfolios from Schwab, Robinhood, TD Ameritrade, or generic CSV
- 📋 **PDF Import**: Parse Robinhood monthly statements
- 🎨 **Security Types**: Stocks, ETFs, mutual funds, bonds, crypto with proper formatting
- 🔐 **PIN Protection**: Optional 4-digit PIN lock for added security
- 📈 **Price Tracking**: Optional price display with 2 or 4 decimal precision
- 🗄️ **Data Management**: Export/import database, reset runlog, nuclear clean options

## Technology Stack

- HTML5, CSS3, JavaScript (ES6+)
- Alpine.js 3.x for reactivity (no build step required)
- Bootstrap 5 for UI components
- IndexedDB (via Dexie.js) for local storage
- PWA with Service Worker for offline support
- Client-side OAuth for Google Drive
- PDF.js for PDF parsing (Robinhood statements)

## Project Structure

```
/TickerNotes
├── /public                 # Static web files
│   ├── index.html         # Main SPA
│   ├── manifest.json      # PWA manifest
│   ├── service-worker.js  # Service worker for offline support
│   ├── version.js         # App version
│   └── /assets
│       ├── /css
│       │   └── styles.css
│       ├── /js
│       │   ├── app.js              # Main application
│       │   ├── spa.js              # Alpine.js components
│       │   ├── db.js               # IndexedDB wrapper
│       │   ├── operations.js       # Data operations
│       │   ├── sync.js             # Cloud sync logic
│       │   ├── cloud-providers.js  # Google/OneDrive/Dropbox
│       │   ├── stock-data.js       # Stock autocomplete
│       │   └── stock-import.js     # Stock data import
│       └── /images
└── README.md
```

## Installation

### Prerequisites
- A modern web browser (Chrome, Firefox, Edge, Safari)
- Web server for hosting static files (or use GitHub Pages, Netlify, Vercel, etc.)
- (Optional) Cloud storage account for syncing (Google Drive, OneDrive, or Dropbox)

### Setup Steps

1. **Clone or download the project**
   ```bash
   git clone https://github.com/yourusername/TickerNotes.git
   cd TickerNotes
   ```

2. **Serve the public directory**
   
   Any static file server will work:
   
   **Python:**
   ```bash
   cd public
   python -m http.server 8000
   ```
   
   **Node.js (http-server):**
   ```bash
   npx http-server public -p 8000
   ```
   
   **VS Code Live Server:**
   - Install Live Server extension
   - Right-click `public/index.html` and select "Open with Live Server"

3. **Access the app**
   - Open your browser to `http://localhost:8000`
   - The app works immediately - no setup required!

4. **(Optional) Configure Cloud Sync**
   
   To enable multi-device sync, you'll need to configure cloud provider credentials:
   
   Edit [public/assets/js/cloud-providers.js](public/assets/js/cloud-providers.js#L63-L65):
   ```javascript
   this.clientId = 'YOUR_GOOGLE_CLIENT_ID';
   this.redirectUri = window.location.origin;
   ```
   
   See [Cloud Sync Setup](#cloud-sync-setup) below for details.

## Cloud Sync Setup

### Google Drive (Recommended)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project
3. Enable "Google Drive API"
4. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
5. Choose "Web application"
6. Add your app URL to "Authorized JavaScript origins" (e.g., `http://localhost:8000`)
7. Add redirect URI: `http://localhost:8000` (same as your app URL)
8. Copy the Client ID
9. Update `clientId` in [cloud-providers.js](public/assets/js/cloud-providers.js#L63)

**What Gets Synced:**
- Two files stored in your Google Drive's hidden `appDataFolder`:
  - `tickernotes_runlog.jsonl` - All operations (append-only log)
  - `tickernotes_snapshot.json` - Full database snapshot (created weekly or after 50+ ops)
- New devices load the snapshot first, then apply recent operations
- Configurable auto-check: 1, 5, 10, 15, 30, or 60 minute intervals
- Manual "Reset Runlog" option to compact file size after 1-2 years

**Note**: Only Google Drive is currently supported. Other cloud providers (OneDrive, Dropbox) are not planned at this time. The Google Drive implementation provides reliable cross-device sync with snapshot-based conflict resolution.

## How It Works

### Local-First Architecture
- ✅ XSS protection (output escaping)
- ✅ User lockout support
- ✅ App version lockout
- ✅ Rate limiting (recommended to add)

## PWA Features

- 📱 Installable on mobile and desktop
- 🔄 Offline caching of static assets
- 📂 Background sync (optional)
- 🔔 Push notifications (optional)

- **All data stays in your browser** using IndexedDB
- **Works offline** - full functionality without internet
- **Optional cloud sync** - enable when you want multi-device access
- **No servers** - no hosting costs, no data privacy concerns
- **Your data, your control** - stored in your own cloud storage

### Data Storage

1. **Local Storage (IndexedDB)**
   - Securities, notes, groups, settings
   - Works completely offline
   - No data sent to any server

2. **Cloud Sync (Optional)**
   - Enable to sync across devices
   - Data stored in YOUR cloud account (Google Drive, OneDrive, or Dropbox)
   - Operation-based sync with conflict resolution
   - End-to-end: your browser ↔ your cloud storage (no intermediary)

## Features Overview

### Securities Management
- Add/edit/delete securities (stocks, ETFs, mutual funds, bonds, crypto)
- Support for various security types with proper formatting:
  - **Stocks**: Standard ticker symbols (AAPL, MSFT)
  - **ETFs**: Exchange-traded funds (SPY, QQQ)
  - **Mutual Funds**: 5-character symbols (VFIAX, FXAIX)
  - **Bonds**: Custom identifiers
  - **Crypto**: Digital currencies (BTC, ETH)
- Organize with custom groups/categories (color-coded)
- Move securities between groups with drag-and-drop workflow
- Filter by group or "NO GROUP" for unassigned securities
- Rich notes for each security with full-text search
- Optional price tracking with 2 or 4 decimal precision
- Security count badges on groups

### Group Management
- Create unlimited custom groups (e.g., "Schwab IRA", "Robinhood", "401k")
- Assign colors to groups for visual organization
- Rename or delete groups (securities auto-move to NO GROUP)
- "ALL" view to see everything, "NO GROUP" for unassigned securities
- Group operations sync across all devices

### Import Capabilities
- **CSV Import**: Import from multiple brokers:
  - Schwab (CSV format)
  - Robinhood (CSV format)
  - TD Ameritrade (CSV format)
  - Generic CSV (symbol, name, shares, price, group)
- **PDF Import**: Parse Robinhood monthly statements automatically
- **Stock Database**: Import 6,400+ US stocks from JNewman's GitHub repo
  - Daily updated pricing data
  - Smart rate limiting (24-hour cooldown)
  - Autocomplete when adding new securities

### Cloud Sync (Google Drive)
- **Snapshot System**: New devices load full snapshot, skip already-applied operations
- **Configurable Auto-Check**: 1, 5, 10, 15, 30, or 60 minute intervals
- **Operation Badge**: Shows pending local + available remote operations
- **Conflict Resolution**: Automatic CRDT-based merge
- **Reset Runlog**: Manual compaction tool (creates snapshot, clears runlog)
- **Nuclear Clean**: Complete Google Drive wipe with local data preservation
- **Auth Handling**: Graceful token expiration detection and re-auth prompts

### Stock Data Import
- Import 6,400+ US stock symbols from [JNewman's GitHub repo](https://github.com/JNewman-cell/Improved-US-Stock-Symbols)
- Autocomplete suggestions when adding securities
- Updated daily with pricing data
- Smart update limiting (once per 24 hours)

### Settings & Customization
- Display preferences (currency format, date/time)
- Group color customization
- PIN protection (optional)
- Data management (export/import)
- Stock data refresh

## Development

### Running Locally

Simply serve the `public` directory with any static file server.

### Project Architecture

- **spa.js** - Main Alpine.js application state and logic
- **db.js** - IndexedDB wrapper with Dexie.js
- **operations.js** - CRDT-style operations for sync
- **sync.js** - Sync coordinator between local and cloud
- **cloud-providers.js** - Google Drive, OneDrive, Dropbox clients
- **stock-data.js** - Stock search and autocomplete
- **stock-import.js** - Import stock database from GitHub

### Adding Features

1. Add UI in `public/index.html`
2. Add state/methods in `spa.js`
3. Add data operations in `operations.js`
4. Operations automatically sync when cloud is connected

## Deployment

### Static Hosting (Recommended)

The app is 100% static files, so you can host anywhere:

**GitHub Pages:**
```bash
# Push to gh-pages branch
git subtree push --prefix public origin gh-pages
```

**Netlify:**
- Drag and drop the `public` folder
- Or connect your git repo with build command: (none) and publish directory: `public`

**Vercel:**
```bash
vercel --prod
```

**Firebase Hosting:**
```bash
firebase init hosting
# Select 'public' as public directory
firebase deploy
```

### Custom Domain

Update OAuth redirect URIs in cloud provider consoles to match your domain.

## PWA Updates and Versioning

The app uses service workers for offline support and automatic updates. When you deploy a new version:

1. **Update version number** in ONE place:
   - `public/version.js` - Change `APP_VERSION = '1.0.0'` (e.g., to '1.0.1' or '1.1.0')
   
   That's it! The service worker and app both load this file automatically.
   The cache names are automatically generated from APP_VERSION

2. **Users will be notified automatically**:
   - An update banner appears at the top of the page
   - The version badge on the Settings page shows an "Update" button
   - Users can click either to update and refresh the app

3. **Manual update check**:
   - Users can click the version number in Settings to check for updates
   - The app checks for updates every 30 minutes automatically

## Privacy & Security

- ✅ **No user accounts** - no passwords to manage
- ✅ **No central database** - no data breach risk
- ✅ **Client-side only** - your data never touches our servers
- ✅ **Optional PIN lock** - protect app access on shared devices
- ✅ **Your cloud storage** - you control the data location
- ✅ **End-to-end** - direct connection between your browser and your cloud

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Any modern browser with IndexedDB and Service Worker support

## Contributing

Found a bug or have a feature request? Please [open an issue on GitHub](https://github.com/awysocki/TickerNotes/issues).

## Support

For help and support, visit [support.html](/support.html) or check out the [documentation](https://github.com/awysocki/TickerNotes).

## License

MIT License - See LICENSE file for details

## Future Ideas

Potential enhancements being considered:

- Export notes to PDF/CSV
- Rich text editor for notes
- Note attachments (images, files)
- Dark mode
- Portfolio analytics and performance tracking
