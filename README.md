# SipLess ✿

A personal drink tracker to help you drink less. Log daily or retroactively, view stats, streaks, and a color-coded calendar heatmap.

## Quick Start (Windows)

**Prerequisites:** [Node.js](https://nodejs.org/) v18+ installed.

```bash
# 1. Open a terminal in this folder
cd sipless

# 2. Install dependencies
npm install

# 3. Start the app
npm start
```

The app will open automatically at **http://localhost:3000** in your default browser.

## Features

- **Dashboard** — weekly goal ring, dry streak, sober rate, daily average, best streak, week-over-week comparison, 8-week trend chart
- **Log** — add/remove drinks by type (beer, wine, cocktail, shot, seltzer) for today or any past date
- **Calendar Heatmap** — monthly view color-coded green → yellow → red based on consumption
- **Persistent data** — everything saved in your browser's localStorage

## Build for Production

```bash
npm run build
```

Output goes to the `dist/` folder — deploy anywhere as a static site.
