const path = require('path');
const fs = require('fs-extra');
const ftp = require('basic-ftp');

const ASSETS_ROOT = path.join(__dirname, '../data/load-sessions/assets');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp']);

function isImageFile(name = '') {
  return IMAGE_EXTENSIONS.has(path.extname(String(name || '').toLowerCase()));
}

function toTimestamp(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isDirectory(entry) {
  if (!entry) return false;
  if (typeof entry.isDirectory === 'boolean') return entry.isDirectory;
  if (typeof entry.isDirectory === 'function') return entry.isDirectory();
  return entry.type === 2;
}

function isLocalHost(host = '') {
  const normalized = String(host || '').trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

function getSessionDir(summary) {
  return path.join(ASSETS_ROOT, summary.id);
}

function cleanRemotePath(remotePath = '') {
  return String(remotePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function getLocalMirrorCandidates(ftpConfig = {}) {
  const username = String(ftpConfig.username || '').trim();
  const remoteBase = cleanRemotePath(ftpConfig.remotePath || '');
  const remoteLeaf = remoteBase.split('/').filter(Boolean).pop();
  const candidates = [];

  if (ftpConfig.localRootPath) {
    candidates.push(String(ftpConfig.localRootPath).trim());
  }

  if (process.env.FTP_LOCAL_ROOT) {
    candidates.push(String(process.env.FTP_LOCAL_ROOT).trim());
  }

  if (isLocalHost(ftpConfig.host)) {
    if (remoteLeaf) {
      candidates.push(path.join('C:\\FTP_Root', remoteLeaf));
    }
    if (username) {
      candidates.push(path.join('C:\\FTP_Root', username));
    }
  }

  return [...new Set(candidates.filter(Boolean))];
}

async function listLocalImagesRecursive(baseDir, maxDepth = 6, currentDepth = 0) {
  if (currentDepth > maxDepth || !(await fs.pathExists(baseDir))) {
    return [];
  }

  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listLocalImagesRecursive(fullPath, maxDepth, currentDepth + 1)));
      continue;
    }

    if (!entry.isFile() || !isImageFile(entry.name)) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

async function saveMatchedFiles(summary, files) {
  const sessionDir = getSessionDir(summary);
  await fs.ensureDir(sessionDir);

  const images = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const localName = `${String(index + 1).padStart(2, '0')}_${path.basename(file.name)}`;
    const localPath = path.join(sessionDir, localName);

    if (file.copyFrom) {
      await fs.copy(file.copyFrom, localPath, { overwrite: true });
    } else if (file.remotePath && file.client) {
      await file.client.downloadTo(localPath, file.remotePath);
    }

    images.push({
      name: file.name,
      remotePath: file.remotePath || file.copyFrom,
      modifiedAt: file.modifiedAt ? new Date(file.modifiedAt).toISOString() : null,
      url: `/api/load-session/assets/${summary.id}/${encodeURIComponent(localName)}`,
    });
  }

  return images;
}

async function listRecursive(client, remoteDir, depth = 0) {
  if (depth > 3) return [];

  const entries = await client.list(remoteDir);
  const files = [];

  for (const entry of entries) {
    const remotePath = `${remoteDir.replace(/\/$/, '')}/${entry.name}`.replace(/^\/\//, '/');
    if (isDirectory(entry)) {
      const nested = await listRecursive(client, remotePath, depth + 1);
      files.push(...nested);
      continue;
    }
    files.push({
      ...entry,
      remotePath,
    });
  }

  return files;
}

async function captureImagesFromLocalMirror(summary, ftpConfig, startedAt, stoppedAt) {
  const candidates = getLocalMirrorCandidates(ftpConfig);

  for (const baseDir of candidates) {
    if (!(await fs.pathExists(baseDir))) {
      continue;
    }

    const matchedFiles = [];
    const imageFiles = await listLocalImagesRecursive(baseDir);
    for (const fullPath of imageFiles) {
      const stats = await fs.stat(fullPath);
      const modifiedAt = stats.mtime instanceof Date ? stats.mtime.getTime() : null;
      if (!modifiedAt || modifiedAt < startedAt || modifiedAt > stoppedAt) {
        continue;
      }

      matchedFiles.push({
        name: path.basename(fullPath),
        copyFrom: fullPath,
        modifiedAt: stats.mtime,
      });
    }

    matchedFiles.sort((left, right) => new Date(left.modifiedAt).getTime() - new Date(right.modifiedAt).getTime());

    const images = await saveMatchedFiles(summary, matchedFiles);
    return {
      images,
      ftpCapture: {
        ok: true,
        message: images.length
          ? `Pobrano ${images.length} zdjęć z lokalnego katalogu FTP`
          : `Brak nowych zdjęć w lokalnym katalogu FTP (${baseDir})`,
      },
      usedLocalMirror: true,
      baseDir,
    };
  }

  return null;
}

async function captureImagesForSummary(summary, ftpConfig = {}) {
  const host = String(ftpConfig.host || '').trim();
  const port = Number(ftpConfig.port) || 21;
  const username = String(ftpConfig.username || 'anonymous');
  const password = String(ftpConfig.password || 'guest');
  const remotePath = String(ftpConfig.remotePath || '/').trim() || '/';

  if (!host) {
    return { images: [], ftpCapture: { ok: false, message: 'Brak hosta FTP' } };
  }

  const startedAt = toTimestamp(summary?.startedAt);
  const stoppedAt = toTimestamp(summary?.stoppedAt);
  if (!startedAt || !stoppedAt) {
    return { images: [], ftpCapture: { ok: false, message: 'Brak okna czasowego sesji' } };
  }

  const localMirrorResult = await captureImagesFromLocalMirror(summary, ftpConfig, startedAt, stoppedAt);
  if (localMirrorResult) {
    return localMirrorResult;
  }

  const client = new ftp.Client(5000);
  client.ftp.verbose = false;

  try {
    await client.access({
      host,
      port,
      user: username,
      password,
      secure: false,
    });

    const listed = await listRecursive(client, remotePath);
    const matches = listed.filter((entry) => {
      if (!isImageFile(entry.name)) return false;
      const modifiedAt = entry.modifiedAt instanceof Date ? entry.modifiedAt.getTime() : null;
      if (!modifiedAt) return false;
      return modifiedAt >= startedAt && modifiedAt <= stoppedAt;
    });

    if (matches.length === 0) {
      return { images: [], ftpCapture: { ok: true, message: 'Brak nowych zdjęć dla sesji' } };
    }

    const images = await saveMatchedFiles(summary, matches.map((file) => ({
      ...file,
      client,
    })));

    return {
      images,
      ftpCapture: {
        ok: true,
        message: `Pobrano ${images.length} zdjęć z FTP`,
      },
    };
  } catch (error) {
    return {
      images: [],
      ftpCapture: {
        ok: false,
        message: error.message,
      },
    };
  } finally {
    client.close();
  }
}

module.exports = {
  ASSETS_ROOT,
  captureImagesForSummary,
};
