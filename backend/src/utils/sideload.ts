import fs from 'fs';
import path from 'path';
import { 
  installApp, 
  pushObb, 
  getApkPackageName, 
  uninstallApp, 
  pullPath, 
  pushPath, 
  runAdbCommand,
  getAdbDevices,
  getStorageInfo
} from './adb';
import { io } from '../index';
import { EtaEstimator } from './eta';

export interface SideloadResult {
  success: boolean;
  message: string;
  installLog: { apk: string; success: boolean; reinstalled?: boolean }[];
  obbLog: { pkg: string; success: boolean }[];
}

const getMsg = (key: string, lang: string = 'en', data?: any) => {
  const translations: any = {
    en: {
      reinstalling: 'Reinstalling (Backup -> Uninstall -> Install -> Restore)...',
      backingUp: 'Backing up save data...',
      uninstalling: 'Uninstalling old version...',
      installingNew: 'Installing new version...',
      restoring: 'Restoring save data...',
      pushingObb: 'Pushing OBB...',
      runningCustom: 'Running custom commands from install.txt...',
      customCommand: 'Running command {{current}}/{{total}}: {{cmd}}',
      pushingCompanion: 'Pushing companion OBB: {{pkg}}',
      pushingLoneObb: 'Pushing lone OBB: {{pkg}}',
      installingApk: 'Installing APK: {{apk}}',
      pushingLooseObb: 'Pushing loose OBB: {{pkg}}'
    },
    pt: {
      reinstalling: 'Reinstalação (Backup -> Desinstalar -> Instalar -> Restaurar)...',
      backingUp: 'Fazendo backup dos dados salvos...',
      uninstalling: 'Desinstalando versão antiga...',
      installingNew: 'Instalando nova versão...',
      restoring: 'Restaurando dados salvos...',
      pushingObb: 'Enviando OBB...',
      runningCustom: 'Executando comandos customizados de install.txt...',
      customCommand: 'Executando comando {{current}}/{{total}}: {{cmd}}',
      pushingCompanion: 'Enviando OBB companheira: {{pkg}}',
      pushingLoneObb: 'Enviando OBB avulso: {{pkg}}',
      installingApk: 'Instalando APK: {{apk}}',
      pushingLooseObb: 'Enviando OBB solto: {{pkg}}'
    }
  };

  let msg = translations[lang]?.[key] || translations['en'][key] || key;
  if (data) {
    Object.keys(data).forEach(k => {
      msg = msg.replace(`{{${k}}}`, data[k]);
    });
  }
  return msg;
};

let currentObbCountForAsset = 0; // Helper to track OBBs in current session potentially? 
// No, let's just use the index.

/**
 * Replicates the "SideForge" sideloading logic: 
 * - Recursive discovery
 * - Auto-reinstall on failure with data backup
 * - install.txt support
 * - OBB folder pairing
 */
