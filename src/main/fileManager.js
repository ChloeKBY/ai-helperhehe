/**
 * fileManager.js
 *
 * Handles moving, copying, and organizing files on your Mac.
 * All paths are resolved relative to your home directory unless an
 * absolute path is given, so "move X to Downloads" works without you
 * typing the full /Users/you/... path every time.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const HOME_DIR = os.homedir();

/** Resolves a path the user might type casually (e.g. "Desktop/thing.png"). */
function resolvePath(inputPath) {
  if (path.isAbsolute(inputPath)) return inputPath;
  return path.join(HOME_DIR, inputPath);
}

/** Moves a file from one location to another. Creates destination folders if needed. */
function moveFile(sourcePath, destPath) {
  const from = resolvePath(sourcePath);
  const to = resolvePath(destPath);

  if (!fs.existsSync(from)) {
    throw new Error(`Source file doesn't exist: ${from}`);
  }

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  return { from, to };
}

/** Copies a file, leaving the original in place. */
function copyFile(sourcePath, destPath) {
  const from = resolvePath(sourcePath);
  const to = resolvePath(destPath);

  if (!fs.existsSync(from)) {
    throw new Error(`Source file doesn't exist: ${from}`);
  }

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return { from, to };
}

/** Deletes a file. Destructive — callers should confirm with the user first. */
function deleteFile(targetPath) {
  const target = resolvePath(targetPath);
  if (!fs.existsSync(target)) {
    throw new Error(`File doesn't exist: ${target}`);
  }
  fs.unlinkSync(target);
  return { deleted: target };
}

/**
 * Organizes a folder by moving files into subfolders based on their
 * extension (e.g. Downloads/*.png -> Downloads/Images/*.png).
 * Returns a summary of what moved where.
 */
function organizeFolderByType(folderPath) {
  const folder = resolvePath(folderPath);
  if (!fs.existsSync(folder)) {
    throw new Error(`Folder doesn't exist: ${folder}`);
  }

  const categories = {
    Images: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"],
    Documents: [".pdf", ".doc", ".docx", ".txt", ".md"],
    Archives: [".zip", ".rar", ".7z", ".tar", ".gz"],
    Audio: [".mp3", ".wav", ".flac", ".m4a"],
    Video: [".mp4", ".mov", ".avi", ".mkv"]
  };

  const entries = fs.readdirSync(folder, { withFileTypes: true });
  const moved = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    const category = Object.keys(categories).find((cat) => categories[cat].includes(ext));
    if (!category) continue; // leave unrecognized file types where they are

    const destFolder = path.join(folder, category);
    fs.mkdirSync(destFolder, { recursive: true });

    const from = path.join(folder, entry.name);
    const to = path.join(destFolder, entry.name);

    // Don't overwrite an existing file with the same name
    if (fs.existsSync(to)) continue;

    fs.renameSync(from, to);
    moved.push({ file: entry.name, category });
  }

  return moved;
}

module.exports = { resolvePath, moveFile, copyFile, deleteFile, organizeFolderByType };
