# Digital Clock

[中文版 README](README_zh.md)

A beautiful, deeply customizable desktop flip clock built with **Electron**. Smooth digit animations, multi-timezone support, automatic day/night colours, an alarm system, fullscreen Lights-Off mode — and an **external plugin system** you can extend without touching the core code.

> Current version: **1.0.5.5** (shown in Settings → About)

## Features

### Animation
- **5 animation families** — Flip (slide up / slide down), Scale (shrink / grow), Fade, 3D Flip, None
- **Direction pickers** — Flip and Scale each expose their own direction option
- **Staggered digits** — per-digit delay (0–300 ms) with LTR / RTL order
- **Blur transition** — optional, available for the Flip family (duration 50–1000 ms, strength 1–40 px)
- **Scale-in** — optional, available for the Flip family: new digits grow from a configurable start ratio
- **Speed control** — animation duration 50–1000 ms
- Add-on effects are **hard-gated to the Flip family** (both in JS and in CSS), so switching to another animation never leaves a blur/scale leftover behind

### Display
- **Text colour / background colour** — any hex colour and any RGBA background with transparency
- **Font** — presets (Arial, Georgia, Microsoft YaHei, Courier New, Inter) or a custom font name
- **Font size** — 40–400 px
- **Seconds / date / weekday** — independent toggles
- **Date position** — above or below the time (the row hides itself when date, weekday and alarms are all off)
- **Info text ratio** — date / timezone text size as an independent ratio of the clock font size (10%–100%)
- **Auto day/night** — white text on black at night, black text on white by day (06:00 / 18:00), and the Lights-Off board follows it too

### Time & timezones
- **Hour format** — Follow system / 24-hour / 12-hour
- **AM/PM badge** — in 12-hour mode, placed in any of the four corners of the time display
- **Multi-timezone** — up to 2 extra timezones with custom labels and UTC offsets
- **Time calibration** — offset the displayed time ahead or behind by seconds **and milliseconds**
- **Scheduled auto-calibration** — add a fixed advance/delay every interval to compensate drift

### Modes & Lights Off
- **Normal / Education mode** — Education mode hides the "advanced" panels (animation, time, alarm, data) so only the essentials remain
- **Lights Off (fullscreen)** — a solid fullscreen board, optionally with the clock still drawn on it
- **Multi-monitor** — show the Lights Off board on the display holding the clock, on the primary display, or on all displays
- **Lock button** — when locked, only the Exit button can leave Lights Off
- **Clock visibility restore** — if the clock was hidden (tray toggle) before entering Lights Off, it stays hidden after leaving

### Window & system
- **Position presets** — top-left, top-right, center, bottom-left, bottom-right, custom X/Y
- **Drag & auto-save** — drag the window; the position is saved as "custom"
- **Layer mode** — always on top, or a normal desktop window
- **Mouse passthrough** — the whole window becomes click-through
- **Custom tray menu** — right-click the tray icon for a themed menu; left-click toggles the clock's visibility
- **Auto start on boot** — launch with Windows
- **Silent auto start** — start at boot without showing the clock window (tray only)
- **Bilingual UI** — settings window in Chinese or English
- **Settings window font size** — 5 steps, remembered between sessions

### Alarm
- **Multiple alarms** — create, edit and delete alarms in the settings panel
- **Custom names** — auto-numbered, reusing gaps
- **Sounds** — beep, chime, alarm (Web Audio API) or silent
- **Repeat with weekday picker** — any combination of Mon–Sun
- **Snooze** — configurable snooze interval (h/m/s) with an optional retry limit
- **Inline readout** — `! 07:30 !` for the next alarm, `? 07:30 ?` while waiting to retry; alternates with the alarm name every 3 s while ringing
- **Ringing behaviour** — force window to front, disable passthrough, force always-on-top, flash the digits (each configurable); click anywhere to dismiss
- **Smart skip** — an overlapping alarm within 7 minutes is auto-dismissed when the earlier one was missed
- **Missed-alarm recovery** — rescheduled on restart, with a system notification
- **Advanced alarm settings** (collapsible) — ringing duration (5–300 s), flash, auto-show, auto-passthrough, auto-top

