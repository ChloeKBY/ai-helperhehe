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
- ✅ Memory system (`src/memory/userMemory.json` + `memoryManager.js`)
- ✅ Personality prompt template (`src/ollama/personalityPrompt.txt`)
- ✅ Focus-watcher (cheap, low-frequency check of the focused app)
- ✅ Process control (close/block apps)

**Not yet built (next steps):**
- ⬜ PNG assets — `assets/pngtuber/*.png` are NOT included. You'll need to
  supply your own idle/thinking/stern/excited/disappointed images (the
  filenames are already wired up in `renderer.js`).
- ⬜ Screen-watching + vision analysis (needs a vision-capable local model
  like `llava-phi3` or `moondream` — not yet integrated)
- ⬜ Photo-verification unlock flow
- ⬜ Notion integration (tasks + calendar sync)
- ⬜ A real chat input UI (currently only testable via DevTools console:
  `window.sendToVivian("hello")`)
- ⬜ Wiring focusWatcher's flag callback to actually trigger processWatcher's
  blockApp — the pieces exist independently but aren't connected yet

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
