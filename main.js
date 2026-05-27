const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const { execFile: execFileCb, execFileSync } = require('child_process');
const { promisify } = require('util');
const execFile = promisify(execFileCb);
const YTMusic = require('ytmusic-api').default || require('ytmusic-api');
function findYtDlp() {
  const paths = ['yt-dlp', '/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp'];
  for (const p of paths) {
    try { execFileSync('which', [p], { stdio: 'ignore' }); return p; } catch {}
  }
  return 'yt-dlp';
}
const YT_DLP = findYtDlp();

const QUALITY_FORMATS = {
  best:   'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
  high:   'bestaudio[ext=m4a][abr>128]/bestaudio[ext=m4a]/bestaudio[ext=webm]',
  medium: 'bestaudio',
  low:    'worstaudio[ext=m4a]/worstaudio',
};

let mainWindow;
let ytmusic;

function parseDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getBestThumbnail(thumbnails) {
  if (!thumbnails || thumbnails.length === 0) return '';
  const sorted = [...thumbnails].sort((a, b) => b.width - a.width);
  return sorted[0].url;
}

async function initYTMusic() {
  try {
    ytmusic = new YTMusic();
    await ytmusic.initialize();
    console.log('YTMusic API initialized');
  } catch (err) {
    console.error('YTMusic init error:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

ipcMain.handle('search-music', async (_event, query) => {
  try {
    if (!ytmusic) await initYTMusic();
    const results = await ytmusic.searchSongs(query);
    return (results || [])
      .filter(s => s.type === 'SONG' && s.videoId)
      .slice(0, 10)
      .map(s => ({
        videoId: s.videoId,
        title: s.name,
        artist: s.artist?.name || 'Unknown Artist',
        thumbnail: `https://i.ytimg.com/vi/${s.videoId}/hqdefault.jpg`,
        duration: parseDuration(s.duration || 0),
        durationSeconds: s.duration || 0,
      }));
  } catch (err) {
    console.error('Search error:', err);
    return [];
  }
});

ipcMain.handle('get-track-info', async (_event, videoId) => {
  try {
    const { stdout } = await execFile(YT_DLP, [
      '--dump-json', '--no-download', '--no-warnings', '--quiet',
      `https://www.youtube.com/watch?v=${videoId}`,
    ], { timeout: 10000 });
    const info = JSON.parse(stdout);
    return {
      videoId,
      title: info.title || 'Unknown Track',
      artist: info.artist || info.uploader || 'Unknown Artist',
      thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: parseDuration(parseInt(info.duration) || 0),
      durationSeconds: parseInt(info.duration) || 0,
    };
  } catch (err) {
    console.error('Track info error:', err.message);
    return {
      videoId,
      title: 'Unknown Track',
      artist: 'Unknown Artist',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: '--:--',
      durationSeconds: 0,
    };
  }
});

const audioUrlCache = new Map();

async function getAudioUrl(videoId, format) {
  const key = `${videoId}:${format}`;
  if (audioUrlCache.has(key)) return audioUrlCache.get(key);
  const { stdout } = await execFile(YT_DLP, [
    '-f', format, '--get-url', '--no-warnings', '--quiet',
    `https://www.youtube.com/watch?v=${videoId}`,
  ]);
  const url = stdout.trim();
  audioUrlCache.set(key, url);
  setTimeout(() => audioUrlCache.delete(key), 300000);
  return url;
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'yt-audio', privileges: { stream: true, bypassCSP: true } },
]);

app.whenReady().then(async () => {
  await initYTMusic();

  protocol.handle('yt-audio', async (request) => {
    const url = new URL(request.url);
    const videoId = url.hostname;
    const quality = url.searchParams.get('quality') || 'medium';
    const format = QUALITY_FORMATS[quality] || QUALITY_FORMATS.medium;

    try {
      const directUrl = await getAudioUrl(videoId, format);

      const reqHeaders = {};
      const range = request.headers.get('range');
      if (range) reqHeaders['Range'] = range;

      const response = await fetch(directUrl, { headers: reqHeaders });

      const respHeaders = new Headers();
      response.headers.forEach((v, k) => {
        if (['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition'].includes(k)) {
          respHeaders.set(k, v);
        }
      });

      return new Response(response.body, {
        status: response.status,
        headers: respHeaders,
      });
    } catch (err) {
      console.error(`yt-audio: error ${videoId}:`, err.message);
      return new Response(err.message, { status: 500 });
    }
  });

  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
