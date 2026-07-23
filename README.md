# Evie — Personal PNGtuber AI Companion

A macOS Electron app: a transparent, always-on-top PNGtuber character that
chats using a **local** LLM (via Ollama) instead of a paid API, so it costs
nothing to run.

## Editing what Evie knows about you

**Just fill in ONE file: `src/memory/personalFacts.json`.** This is the
simple fill-in-the-blank profile — name, location, timezone, goals,
projects, aesthetic, interests, social. Delete fields you don't want, add
lines to the arrays, or leave things blank. It's gitignored (not tracked
by git) since it holds real personal details —
`personalFacts.example.json` is the tracked template showing the schema
if you ever need to see it fresh.

`src/memory/userMemory.json` still exists for one thing only:
`ntfy_topic` (optional phone notifications — see below). Timezone now
lives in `personalFacts.json` instead, so if you set it in the old
`userMemory.json` file, move it over: add a `"timezone": "America/Moncton"`
line inside `personalFacts.json`'s `memory` object.

Everything gets merged into her system prompt automatically — no restart
needed, read fresh on every message.

## Chat history (now separate sessions)

Each conversation is now its own file under `src/memory/chatSessions/`
(gitignored — private conversations). Hitting **"New"** starts a fresh
session WITHOUT deleting the old one — all past sessions stay saved on
disk permanently. There's no in-app session browser yet (just the current
one loads when you open the app) — if you want a way to actually browse
and reopen old sessions from within the UI, let me know and I'll add a
picker.

## File management & reminders

You can type these directly into the chat with fairly natural phrasing —
several variations are recognized, not just one exact wording:

- **Reminders:** "remind me to drink water in 10 minutes", "remind me to
  stretch every 30 minutes"
- **Moving files** — any of these work: "move X to Y", "move X from
  Downloads to Desktop", "put X on my Desktop", "send X to Y", "grab X
  from Downloads and put it on my Desktop"
- **Organizing a folder:** "organize Downloads", "clean up Downloads",
  "sort Downloads" — sorts files into Images/Documents/Archives/Audio/Video
  subfolders by extension

This works via pattern-matching in `src/main/commandParser.js` — broader
than a single regex now, but still not full language understanding. If a
phrasing doesn't match, try rephrasing closer to the examples, or ask me
to add more patterns.

## New commands (this round)

All typed directly into chat — she acts on these instead of just talking
about them:

- **Quit an app:** "quit Spotify", "close Discord"
- **Close/move the frontmost window:** "close this window", "move the
  window to top-left" (also: top-right, bottom-left, bottom-right, center)
- **Dock:** "show the dock", "hide the dock"
- **Open a folder in Finder:** "open the Downloads folder", "open folder
  Screenshots"
- **Find a folder you don't know the path to:** "find [name] in finder"
  (uses Spotlight, then reveals it in Finder)
- **Google something:** "google best pizza near me", "search for cat facts"
- **Open specific sites in Firefox:** "open wikipedia", "open pinterest",
  "open the wikipedia page about octopuses" — known sites are listed in
  `src/main/webTools.js` (`KNOWN_SITES`), easy to add more
- **Time/date (now actually correct):** "what time is it", "what day is
  it" — reads your real timezone from `userMemory.json` instead of guessing
- **Phone notifications (optional):** set `ntfy_topic` in `userMemory.json`
  to any unique word (e.g. "evie-chloe-4821"), then install the free
  **ntfy** app on your phone and subscribe to that same topic name — her
  reminders will now also push to your phone. No account or API key needed.
  Leave it as the placeholder to skip this entirely.

## Requirements

