# Digital Clock

[中文版 README](README_zh.md)

A beautiful, highly customizable desktop clock built with **Electron**. Features smooth digit animations, multi-timezone support, auto day/night color switching, blur/scale transitions, and a fully customizable display.

## Features

### Animation System
- **7 animation types** — Slide Up, Slide Down, Fade, Shrink, Expand, 3D Flip, or None
- **Staggered digit animation** — per-digit delay (0–300ms) with LTR/RTL direction
- **Blur transition** — adds a blur effect during slide-up/slide-down animations (configurable duration & strength)
- **Scale-in effect** — digits grow from a smaller size as they slide in (configurable start size)
- **Speed control** — animation duration 50–1000ms

### Display Customization
- **Text color** — any hex color
- **Background color** — any RGBA color with adjustable transparency
- **Font** — preset list (Arial, Georgia, Microsoft YaHei, Courier New, Inter) or custom font name
- **Font size** — 40–400px
- **Date display** — toggle on/off, position above or below the time
- **Date/timezone text size** — independent ratio slider (10%–100% of clock font size)
- **Auto day/night** — automatically switches between black and white text based on time of day (06:00–18:00)

### Time & Timezones
- **Seconds display** — toggle on/off
- **Multi-timezone** — show up to 2 additional timezones with custom labels (e.g. "New York UTC-5")

### Window & System
- **6 position presets** — top-left, top-right, center, bottom-left, bottom-right, or custom X/Y
- **Drag & auto-save** — drag the window to reposition; position auto-saves as "custom"
- **Layer mode** — "Always on Top" or normal (desktop) mode
- **Mouse passthrough** — make the entire window click-through
- **Custom tray menu** — right-click the tray icon for a themed popup menu (Settings / Quit); left-click to toggle visibility
- **Auto-start on boot** — launch with Windows
- **Bilingual UI** — Chinese (zh) and English (en) interface for the settings window
- **Settings persistence** — all settings saved to `config.json` automatically

### Alarm
- **Multiple alarms** — create, edit, delete alarms via the settings panel
- **Custom names** — auto-numbered with gap reuse
- **Sound selection** — beep, chime, alarm (Web Audio API), or silent
- **Repeat with weekday picker** — select individual days of the week (Mon–Sun)
- **Snooze** — configurable snooze interval (hours/minutes/seconds) with optional retry limit (unlimited or custom count)
- **Inline display** — shows next scheduled alarm as `! hh:mm !` on the clock face; shows `? hh:mm ?` for pending retry; alternates with alarm name every 3s during ringing
- **Ringing behavior** — window forced to front (configurable), passthrough overridden (configurable), always-on-top forced (configurable), digits flash red (configurable), click anywhere to dismiss; ringing stops after configurable duration and moves to retry
- **Smart skip** — overlapping alarms within 7 minutes are auto-dismissed if the earlier alarm is missed
- **Retry** — unhandled alarms retry after the configured snooze interval, with optional retry limit
- **Missed alarm recovery** — auto-reschedule on app restart with a notification
- **Advanced alarm settings** (collapsible in settings panel):
  - Ringing duration (5–300s slider, default 120s)
  - Flash on alarm (on/off)
  - Auto-show window on alarm (on/off)
  - Auto-disable mouse passthrough on alarm (on/off)
  - Auto-force always-on-top on alarm (on/off)

## Screenshots

![Clock demo](docs/screenshots/clock-demo.png)

## Quick Start

```bash
# Install dependencies
npm install

# Run
npm start

# Build portable executable
npm run dist
```

The built executable will be in `dist/` as a portable Windows app.

## Project Structure

```
├── main.js          # Electron main process (window, tray, IPC)
├── preload.js       # Context bridge (secure IPC exposure)
├── index.html       # Clock window
├── renderer.js      # Clock rendering, animation, real-time updates
├── styles.css       # Clock styles (animation keyframes, blur/scale effects)
├── settings.html    # Settings window
├── settings.js      # Settings logic & i18n locale
├── settings.css     # Settings styles
├── config.json      # User settings (auto-generated, %APPDATA%/digital-clock/)
├── package.json     # Dependencies and build config
├── docs/
│   └── screenshots/ # App screenshots
└── LICENSE          # MIT License
```

## Configuration

All settings are stored in `%APPDATA%/digital-clock/config.json` and can be adjusted through the settings window (right-click tray icon → Settings or left-click → right-click).

Available settings:

| Category | Settings |
|---|---|
| **Appearance** | Text color, background color (RGBA), font family (preset or custom), font size, date/timezone size ratio |
| **Animation** | Animation type (7 options), animation duration, stagger delay & direction, blur effect (toggle/duration/strength), scale-in effect (toggle/start size) |
| **Time** | Show seconds, show date, show weekday, date position (above/below) |
| **Alarm** | Multiple alarms with custom names, time selection, sound picker (beep/chime/alarm/none), repeat with weekday selection, configurable snooze (interval + retry count), auto-skip overlapping alarms, retry on missed, advanced settings (ringing duration, flash, auto-show, auto-passthrough, auto-top) |
| **Time Zones** | Up to 2 extra timezones with custom labels & UTC offsets |
| **Window** | Position presets (6 options), custom X/Y coordinates, layer mode |
| **System** | Auto-start on boot, mouse passthrough, language (zh/en) |

## Tech Stack

- **Electron** — cross-platform desktop framework
- **Vanilla JavaScript** — no frameworks, lightweight and fast
- **CSS Custom Properties** — dynamic animation duration, blur, and scale via CSS variables
- **IPC** — main/renderer process communication via Electron IPC
- **electron-builder** — portable Windows executable packaging

## Repository

- **Gitee**: [https://gitee.com/Yejack819/AniClock-Desktop.git](https://gitee.com/Yejack819/AniClock-Desktop.git)

## License

MIT © 2026 Yejack819
