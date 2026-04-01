import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { URLSearchParams } from 'url';
import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);
import path from 'path';
import AdmZip from 'adm-zip';
import multer from 'multer';
import WebTorrent from 'webtorrent';
import parseTorrent from 'parse-torrent';
import { launchBrowser, closeBrowser, saveCookies } from './scraper/browser';
import { translateText } from './utils/translate';
import { startScraper, stopScraper, getStatus, submitCaptcha, updateGame, retryFailedGame, retryAllFailedGames, rebuildAll } from './scraper/worker';
import { initDb, getDb, closeDb } from './db/sqlite';
import { loginToRutracker } from './scraper/auth';
import {
  getAdbDevices,
  getInstalledApps,
  getStorageInfo,
  installApp,
  uninstallApp,
  pushObb,
  getApkPackageName,
  checkAdbPath
} from './utils/adb';
import { Bonjour } from 'bonjour-service';
import mdns from 'multicast-dns';
import os from 'os';

const getAllLocalIps = () => {
  const nets = os.networkInterfaces();
  const results: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results.length > 0 ? results : ['127.0.0.1'];
};

const mDNS = mdns();
const localIps = getAllLocalIps();

mDNS.on('query', (query: any) => {
  try {
    if (query?.questions && query.questions.some((q: any) => q.name === 'vrrookie.local')) {
      const records = localIps.map(ip => ({ name: 'vrrookie.local', type: 'A' as const, data: ip }));
      mDNS.respond(records);
      // console.log(`[mDNS] Responding for vrrookie.local with ${localIps.join(', ')}`);
    }
  } catch (err) {
    console.error('[mDNS] Response Error:', err);
  }
});

mDNS.on('error', (err) => {
  console.error('[mDNS] Native Error:', err.message);
});

const bj = new Bonjour();
bj.publish({ name: 'VR Rookie Downloader', type: 'http', port: 80 });

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

export { io };
app.use(cors());
app.use(express.json());

// --- Inventory & Global Config ---
const getUserDataDir = (): string => {
  if (process.platform === 'win32') {
    return path.join(os.homedir(), 'Documents', 'VRRookieDownloader');
  }
  return path.join(os.homedir(), '.local', 'share', 'VRRookieDownloader');
};
export const USER_DATA_DIR = getUserDataDir();
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}
export const DEFAULT_GAMES_DIR = path.join(USER_DATA_DIR, 'games');
if (!fs.existsSync(DEFAULT_GAMES_DIR)) {
  fs.mkdirSync(DEFAULT_GAMES_DIR, { recursive: true });
}
const CONFIG_FILE = path.join(USER_DATA_DIR, 'config.json');

function loadSettings() {
  const defaults = { 
    downloadPath: DEFAULT_GAMES_DIR, 
    translationLanguage: 'en',
    interfaceLanguage: 'en',
    offlineMode: false,
    start: true,
    blacklist: [
      "https://rutracker.me/forum/viewtopic.php?t=6620720",
      "https://rutracker.me/forum/viewtopic.php?t=6449026",
      "https://rutracker.me/forum/viewtopic.php?t=4718267",
      "https://rutracker.me/forum/viewtopic.php?t=6676369",
      "https://rutracker.me/forum/viewtopic.php?t=6287745",
      "https://rutracker.me/forum/viewtopic.php?t=6422377",
      "https://rutracker.me/forum/viewtopic.php?t=6422377",
      "https://rutracker.me/forum/viewtopic.php?t=6683851"
    ]
  };

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return { ...defaults, ...saved };
    } catch { 
      return defaults; 
    }
  }
  return defaults;
}

function saveSettings(settings: any) {
  const current = loadSettings();
  const updated = { ...current, ...settings };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
}

let settings = loadSettings();
let globalDownloadPath = settings.downloadPath;
let globalTranslationLanguage = settings.translationLanguage;
let globalInterfaceLanguage = settings.interfaceLanguage;
let globalOfflineMode = settings.offlineMode;
let globalStart = settings.start;
let globalBlacklist = settings.blacklist || [];

export function getTranslationLanguage() {
  return globalTranslationLanguage;
}
const wt = new WebTorrent();

function getInventoryPath(dir: string) {
  if (!dir) return '';
  return path.join(dir, '.index.json');
}

function getInventory(dir: string) {
  if (!dir) return { downloads: {} };
  const p = getInventoryPath(dir);
  if (!p || !fs.existsSync(p)) return { downloads: {} };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return { downloads: {} }; }
}

function updateInventory(dir: string, data: any) {
  if (!dir || !fs.existsSync(dir)) return;
  const p = getInventoryPath(dir);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function generateFileTree(dir: string, baseDir: string = ''): any[] {
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    let results: any[] = [];
    for (const item of items) {
      const resPath = path.join(dir, item.name);
      const relPath = path.join(baseDir, item.name);
      if (item.isDirectory()) {
        results = results.concat(generateFileTree(resPath, relPath));
      } else {
        const stat = fs.statSync(resPath);
        results.push({ name: item.name, size: stat.size, path: relPath });
      }
    }
    return results;
  } catch { return []; }
}