### Data & plugins
- **Export / import preferences** — one JSON file containing every preference and all alarms, saved to any location you pick
- **Delete all data** — factory reset
- **Plugin system** — import, enable/disable, configure and remove external plugins (see the [plugin guide](#plugin-guide) below)
- **About panel** — version, authors and links to both repositories

## Screenshots

![Clock demo](docs/screenshots/clock-demo.png)

## Quick start

```bash
# Install dependencies
npm install

# Run from source
npm start

# Build a portable single-file executable
npm run pack

# Build both the unpacked directory and the portable executable
npm run dist
```

The output lands in `dist/` (`Digital Clock <version>.exe` is the portable build).

**Behind a slow network / in mainland China**, use a mirror and reuse the local Electron download:

```bash
rm -rf dist/win-unpacked   # always clear leftovers first — a stale folder can hang the build
NODE_OPTIONS= \
  ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
  ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/" \
  npm run pack -- -c.electronDist=node_modules/electron/dist
```

> ⚠️ The dev build (`npm start`) and the packaged build share the same data folder, `%APPDATA%/digital-clock/`. Running both at once makes them fight over `config.json` and the GPU cache — keep only one instance open while testing.

## Project structure

```
├── main.js              # Electron main process (windows, tray, alarms, plugins manager, IPC)
├── preload.js           # Context bridge (the only IPC surface the renderer can reach)
├── index.html           # Clock window
├── renderer.js          # Clock rendering, animation, real-time updates
├── styles.css           # Clock styles (animation, blur/scale, plugin info-bar slot)
├── plugin-host.js       # Plugin sandbox runtime shared by all three windows
├── settings.html        # Settings window
├── settings.js          # Settings logic, i18n, plugin panel
├── settings.css         # Settings styles
├── welcome.html/js/css  # First-run welcome window
├── alarm-editor.*       # Alarm editor window
├── lights-off.*         # Lights Off fullscreen window
├── examples/
│   └── sample-plugin/   # Bundled example plugin (all three hooks)
├── package.json         # Dependencies and build config
├── docs/screenshots/    # Screenshots
└── LICENSE              # MIT
```

## Where the data lives

Everything is under `%APPDATA%/digital-clock/`:

| Path | Contents |
|---|---|
| `config.json` | All preferences |
| `alarms.json` | Alarm list |
| `plugins.json` | Plugin enable state + plugin setting values |
| `plugins/<plugin-id>/` | Installed plugins |
| `plugins-data/<plugin-id>/data.json` | Per-plugin storage (only reachable through the plugin API) |

## Configuration

All preferences can be changed from the settings window; the table below maps each panel to the underlying keys in `config.json`.

| Panel | Settings (`config.json` keys) |
|---|---|
| **Mode** | `mode` (normal/education), `lightsOff`, `lightsOffDisplay` (clock/primary/all) |
| **Appearance** | `color`, `bgColor`, `fontFamily`, `fontSize`, `infoScale`, `autoColor`, `settingsFontSize` |
| **Animation** | `animType` (flip/scale/fade/flip-3d/none), `animFlipDir` (up/down), `animScaleDir` (shrink/grow), `animDuration`, `staggerDelay`, `staggerDirection`, `blurEnabled`, `blurDuration`, `blurStrength`, `scaleInEnabled`, `scaleInFactor` |
| **Time** | `showSeconds`, `showDate`, `showWeekday`, `datePosition`, `extraTimezones`, `hourFormat` (auto/24/12), `ampmCorner`, `timeOffsetMs`, `autoAdjustEnabled`, `autoAdjustIntervalSec`, `autoAdjustAmountMs`, `autoAdjustBaseMs`, `autoAdjustAnchor` |
| **Alarm** | `alarms.json`, plus `alarmSoundDuration`, `alarmFlash`, `alarmAutoShow`, `alarmAutoPassthrough`, `alarmAutoTop` |
| **Position** | `positionPreset`, `x`, `y`, `layerMode` (alwaysOnTop/normal) |
| **System** | `autoStart`, `silentStart`, `language` (zh/en), `passthrough` |
| **Plugins** | `plugins.json` — enable state and per-plugin setting values |
| **Data** | Export / import / delete everything |
| **About** | Version, authors, repository links |

---

# Plugin guide

Plugins extend Digital Clock without touching its source: add content to the Lights Off board, append text to the clock's info bar, or restyle the settings window — and ship their own settings UI.

## 1. What a plugin can and cannot do

**Runs sandboxed.** The plugin entry script is executed with `new Function('dc', code)` inside the target window. Those windows are `contextIsolation: true` with no Node integration, so a plugin **cannot** `require()` anything, touch the file system directly, load native modules, or reach Electron APIs. The only capabilities are the `dc` object described below.

**Three hooks, one plugin each.** A plugin declares which windows it wants to run in:

| Hook | Window | What it gives you |
|---|---|---|
| `clock.infoBar` | Clock window | A slot inside the info bar (next to date / weekday / timezone / alarm text). The window auto-resizes to fit your content, and the info bar stays visible while you have content even if date and weekday are off. |
| `lightsOff.background` | Lights Off fullscreen window | A full-screen, centred content layer on the board. It is click-through by default, so double-click / ESC still exits Lights Off. |
| `settings.theme` | Settings window | CSS custom properties and extra stylesheets for theming the settings UI. |

**Hooks decide *where* a plugin runs, permissions decide *what it may touch* there.** To edit what is inside a window, declare the matching UI permission too:

| Permission | Pairs with hook | What it allows |
|---|---|---|
| `ui.clock` | `clock.infoBar` | Edit any element in the clock window, overlay your own layer on the whole window |
| `ui.settings` | `settings.theme` | Edit any element in the settings window, overlay your own layer on the whole window |
| `ui.lightsOffBg` | `lightsOff.background` | Control the Lights Off board background (colour / gradient / image / opacity / blur) |

**Honest limits.** The `storage` permission is genuinely enforced (plugin data is written through the main process into a folder named after the plugin id). The `net` permission is declared and confirmed on first enable, but because plugin code shares the host page it could call `fetch` directly anyway — treat `net` as an intent declaration, not a hard block. UI permissions work the same way: what they buy you is a **sanctioned API + automatic rollback + user awareness**, not a wall. The exact boundaries:

- **You may change styles / text / attributes / classes, hide elements and append content; you may NOT delete host elements or change host behaviour** (dragging, double-click-to-exit Lights Off, alarms, saving settings…).
- A few elements are protected and refuse even `hide()`: the Lights Off exit / lock / settings buttons, plus the plugin list and the plugin nav item in Settings — so a broken plugin can never lock you out.
- Every change made through `dc.ui` is recorded and restored one by one when the plugin is disabled, unloaded, or its settings change.
- If a plugin does break the UI: **tray menu → "🛡️ Safe Mode (plugins off)"** disables every plugin and restarts, restoring the UI immediately (that menu is drawn by the main process, out of a plugin's reach). The host also enters safe mode automatically after repeated "renderer died during startup" events and shows a banner at the top of Settings → Plugins.
- Plugin CSS is global, so prefix your class names. Install only plugins you trust.

## 2. Folder layout

A plugin is a plain folder:

```
my-plugin/
├── plugin.json      # required — the manifest
├── index.js         # entry script (name configurable via "main")
├── style.css        # optional stylesheet (via "style")
└── settings.html    # optional self-drawn settings fragment (via "settingsView")
```

Assets (images, fonts, JSON) may live alongside them; reach them with `dc.assets.url('pic.png')`.

## 3. `plugin.json` reference

```jsonc
{
  "id": "com.example.weather",     // required, see the rules below
  "name": "Weather Strip",          // shown in the settings list
  "version": "1.0.0",
  "author": "Your Name",
  "description": "One line describing what it does",
  "homepage": "https://example.com/weather",
  "apiVersion": 1,
  "hooks": ["clock.infoBar"],
  "permissions": ["storage", "net"],
  "main": "index.js",
  "style": "style.css",
  "settingsView": "settings.html",
  "settings": [ /* see section 5 */ ]
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `id` | string | **yes** | `/^[a-z0-9][a-z0-9._-]{1,63}$/i`, lower-cased on load. Reverse-domain style is recommended. The installed folder is named after it, and plugin data is scoped to it. |
| `name` | string | no | ≤ 64 chars, defaults to `id` |
| `version` | string | no | ≤ 24 chars, defaults to `1.0.0` |
| `author` | string | no | ≤ 64 chars |
| `description` | string | no | ≤ 200 chars |
| `homepage` | string | no | must start with `https://`, otherwise dropped |
| `apiVersion` | number | no | defaults to `1`. The host currently supports **2** (UI permissions start at `2`). A value higher than the host supports is rejected with `api-too-new` |
| `hooks` | string[] | **yes** | at least one of the three hooks; unknown entries are dropped. No usable hook ⇒ rejected (`no-hooks`) |
| `permissions` | string[] | no | any of `storage`, `net`, `ui.clock`, `ui.settings`, `ui.lightsOffBg`; unknown entries are dropped. On first enable the host lists them all for confirmation |
| `main` | string | no | relative path inside the plugin folder, defaults to `index.js`; must exist |
| `style` | string | no | relative path to a CSS file; injected only into windows that host one of the plugin's hooks |
| `settingsView` | string | no | relative path to an HTML fragment; sanitised before it is inserted (section 7) |
| `settings` | object[] | no | up to 24 declarative setting fields (section 5) |

Everything else in the manifest is ignored — the host only reads the fields above.

## 4. The entry script and the `dc` API

`plugin.json` → `main` (default `index.js`) is executed once **per window** that hosts one of the plugin's hooks. Use `dc.hook` to branch:

```js
dc.mount(function (slot, dc) {
  if (dc.hook === 'clock.infoBar')      dc.clock.setInfoText(dc.settings.text);
  if (dc.hook === 'lightsOff.background') {
    dc.lightsOff.setText(dc.settings.text);
    slot.style.fontSize = dc.settings.size + 'px';
  }
  if (dc.hook === 'settings.theme')     dc.ui.applyVars({ '--plugin-accent': dc.settings.accent });

  return function cleanup() { /* optional: runs on disable, re-configure or unload */ };
});
```

### Common

| Member | Description |
|---|---|
| `dc.id` / `dc.name` / `dc.version` | Plugin identity |
| `dc.hook` | Which window this instance is running in |
| `dc.apiVersion` | Host API version (currently `2`). For UI permissions test `>= 2`, or feature-detect with `typeof dc.ui.get === 'function'` |
| `dc.settings` | Frozen object of the plugin's current setting values |
| `dc.theme()` | `{ isDark, fg, bg }` computed from what is actually painted — use it instead of hard-coding colours |
| `dc.mount(fn)` | Registers the mount callback. `fn(slot, dc)` receives the DOM slot; return a cleanup function if you need one |
| `dc.log(...)` | Prefixed `console.log`, handy while developing |
| `dc.on(name, cb)` / `dc.emit(name, payload)` | Local event bus for the plugin's own plumbing |

### `dc.clock` — `clock.infoBar` only

| Member | Description |
|---|---|
| `dc.clock.setInfoText(text)` | Sets the slot text (the host owns the element, so sizing, colour inheritance and window auto-resize all keep working) |
| `dc.clock.clearInfoText()` | Clears it (the empty slot collapses and stops taking space) |

### `dc.lightsOff` — `lightsOff.background` only

| Member | Description |
|---|---|
| `dc.lightsOff.root()` | The plugin's own layer element |
| `dc.lightsOff.setText(text)` | Writes text into it |
| `dc.lightsOff.setInteractive(true)` | Opts the layer into mouse events. Off by default — turning it on means that area no longer forwards the double-click that exits Lights Off |
| `dc.lightsOff.setBackground({ color, gradient, image, size, position, repeat, opacity, blur })` | **Requires `ui.lightsOffBg`**: sets the board background. `gradient` wins over `image`, `image` wins over `color`; `image` must be a `file://` asset inside your own plugin folder or an `https://` URL |
| `dc.lightsOff.clearBackground()` | **Requires `ui.lightsOffBg`**: back to transparent (the host colour shows through) |
| `dc.lightsOff.bgLayer()` | The background layer element itself, for fine-grained control (animation, stacking) |

The background layer sits **above** the host colour and **below** content and controls, so it can never cover the exit / settings / lock buttons. The host keeps broadcasting colour and day-night changes (`onLightsOffBgUpdate`) — listen and re-apply if you want the background to follow, ignore it to pin your own.

### `dc.ui` — editing the UI

**Theming (any window, no UI permission needed)**

| Member | Description |
|---|---|
| `dc.ui.addStyle(cssText)` | Appends a stylesheet for this window (removed on unload) |
| `dc.ui.applyVars({ '--name': value })` | Settings window only: sets CSS custom properties on `:root` (restored on unload). The settings UI already uses `--sfz` (base font size) and friends — overriding them re-themes the whole window |

**Editing (requires the UI permission of that window: `ui.clock` or `ui.settings`)**

| Member | Description |
|---|---|
| `dc.ui.layer()` | Your own drawing layer in this window: full-bleed, centred, click-through by default |
| `dc.ui.get(sel)` | A writable handle for a host element, or `null` if nothing matches |
| `dc.ui.hide(sel)` / `dc.ui.show(sel)` | Hide / restore. Protected elements throw |
| `dc.ui.setText(sel, text)` | Replace the text |
| `dc.ui.patch(sel, { style, class, attr })` | Bulk edit. `style` keys may be camelCase or kebab-case; `class` accepts a string / array (to add) or `{ add, remove }` |
| `dc.ui.push(sel, html)` | **Appends** a sanitised fragment inside the element (same allow-list as section 7) — never replaces existing content |
| `dc.ui.on(sel, type, cb)` | Binds an event. It calls `stopPropagation` for you (so you do not accidentally trigger host behaviour such as double-click-to-exit) and sets `no-drag` on the element (the clock window is one big drag region — without it, clicks will not land) |
| `dc.ui.nav({ id, label, icon })` | Adds a page of your own to the settings sidebar and **returns that page's content container** (see below). `id` must match `/^[a-z0-9][a-z0-9._-]{0,31}$/`, `label` ≤ 24 chars, `icon` a single emoji works best |

The handle returned by `dc.ui.get(sel)` exposes the same methods on the element and chains:

```js
dc.mount(function (slot, dc) {
  if (dc.hook !== 'clock.infoBar') return;
  const h = dc.ui.get('#time-display');
  if (!h) return;
  h.style('letterSpacing', '0.02em').cls('my-glow').attr('title', 'restyled by a plugin');
  h.on('click', () => dc.log('clicked'));
  dc.ui.get('#date-inline').hide();                    // hides the date — restored on unload
  dc.ui.push('#info-bar', '<span class="my-mark">·</span>');
});
```

`h.node()` is for **reading only** (measuring, computed styles); changes made through it are not rolled back.

### Giving yourself a page in Settings (`dc.ui.nav`)

When a plugin grows past a couple of rows, do not pile everything into its card — ask for a nav page of your own:

```js
dc.mount(function (slot, dc) {
  if (dc.hook !== 'settings.theme') return;
  const page = dc.ui.nav({ id: 'stats', label: 'Focus stats', icon: '📊' });
  if (!page) return;
  const p = document.createElement('p');
  p.textContent = '3 hours focused today';
  page.appendChild(p);
  dc.ui.push('.plugin-nav-body', '<button type="button" class="my-reset">Reset</button>');
  dc.ui.on('.my-reset', 'click', () => dc.storage.set('total', 0));
});
```

- The nav item is inserted right after "Plugins", uses the **same styling** as built-in items and carries a thin accent bar to mark it as a plugin page. Clicking it switches panels — no routing to write yourself.
- The returned container is a plain DOM element and you already hold the `ui.settings` permission, so you can fill it and bind events freely; the host also ships a default `.plugin-nav-body button` style.
- Limits: up to 3 nav pages per plugin, 5 across all plugins (going over throws `too-many-nav-pages`).
- The nav item and the whole page are removed when the plugin is disabled, unloaded or its settings change; if you were sitting on that page, the host falls back to the "Plugins" page automatically.
- **Do not add `data-lang`** to your nav label (that is how the host localises built-in items and it would be overwritten). To follow the language switch, observe `document.documentElement.lang` with a `MutationObserver`.

Hard rules:

- **Host elements cannot be removed**: there is no `remove()` and `push()` only appends.
- **Protected elements** (Lights Off exit / lock / settings buttons, the plugin list and plugin nav item in Settings) cannot be hidden, and `display:none` smuggled through `patch` is rejected too.
- The Lights Off window exposes no host-element editing at all — only the background path.
- `sel` is a plain CSS selector and the host simply acts on what it matches; keep your selectors precise.

### Permissions

| Member | Requires | Description |
|---|---|---|
| `dc.storage.get(key)` | `storage` | Read one value (or `undefined`) |
| `dc.storage.set(key, value)` | `storage` | Write one value (JSON, ≤ 256 KB total) |
| `dc.storage.all()` | `storage` | Read the whole object |
| `dc.fetchText(url, { timeout })` | `net` | `https` only, 8 s default timeout, response truncated to 200 000 chars |
| `dc.ui.get/hide/show/setText/patch/push/on/layer/nav` | `ui.clock` or `ui.settings` | Host-element editing for that window (see section 1); `nav()` only makes sense in the settings window |
| `dc.lightsOff.setBackground/clearBackground` | `ui.lightsOffBg` | The Lights Off board background |

Calling a permission-gated member without declaring the permission throws, and the error shows up on the plugin's card in the settings window.

### Assets

`dc.assets.base` is a `file://` URL for the plugin's own folder; `dc.assets.url('pic.png')` joins the two (works in the clock and Lights Off windows and in a sanitised `settingsView`).

## 5. Declarative settings

The host renders each entry below as a normal settings row, so plugin settings look identical to built-in ones:

```json
"settings": [
  { "key": "text",   "type": "text",   "label": "Text", "hint": "Shown in the info bar", "default": "Hello" },
  { "key": "size",   "type": "number", "label": "Lights Off size", "min": 12, "max": 200, "step": 2, "default": 48 },
  { "key": "accent", "type": "color",  "label": "Accent", "default": "#6C8CFF" },
  { "key": "bold",   "type": "toggle", "label": "Bold", "default": true },
  { "key": "pos",    "type": "select", "label": "Position", "default": "center",
    "options": [ { "value": "center", "label": "Center" }, { "value": "top", "label": "Top" } ] },
  { "key": "notes",  "type": "textarea", "label": "Notes", "default": "" }
]
```

| `type` | Rendered as | Extra fields |
|---|---|---|
| `text` | single-line input | — |
| `textarea` | 3-row textarea | — |
| `number` | number input + live value | `min` (0), `max` (100), `step` (1) |
| `slider` | range slider + live value | `min`, `max`, `step` |
| `select` | dropdown | `options: [{ value, label }]` (≤ 24) |
| `toggle` | the same switch used everywhere else | — |
| `color` | colour picker | — |

Rules enforced on load and on every save:

- `key` must match `/^[a-zA-Z0-9_-]{1,32}$/`, `label` ≤ 48 chars, `hint` ≤ 120 chars; up to 24 fields.
- An unknown `type` falls back to `text`. Invalid entries are dropped silently.
- Values are coerced by type: booleans for toggles, numbers clamped into `[min, max]`, `#rgb`–`#rrggbbaa` for colours (otherwise the default), one of the declared `options` for selects, and ≤ 4000 chars for text.
- Changing a setting writes it to `plugins.json` and **re-runs the plugin** (teardown → mount with fresh values). Read `dc.settings` inside `mount`, not at module level.
- The same `key` may appear in both the declarative list and your `settingsView`; declarative fields already persist for you, so use the view only when you need custom markup.

## 6. Hooks in practice

- **Info bar text** — keep it short: the clock window grows to fit the widest line (clock digits or info bar). `setInfoText` is the recommended path because the host owns the element and keeps colour inheritance (auto day/night, alarm flashing) intact.
- **Clock window content** (needs `ui.clock`) — for restyling the digits use `dc.ui.get('#time-display')`; to place a whole block of your own, use `dc.ui.layer()`. Do not touch `-webkit-app-region` on `#clock`, or the window stops being draggable.
- **Lights Off board** — this is the place for bigger content (a quote, the date in another calendar, a countdown). Remember the layer is click-through; if you need interaction, enable it explicitly and keep the interactive area small so users can still exit.
- **Lights Off background** (needs `ui.lightsOffBg`) — wallpapers, gradients, ambient glow. If `filter: blur()` on the whole layer also blurs your content, move the blur to a child element of the background layer, or use `opacity` with a translucent colour instead.
- **Settings theming** — inject variables rather than replacing whole stylesheets where possible; `--sfz` is the settings font size, so `calc()` on it keeps your styles in step with the user's choice. When editing host elements, **never hide the plugins panel** — it is the only way for a user to disable you, and it is protected.
- **A settings nav page** (needs `ui.settings`) — once a plugin grows, put it behind `dc.ui.nav()` instead of turning its card into a second settings window; 3 pages per plugin max.
- **In general** — every `dc.ui` call validates the permission and the protected list; a selector that matches nothing simply returns `false`. Protected elements and missing permissions, however, *throw*, and the message shows up on the plugin's error badge — watch that page while developing.

## 7. Self-drawn settings view (`settingsView`)

When a declarative form is not enough, point `settingsView` at an HTML **fragment** (no `<html>`/`<body>`). It is parsed and sanitised before insertion:

- **Removed entirely**: `script`, `style`, `iframe`, `object`, `embed`, `link`, `meta`, `form`
- **Unwrapped** (children kept, tag dropped): anything not in the allow-list below
- **Allowed tags**: `a b br button code details div em h3 h4 hr i img input label li ol option p pre section select small span strong summary table tbody td th thead tr ul`
- **Attributes**: only `class id title type value checked disabled placeholder min max step rows cols name href src alt width height role for selected data-key data-role data-plugin-field`. Everything else — including every `on*` handler — is removed
- `href` must be `https://`. `src` must be `https://` or a `file://` path **inside your plugin folder**. `style` keeps only safe declarations (`url()`, `expression()`, `@import` and `javascript:` are dropped)

Anything you place there is static markup: no scripts run, and event attributes never fire. For data you need persisted, prefer the declarative settings in section 5.

## 8. Building a `.dcplugin` package

A `.dcplugin` file is just a **zip archive**. Put `plugin.json` either at the archive root or inside a single top-level folder — both are accepted:

```
weather.dcplugin
├── plugin.json
├── index.js
└── style.css
```

Windows (PowerShell):

```powershell
# zip the *contents* of the folder, then rename to .dcplugin
Compress-Archive -Path .\my-plugin\* -DestinationPath .\my-plugin.zip -Force
Rename-Item .\my-plugin.zip my-plugin.dcplugin
```

macOS / Linux:

```bash
cd my-plugin && zip -r ../my-plugin.dcplugin . -x '.*'
```

Package rules enforced by the importer:

- Every entry must use a safe relative path. Entries containing `..`, absolute paths, or a drive letter are rejected (`bad-entry`) — a malicious archive cannot write outside the plugin folder.
- Per-file limit 8 MB, whole plugin limit 20 MB (`file-too-large` / `too-large`).
- Text files the host reads (entry script, stylesheet, settings view) are capped at 512 KB; the manifest at 256 KB.
- Folder import is also supported (Settings → Plugins → “Import folder…”), which is the fastest way to iterate during development — no zipping needed.

## 9. Installing and managing plugins

Settings → **Plugins**:

- **Import plugin…** — pick a `.dcplugin` / `.zip`; **Import folder…** — pick a folder containing `plugin.json`
- Imported plugins are enabled immediately. Re-importing an existing `id` asks before overwriting (existing setting values are kept)
- Each card shows name, version, author, id, hook and permission badges, plus an error badge when something goes wrong
- **Settings** expands the plugin's declarative form (and its `settingsView`, if any)
- **Reload** clears the recorded runtime error and re-runs the plugin; **Delete** removes the plugin folder *and* its stored data
- The enable switch confirms the requested permissions the first time you turn a plugin on; UI permissions additionally explain the risk and the escape hatch
- **Open plugins folder** reveals `%APPDATA%/digital-clock/plugins/`
- A **safe mode** banner appears at the top of the plugins panel if you entered safe mode from the tray — one click brings every plugin back

> **A plugin wrecked the UI — now what?** Right-click the tray icon → "🛡️ Safe Mode (plugins off)": all plugins are disabled and the app restarts, restoring the UI immediately (plugin files and settings stay intact). The host also enters safe mode automatically after repeated "renderer died during startup" events.

## 10. Example plugin

`examples/sample-plugin/` in this repository is a working plugin that uses all three hooks plus a declarative form and a self-drawn settings view. Import it with **Import folder…** and the info bar, the Lights Off board and the settings accent colour all change immediately. It is excluded from the packaged build on purpose — copy it somewhere else to hack on it.

## 11. Error cheat-sheet

| Message | Meaning |
|---|---|
| `Invalid plugin id` | `id` does not match the required pattern |
| `plugin.json is missing` | No manifest at the root (and no single nested folder containing one) |
| `Malformed plugin.json` | Not valid JSON, or not an object |
| `Entry file is missing` | `main` points at a file that does not exist |
| `No usable hooks declared` | `hooks` is empty or contains only unknown values |
| `Plugin needs a newer host API` | `apiVersion` is higher than this build supports |
| `Illegal path inside the package` / `A file inside the package is too large` | Zip-slip attempt or an oversized entry |
| `Plugin exceeds the size limit` | Total size over 20 MB |
| `This build cannot import archives` | `adm-zip` is missing from the build — unzip the plugin and use “Import folder…” |
| `permission-denied: storage` / `net` / `ui.*` | The API was used without declaring the permission |
| `only-https` | `dc.fetchText` was called with a non-https URL |
| Denied, missing permission: edit clock window content | `dc.ui.get/hide/patch…` used without `ui.clock` (same for `ui.settings`) |
| This element is protected and cannot be hidden or removed | Tried to hide the Lights Off exit / lock button, or the plugin list in Settings |
| This window does not allow host element editing | `dc.ui.get()` called in the Lights Off window — only `setBackground` is exposed there |
| `bad-image-url` | `dc.lightsOff.setBackground({ image })` pointed somewhere that is neither inside your plugin folder nor `https://` |

Runtime errors are caught per plugin, reported once, and displayed on the plugin's card — a broken plugin never takes the clock down with it.

## Tech stack

- **Electron** — desktop shell (main + preload + renderer, `contextIsolation` everywhere)
- **Vanilla JavaScript** — no framework, no build step
- **CSS custom properties** — animation durations, blur strength, scale ratio and plugin theming are all variables
- **IPC** — every privileged operation goes through `preload.js`; the renderer never sees `fs`
- **adm-zip** — safe `.dcplugin` extraction (entry-by-entry validation)
- **electron-builder** — portable single-file Windows packaging

## Repository

- **Gitee**: <https://gitee.com/Yejack819/AniClock-Desktop.git>
- **GitHub**: <https://github.com/Yejack819/AniClock-Desktop>

## License

MIT © 2026 Yejack819 · Built by DeepSeek & Yejack819