export async function performSideForgeSideload(targetPath: string, deviceId?: string, lang: string = 'en'): Promise<SideloadResult> {
  const absolutePath = path.resolve(targetPath);
  console.log(`[SIDEFORGE] Starting sideload pipeline for: ${absolutePath}`);
  const installLog: any[] = [];
  const obbLog: any[] = [];
  
  const emitProgress = (msg: string, step: number = 1, currentName?: string, total: number = 1, current: number = 0, assetType: 'apk' | 'obb' = 'apk') => {
    io.emit('adb_event', { 
      type: 'progress', 
      message: msg, 
      folderPath: absolutePath, 
      currentName,
      total,
      current,
      step,
      assetType
    });
  };

  try {
    const stat = fs.statSync(absolutePath);
    
    // --- Case A: Single File ---
    if (stat.isFile()) {
      if (absolutePath.endsWith('.apk')) {
        const pkg = await getApkPackageName(absolutePath) || path.basename(absolutePath, '.apk');
        emitProgress(getMsg('installingApk', lang, { apk: path.basename(absolutePath) }), 1, path.basename(absolutePath), 1, 0, 'apk');
        const res = await sideloadApkWithRetry(absolutePath, pkg, deviceId, lang, (msg, step) => emitProgress(msg, step, path.basename(absolutePath), 1, 0, 'apk'));
        installLog.push({ apk: path.basename(absolutePath), success: res.success, reinstalled: res.reinstalled });
        
        // Check for OBB in the same folder
        const parentDir = path.dirname(absolutePath);
        const potentialObbDir = path.join(parentDir, pkg);
        if (fs.existsSync(potentialObbDir) && fs.statSync(potentialObbDir).isDirectory()) {
          emitProgress(getMsg('pushingCompanion', lang, { pkg }), 1, pkg, 1, 0, 'obb');
          const obbSuccess = await pushObbSafe(potentialObbDir, pkg, deviceId, lang, (msg, step) => emitProgress(msg, step, pkg, 1, 0, 'obb'));
          obbLog.push({ pkg, success: obbSuccess });
        }
      } else if (absolutePath.endsWith('.obb')) {
        const filename = path.basename(absolutePath);
        // Robust extraction from filename "main.123.com.pkg.name.obb" -> "com.pkg.name"
        const pkgMatch = filename.match(/(?:main|patch)\.\d+\.(.+)\.obb$/);
        const pkg = pkgMatch ? pkgMatch[1] : filename.replace('.obb', '');
        
        emitProgress(getMsg('pushingLoneObb', lang, { pkg }), 1, pkg, 1, 0, 'obb');
        const tempDir = path.join(path.dirname(absolutePath), `_temp_obb_${pkg}`);
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        fs.copyFileSync(absolutePath, path.join(tempDir, filename));
        
        const obbSuccess = await pushObbSafe(tempDir, pkg, deviceId, lang, (msg, step) => emitProgress(msg, step, pkg, 1, 0, 'obb'));
        obbLog.push({ pkg, success: obbSuccess });
        
        fs.unlinkSync(path.join(tempDir, filename));
        fs.rmdirSync(tempDir);
      } else if (path.basename(absolutePath) === 'install.txt' || absolutePath.endsWith('.txt')) {
        const success = await runInstallTxt(absolutePath, deviceId, lang, (msg, step) => emitProgress(msg, step));
        installLog.push({ apk: 'install.txt', success });
      }
    } 
    // --- Case B: Directory ---
    else {
      const items = fs.readdirSync(absolutePath);
      
      if (items.includes('install.txt')) {
        await runInstallTxt(path.join(absolutePath, 'install.txt'), deviceId, lang, (msg, step) => emitProgress(msg, step));
      }

      const { apks, obbs } = findSideloadAssets(absolutePath);
      const total = apks.length + obbs.length;
      let currentIdx = 0;

      for (const apk of apks) {
        const pkg = await getApkPackageName(apk) || path.basename(apk, '.apk');
        const filename = path.basename(apk);
        console.log(`[SIDEFORGE] Processing asset ${currentIdx + 1}/${total}: ${filename} (${pkg})`);
        emitProgress(getMsg('installingApk', lang, { apk: filename }), 1, filename, total, currentIdx, 'apk');
        const res = await sideloadApkWithRetry(apk, pkg, deviceId, lang, (msg, step) => emitProgress(msg, step, filename, total, currentIdx, 'apk'));
        installLog.push({ apk: filename, success: res.success, reinstalled: res.reinstalled });
        currentIdx++;

        const matchingObb = obbs.find(o => path.basename(o) === pkg);
        if (matchingObb) {
          emitProgress(getMsg('pushingObb', lang, { pkg }), 1, pkg, total, currentIdx, 'obb');
          const obbSuccess = await pushObbSafe(matchingObb, pkg, deviceId, lang, (msg, step) => emitProgress(msg, step, pkg, total, currentIdx, 'obb'));
          obbLog.push({ pkg, success: obbSuccess });
          const idx = obbs.indexOf(matchingObb);
          obbs.splice(idx, 1);
          currentIdx++;
        }
      }

      for (const obb of obbs) {
        const pkg = path.basename(obb);
        emitProgress(getMsg('pushingLooseObb', lang, { pkg }), 1, pkg, total, currentIdx, 'obb');
        const obbSuccess = await pushObbSafe(obb, pkg, deviceId, lang, (msg, step) => emitProgress(msg, step, pkg, total, currentIdx, 'obb'));
        obbLog.push({ pkg, success: obbSuccess });
        currentIdx++;
      }
    }

    return {
      success: true,
      message: 'Sideload completed',
      installLog,
      obbLog
    };

  } catch (err: any) {
    console.error(`[Sideload] Error: ${err.message}`);
    return {
      success: false,
      message: err.message,
      installLog: [],
      obbLog: []
    };
  }
}