// Background Monitor (updates .index.json from qBitTorrent status)
setInterval(async () => {
  const targetDir = globalDownloadPath || '';
  if (!targetDir || !fs.existsSync(targetDir)) return;
  
  const inventory = getInventory(targetDir);
  let changed = false;

  // Sync with disk: ONLY remove 'concluido' items if their folder was deleted by the user.
  // 'predownload' and 'download' items must NEVER be deleted by disk check
  // because qBit may still be allocating space or the folder doesn't exist yet.
  for (const hash in inventory.downloads) {
    const item = inventory.downloads[hash];
    if (item.status !== 'concluido') continue; // Only cleanup completed items
    const realFolderName = item.folderName || '';
    if (!realFolderName) continue;
    const fullPath = path.join(targetDir, realFolderName);
    if (!fs.existsSync(fullPath)) {
      delete inventory.downloads[hash];
      changed = true;
      console.log(`[Sync] Removido do índice (pasta excluída pelo usuário): ${realFolderName}`);
    }
  }

  const activeHashes = Object.keys(inventory.downloads || {}).filter(h => inventory.downloads[h].status === 'download');
  
  if (activeHashes.length > 0) {
    try {
      if (!qbitCookie) await loginQbit();
      const res = await axios.get('http://localhost:8080/api/v2/torrents/info', {
        headers: { 'Cookie': qbitCookie },
        timeout: 1500
      });
      const torrentsList = res.data;
      
      for (const hash of activeHashes) {
        const item = inventory.downloads[hash];
        const qbTorrent = torrentsList.find((t: any) => t.hash.toLowerCase() === hash.toLowerCase());
        
        if (qbTorrent) {
          const progress = parseFloat((qbTorrent.progress * 100).toFixed(1));
          
          // Sincroniza nome se estiver pendente (timeout recovery)
          if ((item.folderName === 'Sincronizando...' || item.folderName === 'Obtendo metadados...') && qbTorrent.name) {
            item.folderName = qbTorrent.name;
            changed = true;
          }

          // Se a árvore de arquivos estiver vazia, tenta buscar do qBit
          if ((!item.fileTree || item.fileTree.length === 0) && qbTorrent.state !== 'metaDL' && qbTorrent.state !== 'allocating') {
            try {
              const filesRes = await axios.get(`http://localhost:8080/api/v2/torrents/files?hash=${hash}`, {
                headers: { 'Cookie': qbitCookie }
              });
              if (filesRes.data && filesRes.data.length > 0) {
                item.fileTree = filesRes.data.map((f: any) => ({
                  name: path.basename(f.name),
                  size: f.size,
                  path: f.name
                }));
                changed = true;
                console.log(`[Sync] Árvore de arquivos recuperada via qBit para: ${item.folderName}`);
              }
            } catch (e) { /* falha silenciosa */ }
          }

          if (progress !== item.progress) {
            item.progress = progress;
            changed = true;
          }

          if (progress >= 100) {
            item.status = 'concluido';
            item.progress = 100;
            const fullPath = path.join(targetDir, item.folderName);
            if (fs.existsSync(fullPath)) {
               item.fileTree = generateFileTree(fullPath);
            }
            changed = true;
            console.log(`[Sync] Download concluído e indexado: ${item.folderName}`);
          }
        }
      }
    } catch (e) {}
  }

  if (changed) {
    updateInventory(globalDownloadPath, inventory);
    io.emit('torrent_status_update', { source: 'monitor' });
  }
}, 3000);

// --- Session ---
app.get('/api/session/status', async (req, res) => {
  try {
    const db = getDb();
    const session = await db.get('SELECT id FROM session WHERE id = 1');
    res.json({ valid: !!session });
  } catch(e) {
    res.json({ valid: false });
  }
});

