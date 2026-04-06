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

/**
 * Replicates the "SideForge" sideloading logic: 
 * - Recursive discovery
 * - Auto-reinstall on failure with data backup
 * - install.txt support
 * - OBB folder pairing
 */
export async function performSideForgeSideload(targetPath: string, deviceId?: string, lang: string = 'en'): Promise<SideloadResult> {
  const absolutePath = path.resolve(targetPath);
  const installLog: any[] = [];
  const obbLog: any[] = [];
  
  const emitProgress = (msg: string, percent: number = 0, currentName?: string, total: number = 1, current: number = 0, speed?: number, eta?: number) => {
    io.emit('adb_event', { 
      type: 'progress', 
      message: msg, 
      folderPath: absolutePath, 
      currentName,
      total,
      current,
      percent,
      speed,
      eta
    });
  };

  try {
    const stat = fs.statSync(absolutePath);
    
    // --- Case A: Single File ---
    if (stat.isFile()) {
      if (absolutePath.endsWith('.apk')) {
        const pkg = await getApkPackageName(absolutePath) || path.basename(absolutePath, '.apk');
        const res = await sideloadApkWithRetry(absolutePath, pkg, deviceId, lang, (m: string, p: number, s?: number, e?: number) => emitProgress(m, p, path.basename(absolutePath), 1, 0, s, e));
        installLog.push({ apk: path.basename(absolutePath), success: res.success, reinstalled: res.reinstalled });
        
        // Check for OBB in the same folder
        const parentDir = path.dirname(absolutePath);
        const potentialObbDir = path.join(parentDir, pkg);
        if (fs.existsSync(potentialObbDir) && fs.statSync(potentialObbDir).isDirectory()) {
          emitProgress(getMsg('pushingCompanion', lang, { pkg }), 0, pkg);
          const obbSuccess = await pushObbSafe(potentialObbDir, pkg, deviceId, lang, (m: string, p: number, s?: number, e?: number) => emitProgress(m, p, pkg, 1, 0, s, e));
          obbLog.push({ pkg, success: obbSuccess });
        }
      } else if (absolutePath.endsWith('.obb')) {
        const filename = path.basename(absolutePath);
        // Robust extraction from filename "main.123.com.pkg.name.obb" -> "com.pkg.name"
        const pkgMatch = filename.match(/(?:main|patch)\.\d+\.(.+)\.obb$/);
        const pkg = pkgMatch ? pkgMatch[1] : filename.replace('.obb', '');
        
        emitProgress(getMsg('pushingLoneObb', lang, { pkg }), 0, pkg);
        const tempDir = path.join(path.dirname(absolutePath), `_temp_obb_${pkg}`);
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        fs.copyFileSync(absolutePath, path.join(tempDir, filename));
        
        const obbSuccess = await pushObbSafe(tempDir, pkg, deviceId, lang, (m: string, p: number, s?: number, e?: number) => emitProgress(m, p, pkg, 1, 0, s, e));
        obbLog.push({ pkg, success: obbSuccess });
        
        fs.unlinkSync(path.join(tempDir, filename));
        fs.rmdirSync(tempDir);
      } else if (path.basename(absolutePath) === 'install.txt' || absolutePath.endsWith('.txt')) {
        const success = await runInstallTxt(absolutePath, deviceId, lang, emitProgress);
        installLog.push({ apk: 'install.txt', success });
      }
    } 
    // --- Case B: Directory ---
    else {
      const items = fs.readdirSync(absolutePath);
      
      if (items.includes('install.txt')) {
        emitProgress(getMsg('runningCustom', lang), 0);
        await runInstallTxt(path.join(absolutePath, 'install.txt'), deviceId, lang, emitProgress);
      }

      const { apks, obbs } = findSideloadAssets(absolutePath);
      const total = apks.length + obbs.length;
      let currentIdx = 0;

      for (const apk of apks) {
        const pkg = await getApkPackageName(apk) || path.basename(apk, '.apk');
        const filename = path.basename(apk);
        emitProgress(getMsg('installingApk', lang, { apk: filename }), 0, filename, total, currentIdx);
        const res = await sideloadApkWithRetry(apk, pkg, deviceId, lang, (msg: string, p: number, speed?: number, eta?: number) => emitProgress(msg, p, filename, total, currentIdx, speed, eta));
        installLog.push({ apk: filename, success: res.success, reinstalled: res.reinstalled });
        currentIdx++;

        const matchingObb = obbs.find(o => path.basename(o) === pkg);
        if (matchingObb) {
          emitProgress(getMsg('pushingObb', lang, { pkg }), 0, pkg, total, currentIdx);
          const obbSuccess = await pushObbSafe(matchingObb, pkg, deviceId, lang, (msg: string, p: number, speed?: number, eta?: number) => emitProgress(msg, p, pkg, total, currentIdx, speed, eta));
          obbLog.push({ pkg, success: obbSuccess });
          const idx = obbs.indexOf(matchingObb);
          obbs.splice(idx, 1);
          currentIdx++;
        }
      }

      for (const obb of obbs) {
        const pkg = path.basename(obb);
        emitProgress(getMsg('pushingLooseObb', lang, { pkg }), 0, pkg, total, currentIdx);
        const obbSuccess = await pushObbSafe(obb, pkg, deviceId, lang, (msg: string, p: number, speed?: number, eta?: number) => emitProgress(msg, p, pkg, total, currentIdx, speed, eta));
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

  const installProgressHandler = (percent: number, speed?: number, eta?: number) => {
    onProgress(getMsg('installingNew', lang), percent, speed, eta);
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
      onProgress(getMsg('reinstalling', lang), 0);
      
      const backupPath = path.join(path.dirname(apkPath), `_backup_${pkg}`);
      onProgress(getMsg('backingUp', lang), 10);
      try {
        await pullPath(`/sdcard/Android/data/${pkg}`, backupPath, deviceId);
      } catch (e) {}

      onProgress(getMsg('uninstalling', lang), 30);
      await uninstallApp(pkg, deviceId);

      onProgress(getMsg('installingNew', lang), 50);
      const secondTry = await installApp(apkPath, deviceId, installProgressHandler);
      
      if (secondTry.success) {
        reinstalled = true;
        if (fs.existsSync(backupPath)) {
          onProgress(getMsg('restoring', lang), 80);
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
    await pushObb(obbDir, pkg, deviceId, (p, speed, eta) => {
      onProgress(getMsg('pushingObb', lang), p, speed, eta);
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
        if (item.name.includes('.') && !item.name.includes(' ')) {
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
      onProgress(getMsg('customCommand', lang, { current: i + 1, total: lines.length, cmd }), Math.round((i / lines.length) * 100));
      await runAdbCommand(cmd, deviceId);
    }
    return true;
  } catch (e) {
    return false;
  }
}
