# Vivian — Personal PNGtuber AI Companion

A macOS Electron app: a transparent, always-on-top PNGtuber character that
chats using a **local** LLM (via Ollama) instead of a paid API, so it costs
nothing to run.

## Editing what Vivian knows about you

Everything she "knows" lives in one plain file:
**`src/memory/userMemory.json`**

It's just a list of key/value facts:
```json
{
  "facts": [
    { "key": "timezone", "value": "America/Moncton" },
    { "key": "workout_routine", "value": "Bourne-style bodyweight circuit, 3x/week" }
  ]
}
```

To add or change something (like your timezone), just edit that file directly
and save — every fact in there gets injected into her system prompt on every
message, so she'll know it on the next thing you ask her. No restart needed
for JSON edits, since it's read fresh each time you send a message.

## File management & reminders (new)

You can just type these directly into the chat and she'll actually do them
(not just talk about doing them):

- **"remind me to drink water in 10 minutes"** → sets a one-off timer, shows
  a native macOS notification when it fires
- **"remind me to stretch every 30 minutes"** → repeating reminder, fires
  forever until you restart the app
- **"move screenshot.png to Desktop"** → moves a file (paths are relative to
  your home folder unless you give a full path)
- **"organize Downloads"** / **"clean up Downloads"** → sorts files in that
  folder into subfolders (Images, Documents, Archives, Audio, Video) by
  file extension

This works via simple pattern-matching in `src/main/commandParser.js` —
it checks your message against a few regexes BEFORE sending anything to
the LLM. If nothing matches, your message goes to Vivian normally. This is
intentionally simple (not full NLU) — if a phrasing doesn't match, rephrase
it closer to the examples above, or ask me to expand the patterns.

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
