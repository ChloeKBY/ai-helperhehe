# Vivian — Personal PNGtuber AI Companion

A macOS Electron app: a transparent, always-on-top PNGtuber character that
chats using a **local** LLM (via Ollama) instead of a paid API, so it costs
nothing to run.

## Requirements

- macOS
- Node.js + npm
- [Ollama](https://ollama.com) installed
- A pulled model: `ollama pull phi3:mini` (or `gemma2:2b` for something even lighter)

## Setup

```bash
npm install
ollama pull phi3:mini
npm start
```

Ollama should be running in the background (the Ollama app, or `ollama serve`
in a terminal) before you launch Vivian.

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
  watched app open > 1hr AND flagged "distracted" → app closes and is
  blocked from reopening for 2hrs, with a message shown in the chat bubble
- ✅ `.gitignore` (node_modules, .env, etc. excluded from commits)

**Not yet built (next steps):**
- ⬜ PNG assets — using an idle.png placeholder only for now. thinking/
  stern/excited/disappointed states will fall back to idle until added.
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
- Watches: Firefox (add more app names to `WATCHED_APPS`)
- Threshold: 1 hour focused before a check-in (`FOCUS_THRESHOLD_MS`)
- If the vision model says "distracted": closes the app and blocks it
  from reopening for 2 hours (`BLOCK_DURATION_MS`)

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
