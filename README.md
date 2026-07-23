# Evie — Personal PNGtuber AI Companion

A macOS Electron app: a transparent, always-on-top PNGtuber character that
chats using a **local** LLM (via Ollama) instead of a paid API, so it costs
nothing to run.

## Editing what Evie knows about you

There are now TWO memory files, both feeding into her prompt:

1. **`src/memory/personalFacts.json`** — a structured profile (name,
   location, goals, projects, aesthetic, interests, social). This file is
   gitignored (not tracked by git) since it holds real personal details —
   `personalFacts.example.json` is the tracked template showing the schema.
   Edit the real `personalFacts.json` directly; it's already filled in
   with what you gave me.
2. **`src/memory/userMemory.json`** — the flat key/value list from before
   (timezone, etc.) for anything that doesn't fit the structured profile.

Both get merged into her system prompt automatically — no restart needed,
they're read fresh on every message.

## Chat history (now persistent)

Conversation history now survives app restarts — it's saved to
`src/memory/chatHistory.json` (gitignored, since it's your private
conversations) after every exchange. It loads automatically when the app
starts, so clicking her shows your full past conversation, not a blank
slate. Hit **"New"** to permanently clear it and start fresh.

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

## Requirements

- macOS
- Node.js + npm
- [Ollama](https://ollama.com) installed
- A pulled model: `ollama pull phi3:mini` (or `gemma2:2b` for something even lighter)
- `cliclick` for the mouse-drag intervention: `brew install cliclick`

## Setup

```bash
npm install
ollama pull phi3:mini
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
- ⬜ Vision model not yet pulled — run `ollama pull moondream` before
  screen-watching will work (see Requirements below)

## Screen-watching setup

```bash
ollama pull moondream
```

Then in **System Settings > Privacy & Security > Screen Recording**, grant
permission to your terminal/Electron app the first time it runs — macOS
will prompt automatically.

**Current rule** (edit constants at the top of `src/main/main.js`):
- Watches: the browser app (`WATCHED_APP`, default "Firefox") — but only
  triggers when specific SITE keywords appear in the window's title
  (`WATCHED_TITLE_KEYWORDS`, default `["character.ai", "c.ai"]`), not just
  for having the browser open. Studying on Firefox with a different tab
  title won't trigger anything.
- Works with private/incognito windows — the page title still shows in
  the title bar regardless of browsing mode.
- Threshold: 1 hour with a watched keyword in the title before a check-in
  (`FOCUS_THRESHOLD_MS`)
- If the vision model says "distracted": closes Firefox and blocks it
  from reopening for 2 hours (`BLOCK_DURATION_MS`)
- Add more sites by adding keywords to `WATCHED_TITLE_KEYWORDS` — matching
  is case-insensitive and checks if the keyword appears anywhere in the
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