app.get('/api/session/validate', async (req, res) => {
  // Opens non-headless browser to let user authenticate on Rutracker
  try {
    const browser = await launchBrowser(false); // non-headless
    const page = await browser.newPage();
    await page.goto('https://rutracker.me/forum/login.php', { waitUntil: 'domcontentloaded' });
    console.log('[Auth] Opening browser window for manual login. Waiting for user...');
    
    // We wait for the user to login manually. They will be redirected to profile or index
    let loggedIn = false;
    for (let i = 0; i < 180; i++) { // Increase wait to 3 minutes
      if (page.isClosed()) {
        console.log('[Auth] Browser window closed by user.');
        break;
      }
      const url = page.url();
      const content = await page.content().catch(() => '');
      
      // Detection of success: URL changed or logout link visible
      if (!url.includes('login.php') && (content.includes('logout') || content.includes('Выход') || content.includes('profile.php'))) {
        console.log('[Auth] Manual login detected! Saving cookies.');
        await saveCookies(page);
        loggedIn = true;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    
    if (loggedIn) {
      await closeBrowser();
      res.json({ success: true, message: 'Login successful' });
      return;
    }
    
    await closeBrowser();
    res.json({ success: false, message: 'Login timeout or failed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Background Auth Route */
app.post('/api/auth/login', async (req, res) => {
  const { username, password, captchaCode, captchaSid, captchaField } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and Password required' });
  console.log(`[API] Login request for: ${username} (Has Captcha: ${!!captchaCode})`);

  try {
    const result = await loginToRutracker(username, password, captchaCode, captchaSid, captchaField);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Games ---
app.get('/api/games', async (req, res) => {
  const db = getDb();
  const { type, q, page = '1', limit = '20', sort = 'time', genre, developer } = req.query;
  const p = parseInt(page as string);
  const l = parseInt(limit as string);
  const offset = (p - 1) * l;
  
  const pathQuery = req.query.path as string;
  if (pathQuery) globalDownloadPath = pathQuery; // Update global path for monitor
  
  const inventory = getInventory(pathQuery || globalDownloadPath || '');
  const invEntries = Object.values(inventory.downloads || {}) as any[];
  const indexedIds = Array.from(new Set(invEntries.map(e => e.gameId))).filter(id => id > 0);

  let baseQuery = 'FROM games WHERE 1 = 1';
  let params: any[] = [];
  
  if (type === 'baixados') {
    if (indexedIds.length > 0) {
      const placeholders = indexedIds.map(() => '?').join(',');
      baseQuery += ` AND id IN (${placeholders})`;
      params.push(...indexedIds);
    } else {
      // Se não houver nada indexado, forçamos retorno vazio
      baseQuery += ' AND 1 = 0';
    }
  } else if (type === 'wishlist') {
    baseQuery += ' AND wishlist = 1';
  } else if (type) {
    baseQuery += ' AND tags LIKE ?';
    params.push(`%${type}%`);
  }

  if (q) {
    baseQuery += ' AND (title LIKE ? OR description LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  
  if (genre) {
    baseQuery += ' AND genre LIKE ?';
    params.push(`%${genre}%`);
  }

  if (developer) {
    baseQuery += ' AND developer = ?';
    params.push(developer);
  }

  if (globalBlacklist && globalBlacklist.length > 0) {
    const placeholders = globalBlacklist.map(() => '?').join(',');
    baseQuery += ` AND post_url NOT IN (${placeholders})`;
    params.push(...globalBlacklist);
  }

  let orderBy = 'created_at DESC';
  if (sort === 'alpha') orderBy = "CASE WHEN title LIKE '[%]%' THEN LTRIM(SUBSTR(title, INSTR(title, ']') + 1)) ELSE title END COLLATE NOCASE ASC";
  if (sort === 'seeds') orderBy = 'seeds DESC';
  if (sort === 'leeches') orderBy = 'leeches DESC';

  const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
  const dataQuery = `SELECT * ${baseQuery} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
  
  const totalRes = await db.get(countQuery, params);
  const games = await db.all(dataQuery, [...params, l, offset]);
  
  let activeTorrents: any[] = [];
  try {
    if (!qbitCookie) await loginQbit();
    const torrentRes = await axios.get('http://localhost:8080/api/v2/torrents/info', {
      headers: { 'Cookie': qbitCookie },
      timeout: 2000
    });
    activeTorrents = torrentRes.data;
  } catch (e) {}

  let gamesWithStatus = games.map((game: any) => {
    let isLocal = false;
    let isDownloading = false;
    let torrentProgress = 0;
    let localPath = '';

    const invItem = invEntries.find(item => item.gameId === game.id);

    if (invItem) {
      isLocal = invItem.status === 'concluido';
      isDownloading = invItem.status === 'download' || invItem.status === 'predownload';
      torrentProgress = invItem.progress || 0;
      localPath = invItem.folderName || '';
    }

    return { ...game, isLocalDownload: isLocal, localPath, isDownloading, torrentProgress: parseFloat(torrentProgress.toFixed(1)) };
  });

  res.json({
    games: gamesWithStatus,
    total: totalRes.total,
    pages: Math.ceil(totalRes.total / l),
    currentPage: p
  });
});

app.get('/api/filters', async (req, res) => {
  const db = getDb();
  const genresRaw = await db.all('SELECT DISTINCT genre FROM games WHERE genre IS NOT NULL');
  const developersRaw = await db.all('SELECT DISTINCT developer FROM games WHERE developer IS NOT NULL');
  
  // Flatten and unique genres (comma separated)
  const genres = Array.from(new Set(genresRaw.flatMap(g => g.genre.split(',').map((s: string) => s.trim())))).sort();
  const developers = developersRaw.map(d => d.developer).sort();
  
  res.json({ genres, developers });
});

app.get('/api/games/tags', async (req, res) => {
  res.json(['baixados', 'wishlist']);
});

app.get('/api/filesystem/folders', async (req, res) => {
  const { path: downloadPath } = req.query;
  if (!downloadPath || typeof downloadPath !== 'string' || downloadPath === 'null' || downloadPath === 'undefined') {
    return res.json([]);
  }

  try {
    const targetPath = path.resolve(downloadPath);
    console.log(`[FS] Reading folders from: ${targetPath}`);
    
    if (!fs.existsSync(targetPath)) {
      console.log(`[FS] Path does not exist: ${targetPath}`);
      return res.json([]);
    }
    
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    const items = entries.filter(e => (e.isDirectory() || (e.isFile() && e.name.endsWith('.apk'))) && !e.name.startsWith('.'));

    const inventory = getInventory(targetPath);
    const indexedFolders = Object.values(inventory.downloads || {}).map((inv: any) => inv.folderName);

    // Para cada entrada, tenta extrair o packageName via heurística de nome
    const result = items.map(e => {
      // Se for APK direto na raiz, o nome do arquivo geralmente É o package name
      let packageName: string | null = null;
      let hasApk = e.isFile() && e.name.endsWith('.apk');
      
      if (hasApk) {
        const withoutExt = e.name.replace('.apk', '');
        if (/^[a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z]/.test(withoutExt)) {
          packageName = withoutExt;
        }
      } else if (e.isDirectory()) {
        try {
          const subEntries = fs.readdirSync(path.join(targetPath, e.name));
          const apkFile = subEntries.find(f => f.endsWith('.apk'));
          if (apkFile) {
            hasApk = true;
            const withoutExt = apkFile.replace('.apk', '');
            if (/^[a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z]/.test(withoutExt)) {
              packageName = withoutExt;
            }
          }
        } catch {}
      }

      const isIndexed = indexedFolders.includes(e.name);
      const invItem: any = Object.values(inventory.downloads || {}).find((inv: any) => inv.folderName === e.name);

      return { 
        name: e.name, 
        packageName, 
        hasApk, 
        isIndexed,
        status: invItem ? invItem.status : (hasApk ? 'unindexed' : 'unknown'),
        gameId: invItem ? invItem.gameId : null
      };
    });
      
    result.sort((a, b) => {
      const clean = (s: string) => s.replace(/^\[.*?\]\s*/, '');
      return clean(a.name).localeCompare(clean(b.name), undefined, { sensitivity: 'base' });
    });
      
    res.json(result);
  } catch (err: any) {
    console.error(`[FS] Error reading directory: ${err.message}`);
    res.status(500).json({ error: 'Falha ao ler diretório' });
  }
});

app.post('/api/games/:id/wishlist', async (req, res) => {
  const db = getDb();
  const { wishlist } = req.body;
  try {
    await db.run('UPDATE games SET wishlist = ? WHERE id = ?', [wishlist ? 1 : 0, req.params.id]);
    res.json({ success: true, wishlist });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/games/:id', async (req, res) => {
  const db = getDb();
  const game = await db.get('SELECT * FROM games WHERE id = ?', [req.params.id]);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  
  const pathQuery = req.query.path as string;
  let isLocal = false;
  let localPath = '';
  let isDownloading = false;
  let torrentProgress = 0;

  if (pathQuery && fs.existsSync(pathQuery)) {
    const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-\[\]().]+/g, '');
    const cleanName = game.title.replace(/\[.*?\]/g, '').trim();

    // Prioridade 1: Inventário (.index.json)
    const inventory = getInventory(pathQuery);
    const invEntries = Object.values(inventory.downloads || {}) as any[];
    const invItem = invEntries.find(item => item.gameId === game.id);

    if (invItem) {
      isLocal = invItem.status === 'concluido';
      isDownloading = invItem.status === 'download' || invItem.status === 'predownload';
      torrentProgress = invItem.progress || 0;
      localPath = invItem.folderName || '';
    }

    if (invItem) {
      isLocal = invItem.status === 'concluido';
      isDownloading = invItem.status === 'download' || invItem.status === 'predownload';
      torrentProgress = invItem.progress || 0;
      localPath = invItem.folderName || '';
    }
  }

  res.json({ ...game, isLocalDownload: isLocal, localPath, isDownloading, torrentProgress: parseFloat(torrentProgress.toFixed(1)) });
});

app.put('/api/games/:id', async (req, res) => {
  const { id } = req.params;
  const { title, tags, genre, developer, publisher, version, languages, play_modes } = req.body;
  const db = getDb();
  try {
    await db.run(
      'UPDATE games SET title = ?, tags = ?, genre = ?, developer = ?, publisher = ?, version = ?, languages = ?, play_modes = ? WHERE id = ?',
      [title, tags, genre, developer, publisher, version, languages, play_modes, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar jogo' });
  }
});

app.delete('/api/games/:id', async (req, res) => {
  const db = getDb();
  try {
    await db.run('DELETE FROM games WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/db/clear', async (req, res) => {
  const db = getDb();
  try {
    await db.run('DELETE FROM games');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Backup & Restore ---
const tempDir = path.join(USER_DATA_DIR, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
const upload = multer({ dest: tempDir });

app.get('/api/db/export', async (req, res) => {
  stopScraper();
  
  const zip = new AdmZip();
  const dbPath = path.join(USER_DATA_DIR, 'database.sqlite');
  
  zip.addLocalFile(dbPath);
  
  const metadata = {
    created_at: new Date().toISOString(),
    files: ['database.sqlite'],
    validation_code: '62941651'
  };
  zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));
  
  const zipBuffer = zip.toBuffer();
  
  res.attachment(`vrrookie_backup_${Date.now()}.zip`);
  res.send(zipBuffer);
});

app.post('/api/db/import/check', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  try {
    const zip = new AdmZip(req.file.path);
    const metadataEntry = zip.getEntry('metadata.json');
    if (!metadataEntry) {
      return res.status(400).json({ error: 'Invalid backup: metadata.json not found' });
    }
    
    const metadata = JSON.parse(metadataEntry.getData().toString('utf8'));
    if (metadata.validation_code !== '62941651') {
      return res.status(400).json({ error: 'Invalid backup: incorrect validation code (expected 62941651)' });
    }
    
    res.json({ success: true, metadata, tempPath: req.file.path });
  } catch(e: any) {
    res.status(500).json({ error: 'Failed to read zip file. Not a valid backup.' });
  }
});

app.post('/api/db/import/apply', async (req, res) => {
  const { tempPath } = req.body;
  if (!tempPath) return res.status(400).json({ error: 'No temp path provided' });
  
  try {
    stopScraper();
    await closeDb();
    
    const zip = new AdmZip(tempPath);
    const extractPath = USER_DATA_DIR;
    zip.extractEntryTo('database.sqlite', extractPath, false, true);
    
    await initDb();
    fs.unlinkSync(tempPath);
    
    res.json({ success: true });
  } catch(e: any) {
    res.status(500).json({ error: 'Failed to apply backup: ' + e.message });
  }
});

app.post('/api/games/:id/update', async (req, res) => {
  const { full } = req.body;
  try {
    const updatedGame = await updateGame(parseInt(req.params.id), !!full);
    res.json(updatedGame);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Translation ---
app.post('/api/translate/:id', async (req, res) => {
  const db = getDb();
  const game = await db.get('SELECT * FROM games WHERE id = ?', [req.params.id]);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  
  if (game.translated_description) {
    // Only return if translation is already there. 
    // Actually, user said rebuild db handles it, but maybe we should allow re-translation if language changed?
    // For now, let's just use the current logic but with the dynamic language.
    return res.json({ translated_description: game.translated_description });
  }
  
  const translated = await translateText(game.description, globalTranslationLanguage);
  await db.run('UPDATE games SET translated_description = ? WHERE id = ?', [translated, game.id]);
  res.json({ translated_description: translated });
});

// --- Scraper ---
app.post('/api/scraper/start', (req, res) => {
  startScraper();
  res.json({ message: 'Scraper started' });
});

app.post('/api/scraper/stop', (req, res) => {
  stopScraper();
  res.json({ message: 'Scraper stopped' });
});

app.get('/api/scraper/status', (req, res) => {
  res.json(getStatus());
});

app.get('/api/scraper/failed', async (req, res) => {
  const db = getDb();
  const failed = await db.get('SELECT COUNT(*) as count FROM failed_games');
  const items = await db.all('SELECT * FROM failed_games ORDER BY last_attempt DESC');
  res.json({ count: failed.count, items });
});

app.post('/api/scraper/failed/:id/retry', async (req, res) => {
  try {
    await retryFailedGame(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scraper/failed/retry-all', async (req, res) => {
  try {
    const result = await retryAllFailedGames();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scraper/rebuild-all', async (req, res) => {
  try {
    const result = await rebuildAll();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Captcha ---
app.get('/api/captcha', (req, res) => {
  res.json(getStatus().captchaData || null);
});

app.post('/api/captcha/submit', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  submitCaptcha(code);
  res.json({ success: true });
});

// --- qBitTorrent ---
let qbitCookie = '';

async function loginQbit() {
  const params = new URLSearchParams();
  params.append('username', 'admin');
  params.append('password', 'adminadmin');
  
  const res = await axios.post('http://localhost:8080/api/v2/auth/login', params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  
  if (res.headers['set-cookie']) {
    qbitCookie = res.headers['set-cookie'][0].split(';')[0];
  }
}

app.post('/api/torrent/download', async (req, res) => {
  const { magnet, gameId } = req.body;
  const savepath = globalDownloadPath;
  
  if (!magnet || !savepath) return res.status(400).json({ error: 'Faltam dados para o download (Caminho não configurado no servidor?)' });

  try {
    const parsed: any = parseTorrent(magnet);
    const hash = parsed.infoHash;
    if (!hash) throw new Error('Magnet ou Link inválido');

    globalDownloadPath = savepath;
    const inventory = getInventory(savepath);

    inventory.downloads[hash] = {
      gameId: gameId || 0,
      folderName: 'Obtendo metadados...',
      hash,
      status: 'predownload',
      fileTree: [],
      progress: 0,
      addedAt: new Date().toISOString()
    };
    updateInventory(savepath, inventory);
    
    // Notifica o frontend imediatamente via Socket.io para trocar o botão para Predownload (Req 1)
    io.emit('torrent_status_update', { hash, status: 'predownload' });

    // Helper to add to qBit (prevents code repetition)
    const sendToQbit = async () => {
      try {
        if (!qbitCookie) await loginQbit();
        const params = new URLSearchParams();
        params.append('urls', magnet);
        params.append('savepath', savepath);
        
        await axios.post('http://localhost:8080/api/v2/torrents/add', params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': qbitCookie
          }
        });
        console.log(`[qBit] Torrent ${hash} enviado com sucesso.`);
      } catch (err: any) {
        console.error('[qBit] Falha ao enviar:', err.message);
      }
    };

    let metadataExtracted = false;
    const timeoutMs = 90000; // 1:30 min

    const timeoutHandle = setTimeout(() => {
      if (!metadataExtracted) {
        console.log(`[Download] Timeout de metadados para ${hash}. Forçando envio ao qBit.`);
        const inv = getInventory(savepath);
        if (inv.downloads[hash]) {
          inv.downloads[hash].status = 'download';
          inv.downloads[hash].folderName = 'Sincronizando...'; // Monitor irá preencher
          updateInventory(savepath, inv);
        }
        
        // Destruir handler do WebTorrent
        const wtInstance: any = wt.get(hash);
        if (wtInstance) wtInstance.destroy();

        sendToQbit();
      }
    }, timeoutMs);

    // Step 2: Extract file tree via WebTorrent before sending to qBit
    wt.add(magnet, (torrent: any) => {
      metadataExtracted = true;
      clearTimeout(timeoutHandle);
      
      console.log(`[WT] Metadados recebidos para ${torrent.name}`);
      const inv = getInventory(savepath);
      if (inv.downloads[hash]) {
        inv.downloads[hash].folderName = torrent.name;
        inv.downloads[hash].fileTree = torrent.files.map((f: any) => ({ 
          name: f.name, 
          size: f.length, 
          path: f.path 
        }));
        inv.downloads[hash].status = 'download';
        updateInventory(savepath, inv);
      }
      
      // Destroy WT since qBit will handle the heavy lifting
      torrent.destroy();

      // Step 3: Add to qBitTorrent
      sendToQbit();
    });

    res.json({ success: true, message: 'Predownload iniciado. Verifique o status em breve.' });
  } catch (err: any) {
    console.error(`[Download] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings', (req, res) => {
  res.json({ 
    downloadPath: globalDownloadPath, 
    translationLanguage: globalTranslationLanguage,
    interfaceLanguage: globalInterfaceLanguage,
    start: globalStart,
    blacklist: globalBlacklist
  });
});

app.post('/api/settings', async (req, res) => {
  const { downloadPath, translationLanguage, interfaceLanguage, start, blacklist } = req.body;
  
  try {
    if (downloadPath) {
      const targetPath = path.resolve(downloadPath);
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }
      globalDownloadPath = targetPath;

      const indexPath = path.join(targetPath, '.index.json');
      if (!fs.existsSync(indexPath)) {
        fs.writeFileSync(indexPath, JSON.stringify({ downloads: {} }, null, 2));
        console.log(`[FS] Created index file at ${indexPath}`);
      }
    }

    if (translationLanguage !== undefined) globalTranslationLanguage = translationLanguage;
    if (interfaceLanguage !== undefined) globalInterfaceLanguage = interfaceLanguage;
    if (start !== undefined) globalStart = start;
    if (blacklist !== undefined) globalBlacklist = blacklist;
    
    saveSettings({ 
      downloadPath: globalDownloadPath, 
      translationLanguage: globalTranslationLanguage,
      interfaceLanguage: globalInterfaceLanguage,
      start: globalStart,
      blacklist: globalBlacklist
    });
    
    res.json({ success: true, downloadPath: globalDownloadPath, translationLanguage: globalTranslationLanguage, interfaceLanguage: globalInterfaceLanguage, start: globalStart, blacklist: globalBlacklist });
  } catch (err: any) {
    console.error(`[FS] Error saving settings: ${err.message}`);
    res.status(500).json({ error: 'Erro ao salvar configurações: ' + err.message });
  }
});

app.get('/api/torrent/check', async (req, res) => {
  try {
    let isRunning = false;
    let webUiWorking = false;
    
    // Check Process
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq qbittorrent.exe"');
        isRunning = stdout.toLowerCase().includes('qbittorrent.exe');
      } else {
        const { stdout } = await execAsync('pgrep -x qbittorrent || pgrep -x qbittorrent-nox || true');
        isRunning = stdout.trim().length > 0;
      }
    } catch (e) { }

    // Check WebUI
    try {
      if (!qbitCookie) await loginQbit();
      await axios.get('http://localhost:8080/api/v2/app/version', {
        headers: { 'Cookie': qbitCookie },
        timeout: 2000
      });
      webUiWorking = true;
    } catch (err) { }

    res.json({ isRunning, webUiWorking });
  } catch (err) {
    res.json({ isRunning: false, webUiWorking: false });
  }
});

app.get('/api/torrent/status', async (req, res) => {
  // Primeiro lemos o inventário — fonte principal de verdade
  const inventory = getInventory(globalDownloadPath);
  const inventoryItems = Object.values(inventory.downloads || {}) as any[];

  // Pega status do qBit se disponível
  let qbitTorrents: any[] = [];
  try {
    if (!qbitCookie) await loginQbit();
    const torrentsRes = await axios.get('http://localhost:8080/api/v2/torrents/info', {
      headers: { 'Cookie': qbitCookie },
      timeout: 3000
    });
    qbitTorrents = torrentsRes.data;
  } catch (err) {
    // qBit offline — serve apenas o inventário
  }

  // Monta lista final: prioridade ao inventário para ter o gameId
  const result: any[] = [];

  for (const item of inventoryItems) {
    if (item.status === 'concluido') continue; // já finalizado, não aparece como ativo
    
    const qbt = qbitTorrents.find((t: any) => t.hash?.toLowerCase() === item.hash?.toLowerCase());
    
    result.push({
      hash: item.hash,
      gameId: item.gameId,
      name: (qbt?.name) || item.folderName || 'Iniciando...',
      progress: qbt ? parseFloat((qbt.progress * 100).toFixed(1)) : 0,
      state: item.status === 'predownload' ? 'predownload' : (qbt?.state || 'download'),
    });
  }

  res.json(result);
});

app.post('/api/torrent/action', async (req, res) => {
  const { hash, action } = req.body;
  // action can be: pause, resume, delete, delete_drive
  try {
    if (!qbitCookie) await loginQbit();
    const params = new URLSearchParams();
    params.append('hashes', hash);

    let endpoint = '';
    switch(action) {
      case 'pause': endpoint = 'torrents/pause'; break;
      case 'resume': endpoint = 'torrents/resume'; break;
      case 'delete': endpoint = 'torrents/delete'; params.append('deleteFiles', 'false'); break;
      case 'delete_drive': endpoint = 'torrents/delete'; params.append('deleteFiles', 'true'); break;
      default: return res.status(400).json({ error: 'Ação inválida' });
    }

    await axios.post(`http://localhost:8080/api/v2/${endpoint}`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': qbitCookie
      }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao executar ação no qBit' });
  }
});

// --- ADB / Sideloading ---
app.get('/api/adb/devices', async (req, res) => {
  try {
    const devices = await getAdbDevices();
    res.json({ devices });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/adb/check-path', async (req, res) => {
  try {
    const present = await checkAdbPath();
    res.json({ present });
  } catch (err: any) {
    res.json({ present: false });
  }
});

app.get('/api/adb/apps', async (req, res) => {
  const { deviceId } = req.query;
  try {
    const [apps, storage] = await Promise.all([
      getInstalledApps(deviceId as string),
      getStorageInfo(deviceId as string)
    ]);
    res.json({ apps, storage });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/adb/uninstall', async (req, res) => {
  const { pkg, deviceId } = req.body;
  try {
    const success = await uninstallApp(pkg, deviceId);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/filesystem/scan-local-downloads', async (req, res) => {
  const downloadPath = globalDownloadPath;
  const db = getDb();
  
  if (!downloadPath || !fs.existsSync(downloadPath)) {
    return res.status(400).json({ error: 'Diretório de Downloads do servidor está inválido ou não configurado.' });
  }

  try {
    const inventory = getInventory(downloadPath);
    const entries = fs.readdirSync(downloadPath, { withFileTypes: true });
    const localItems = entries.filter(e => (e.isDirectory() || (e.isFile() && e.name.endsWith('.apk'))) && !e.name.startsWith('.'));
    const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-\[\]().]+/g, '');
    
    let matchedCount = 0;
    let inventoryChanged = false;
    
    for (const item of localItems) {
      const itemName = item.name;
      const isAlreadyIndexed = Object.values(inventory.downloads || {}).some((inv: any) => inv.folderName === itemName);
      if (isAlreadyIndexed) continue;

      const cleanItemName = itemName.replace('.apk', '').toLowerCase();
      const normalizedSearch = normalize(cleanItemName);
      const searchPrefix = normalizedSearch.slice(0, 15);
      
      if (searchPrefix.length < 3) continue;

      // Busca um jogo que combine com esse nome
      const game = await db.get('SELECT * FROM games WHERE title LIKE ? OR title LIKE ? LIMIT 1', [`%${cleanItemName}%`, `%${searchPrefix}%`]);
      
      if (game) {
        // Encontramos o jogo! Vamos indexar no .index.json
        const virtualHash = `local_${game.id}_${Buffer.from(itemName).toString('hex').slice(0, 8)}`;
        
        let fileTree = [];
        const fullPath = path.join(downloadPath, itemName);
        if (item.isDirectory()) {
          fileTree = generateFileTree(fullPath);
        } else {
          const stat = fs.statSync(fullPath);
          fileTree = [{ name: itemName, size: stat.size, path: itemName }];
        }

        inventory.downloads[virtualHash] = {
          gameId: game.id,
          folderName: itemName,
          hash: virtualHash,
          status: 'concluido',
          fileTree: fileTree,
          progress: 100,
          addedAt: new Date().toISOString()
        };
        
        inventoryChanged = true;
        matchedCount++;
      }
    }

    if (inventoryChanged) {
      updateInventory(downloadPath, inventory);
    }

    res.json({ success: true, matchedCount, totalScanned: localItems.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/filesystem/manual-index', async (req, res) => {
  const { folderName, gameId } = req.body;
  const downloadPath = globalDownloadPath;
  
  if (!downloadPath || !folderName || !gameId) {
    return res.status(400).json({ error: 'Dados insuficientes' });
  }

  try {
    const inventory = getInventory(downloadPath);
    const fullPath = path.join(downloadPath, folderName);
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Caminho não encontrado' });
    }

    const stat = fs.statSync(fullPath);
    let fileTree = [];
    if (stat.isDirectory()) {
      fileTree = generateFileTree(fullPath);
    } else {
      fileTree = [{ name: folderName, size: stat.size, path: folderName }];
    }

    const virtualHash = `manual_${gameId}_${Buffer.from(folderName).toString('hex').slice(0, 8)}`;
    
    inventory.downloads[virtualHash] = {
      gameId: parseInt(gameId),
      folderName: folderName,
      hash: virtualHash,
      status: 'concluido',
      fileTree: fileTree,
      progress: 100,
      addedAt: new Date().toISOString()
    };

    updateInventory(downloadPath, inventory);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/filesystem/remove-index', async (req, res) => {
  const { folderName } = req.body;
  const downloadPath = globalDownloadPath;
  
  if (!downloadPath || !folderName) {
    return res.status(400).json({ error: 'Dados insuficientes' });
  }

  try {
    const inventory = getInventory(downloadPath);
    let removed = false;
    
    for (const hash in inventory.downloads) {
      if (inventory.downloads[hash].folderName === folderName) {
        delete inventory.downloads[hash];
        removed = true;
      }
    }

    if (removed) {
      updateInventory(downloadPath, inventory);
    }
    res.json({ success: true, removed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/adb/install', async (req, res) => {
  const { folderPath, deviceId } = req.body;
  if (!folderPath) return res.status(400).json({ error: 'Caminho da pasta é obrigatório' });

  try {
    const targetDir = path.resolve(folderPath);
    console.log(`[ADB] Install requested for: "${targetDir}"`);

    if (!fs.existsSync(targetDir)) {
      return res.status(404).json({ error: `Arquivo ou pasta não encontrada: ${targetDir}` });
    }

    const stat = fs.statSync(targetDir);
    const isFile = stat.isFile();

    if (isFile) {
      if (!targetDir.endsWith('.apk')) {
        return res.status(400).json({ error: 'O arquivo não é um APK válido.' });
      }
      const isSuccess = await installApp(targetDir, deviceId);
      return res.json({ success: true, installLog: [{ apk: path.basename(targetDir), success: isSuccess }], obbLog: [] });
    }

    // Procura arquivos e pastas OBB de forma mais inteligente (Req 1)
    const findFilesAndDirs = (dir: string): { apks: string[], obbFolders: string[] } => {
      let apks: string[] = [];
      let obbFolders: string[] = [];
      const items = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          // Se o nome da pasta parece um package name e contem .obb, consideramos ela como root OBB
          const subItems = fs.readdirSync(fullPath);
          const hasObb = subItems.some(f => f.endsWith('.obb'));
          const looksLikePkg = item.name.includes('.') && !item.name.includes(' ');
          
          if (hasObb && looksLikePkg) {
            obbFolders.push(fullPath);
          } else {
            const sub = findFilesAndDirs(fullPath);
            apks = apks.concat(sub.apks);
            obbFolders = obbFolders.concat(sub.obbFolders);
          }
        } else if (item.name.endsWith('.apk')) {
          apks.push(fullPath);
        }
      }
      return { apks, obbFolders };
    };

    const { apks, obbFolders } = findFilesAndDirs(targetDir);
    if (apks.length === 0 && obbFolders.length === 0) {
      return res.status(400).json({ error: 'Nenhum APK ou Pasta OBB encontrada.' });
    }

    console.log(`[ADB] Instando em paralelo: ${apks.length} APKs e ${obbFolders.length} pastas OBB`);

    // Executa instalações em paralelo
    const installTasks = apks.map(async (apk) => {
      const success = await installApp(apk, deviceId);
      return { apk: path.basename(apk), success };
    });

    const obbTasks = obbFolders.map(async (obbDir) => {
      const pkgName = path.basename(obbDir);
      try {
        await pushObb(obbDir, pkgName, deviceId);
        return { pkg: pkgName, success: true };
      } catch (err) {
        return { pkg: pkgName, success: false };
      }
    });

    const [installLog, obbLog] = await Promise.all([
      Promise.all(installTasks),
      Promise.all(obbTasks)
    ]);

    // Opcional: Indexa automaticamente após instalar se algum APK tiver sucesso (Req: salvar no index.json)
    if (installLog.some(log => log.success)) {
      try {
        const folderName = path.basename(targetDir);
        const inventory = getInventory(globalDownloadPath);
        
        // Verifica se já não está indexado
        const alreadyIndexed = Object.values(inventory.downloads || {}).some((inv: any) => inv.folderName === folderName);
        
        if (!alreadyIndexed) {
          const db = getDb();
          const cleanItemName = folderName.replace(/\[.*?\]/g, '').trim();
          const searchPrefix = cleanItemName.slice(0, 10);
          const game = await db.get('SELECT * FROM games WHERE title LIKE ? OR title LIKE ? LIMIT 1', [`%${cleanItemName}%`, `%${searchPrefix}%`]);
          
          if (game) {
            const virtualHash = `sideload_${game.id}_${Buffer.from(folderName).toString('hex').slice(0, 8)}`;
            inventory.downloads[virtualHash] = {
              gameId: game.id,
              folderName: folderName,
              hash: virtualHash,
              status: 'concluido',
              fileTree: [], // Não precisamos da árvore completa para marcar como instalado
              progress: 100,
              addedAt: new Date().toISOString()
            };
            updateInventory(globalDownloadPath, inventory);
            console.log(`[ADB] Jogo indexado automaticamente após instalar: ${game.title}`);
          }
        }
      } catch (err) {
        console.error('[ADB] Erro ao indexar automaticamente:', err);
      }
    }

    res.json({ success: true, installLog, obbLog });
  } catch (err: any) {
    console.error(`[ADB] Install error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});


const PORT = Number(process.env.PORT) || 4000;

async function bootstrap() {
  await initDb();
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend is running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap();