- macOS
- Node.js + npm
- [Ollama](https://ollama.com) installed
- A pulled model: `ollama pull gemma3:4b` — this ONE model now handles both chat and screen-watching vision, no separate vision model needed
- `cliclick` for the mouse-drag intervention: `brew install cliclick`

## Setup

```bash
npm install
ollama pull gemma3:4b
npm start
```

Ollama should be running in the background (the Ollama app, or `ollama serve`
in a terminal) before you launch Evie.

To keep RAM usage low, the model unloads itself after 5 minutes of no use:

```bash
launchctl setenv OLLAMA_KEEP_ALIVE 5m
```

## Current status

**Built so far:**
- ✅ Transparent, frameless, always-on-top Electron window
- ✅ Secure preload bridge (contextIsolation, no Node access in renderer)
- ✅ Local model chat via Ollama, streaming token-by-token
- ✅ Real chat input bar (text box + Enter/Send) in the PNGtuber window
- ✅ Memory system (`src/memory/userMemory.json` + `memoryManager.js`)
- ✅ Personality prompt template (`src/ollama/personalityPrompt.txt`)
- ✅ Focus-watcher (cheap, low-frequency check of the focused app)
- ✅ Screen-watcher: takes ONE screenshot + asks a local vision model
  ("focused" vs "distracted") only when focus-watcher flags a watched app
  has been open past the threshold — not continuous polling
- ✅ Process control (close/block apps) wired to the productivity rule:
  watched site keyword focused past threshold AND flagged "distracted" →
  app closes, mouse cursor drags to the corner (playful nudge), and the
  app is blocked from reopening for 2hrs, with a message shown in the
  chat bubble
- ✅ `.gitignore` (node_modules, .env, etc. excluded from commits)

**⚠️ Currently set to a 5-minute TEST threshold** (`FOCUS_THRESHOLD_MS` in
`src/main/main.js`) instead of the real 1-hour default — change this back
before relying on it day-to-day, or it'll trigger way too fast.

**Sprite assets:** now using the real Evie character set (art by
@Blob_the_Alien) instead of a placeholder — `idle` (neutral), `confused`,
`dumbfounded`, `happy`, `surprised`, `uncomfortable`, `upset`. Mapped as:
confused while waiting on a reply, happy on success, uncomfortable on
error, upset during a productivity intervention, idle otherwise.

**Not yet built (next steps):**
- ⬜ Photo-verification chore-checking flow (e.g. "has laundry been folded")
  — deferred in favor of screen-watching, may revisit later
- ⬜ Notion integration (tasks + calendar sync)
- ✅ Chat and screen-watching now share one model (`gemma3:4b`) instead of
  two separate ones — simpler, less RAM juggling

## Screen-watching setup & troubleshooting

Uses the same `gemma3:4b` model as chat now — no separate pull needed if
you've already done the setup step above.


Also grant **Screen Recording** permission in System Settings > Privacy &
Security the first time it runs.

**How it currently works** (`src/main/screenWatcher.js`):
- Every 8 seconds, takes a screenshot and asks Moondream a yes/no question
  (`TARGET_SITE_QUESTION` at the top of the file — currently asking about
  character.ai)
- If "yes" for 30+ seconds straight, triggers the intervention: mouse
  drags to the corner, and `TARGET_BROWSER` (default `"Firefox"`) gets
  closed + blocked from reopening for a while

**On switching to Orion:** the vision-model detection itself works exactly
the same regardless of browser — it's just looking at pixels on your
screen, not reading browser-specific data, so Orion vs Firefox makes zero
difference to whether it CATCHES you. What you'd need to change is
`TARGET_BROWSER` in `screenWatcher.js` (and the same app name in
`firefoxBlocker.js`, which right now is hardcoded to Firefox specifically)
so the close/block action actually targets Orion instead.

**On your Screen Time / private-window concern:** these are two separate
systems worth not conflating. Our own detection (above) doesn't touch
macOS Screen Time at all — it's independent, screenshot-based. As for
Apple's own Screen Time app itself: I'm not fully certain how it handles
private windows in WebKit-based browsers like Orion — this is the kind of
platform-specific detail that can change between macOS versions and isn't
something I want to state with false confidence. If it matters to you,
worth testing directly (browse privately in Orion, then check Screen
Time's per-site breakdown afterward) rather than relying on my guess.

## Old screen-watching notes (superseded by the above)

  title, so partial matches work (e.g. "c.ai" catches most c.ai tab titles)

## Notes on design decisions

- **No Claude API / no paid calls anywhere.** Everything routes through
  Ollama on localhost. If you ever want to swap in a cloud model later,
  only `src/ollama/ollamaClient.js` needs to change — everything else
  (memory, IPC, UI) is model-agnostic.
- **`userMemory.json` currently has a placeholder fact only** — replace it
  with real facts about yourself via `memoryManager.update()` or by editing
  the file directly. Nothing personal has been hardcoded into this repo.
- Screen-watching was intentionally deferred rather than half-built, since
  it's the heaviest and most privacy-sensitive piece — worth designing
  carefully (see focusWatcher.js comments for the "cheap filter first"
  approach planned for it).
