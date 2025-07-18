# Team Management Admin Portal (Vite + React + TypeScript)

This is a modern SPA for managers to organize teams, value streams, tasks/notes, and 1:1 sessions.

## Features

- **Modern UI** with #016c42 as the primary color
- **Value Streams**: Add/manage value streams in Settings
- **Task/Note Management**: Add notes/actions to value streams, see all entries
- **1:1 Sessions**: Manage and run personal development sessions for team members
- **Persistent Local Storage**: Uses the File System Access API (not localStorage) for secure, persistent data on your device
- **Runs as a static SPA**: No webserver required, just open `index.html`

## Getting Started

```bash
npm install
npm run dev
```

## Build for Static Hosting

```bash
npm run build
```

The output will be in the `dist/` folder. You can open `dist/index.html` directly in your browser.

---

_This project was bootstrapped with Vite's React + TypeScript template._