async function sideloadApkWithRetry(apkPath: string, pkg: string, deviceId: string | undefined, lang: string, onProgress: (msg: string, percent: number, speed?: number, eta?: number) => void) {

  const installProgressHandler = (step: number) => {
    onProgress('', step);
  };

  let result = await installApp(apkPath, deviceId, installProgressHandler);
  let reinstalled = false;

  if (!result.success) {
    const errorMsg = (result.stderr || '').toLowerCase() + (result.stdout || '').toLowerCase();
    const isReinstallEligible = 
      errorMsg.includes('signatures do not match') || 
      errorMsg.includes('install_failed_version_downgrade') || 
      errorMsg.includes('failed to install') ||
      errorMsg.includes('insufficient_storage');

    if (isReinstallEligible) {
      onProgress(getMsg('reinstalling', lang), 1);
      
      const backupPath = path.join(path.dirname(apkPath), `_backup_${pkg}`);
      onProgress(getMsg('backingUp', lang), 1);
      try {
        await pullPath(`/sdcard/Android/data/${pkg}`, backupPath, deviceId);
      } catch (e) {}

      onProgress(getMsg('uninstalling', lang), 1);
      await uninstallApp(pkg, deviceId);

      onProgress(getMsg('installingNew', lang), 2);
      const secondTry = await installApp(apkPath, deviceId, installProgressHandler);
      
      if (secondTry.success) {
        reinstalled = true;
        if (fs.existsSync(backupPath)) {
          onProgress(getMsg('restoring', lang), 2);
          await pushPath(backupPath, `/sdcard/Android/data/`, deviceId);
          try {
            fs.rmSync(backupPath, { recursive: true, force: true });
          } catch(e) {}
        }
        result = secondTry;
      } else {
        result = secondTry;
      }
    }
  }

  return { success: result.success, reinstalled };
}

async function pushObbSafe(obbDir: string, pkg: string, deviceId: string | undefined, lang: string, onProgress: (msg: string, percent: number, speed?: number, eta?: number) => void) {
  try {
    await pushObb(obbDir, pkg, deviceId, (step) => {
      onProgress('', step);
    });
    return true;
  } catch (e) {
    return false;
  }
}

function findSideloadAssets(dir: string) {
  const apks: string[] = [];
  const obbs: string[] = [];
  
    function recurse(currentDir: string) {
      const items = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(currentDir, item.name);
        if (item.isDirectory()) {
          // Check if it's an OBB folder (contains .obb files) or should be recurse
          const subItems = fs.readdirSync(fullPath);
          const hasObb = subItems.some(si => si.endsWith('.obb'));
          if (hasObb) {
            obbs.push(fullPath);
          } else {
            recurse(fullPath);
          }
        } else if (item.name.endsWith('.apk')) {
          apks.push(fullPath);
        }
      }
    }
  
  recurse(dir);
  return { apks, obbs };
}

async function runInstallTxt(filePath: string, deviceId: string | undefined, lang: string, onProgress: (msg: string, percent: number) => void) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
    
    for (let i = 0; i < lines.length; i++) {
      const cmd = lines[i];
      const step = Math.min(3, Math.max(1, Math.floor((i / lines.length) * 3) + 1));
      onProgress(getMsg('customCommand', lang, { current: i + 1, total: lines.length, cmd }), step);
      await runAdbCommand(cmd, deviceId);
    }
    return true;
  } catch (e) {
    return false;
  }
}
