import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs';

const execAsync = util.promisify(exec);

let adbCmd = 'adb';
let isAdbResolved = false;

const getAdbFallbackPath = (): string => {
  if (process.platform === 'win32') {
    return path.join(os.homedir(), 'Documents', 'VRRookieDownloader', 'adb', 'adb.exe');
  }
  return path.join(os.homedir(), '.local', 'share', 'VRRookieDownloader', 'adb', 'adb');
};

const getAdbCommand = async () => {
  if (isAdbResolved) return adbCmd;
  
  try {
    await execAsync('adb --version');
    adbCmd = 'adb';
  } catch (e) {
    const fallbackPath = getAdbFallbackPath();
    if (fs.existsSync(fallbackPath)) {
      adbCmd = `"${fallbackPath}"`;
    }
  }
  isAdbResolved = true;
  return adbCmd;
};

export const getAdbDevices = async () => {
  try {
    const cmd = await getAdbCommand();
    const { stdout } = await execAsync(`${cmd} devices`);
    const lines = stdout.split('\n').slice(1);
    const devices = lines
      .filter(line => line.includes('\tdevice'))
      .map(line => line.split('\t')[0].trim());
    return devices;
  } catch (e) {
    return [];
  }
};

export const checkAdbPath = async () => {
  try {
    const cmd = await getAdbCommand();
    const { stdout } = await execAsync(`${cmd} --version`);
    return stdout.includes('Android Debug Bridge version');
  } catch (e) {
    return false;
  }
};

export const getInstalledApps = async (deviceId?: string) => {
  try {
    const cmd = await getAdbCommand();
    const deviceFlag = deviceId ? `-s ${deviceId}` : '';
    const { stdout } = await execAsync(`${cmd} ${deviceFlag} shell pm list packages -3`);
    return stdout
      .split('\n')
      .map(line => line.replace('package:', '').trim())
      .filter(line => line.length > 0);
  } catch (e) {
    return [];
  }
};

export const getStorageInfo = async (deviceId?: string) => {
  try {
    const cmd = await getAdbCommand();
    const deviceFlag = deviceId ? `-s ${deviceId}` : '';
    const { stdout } = await execAsync(`${cmd} ${deviceFlag} shell df -h /storage/emulated`);
    const lines = stdout.split('\n').filter(line => line.trim().length > 0);
    if (lines.length > 1) {
      const parts = lines[lines.length - 1].trim().split(/\s+/);
      if (parts.length >= 5) {
        return {
          total: parts[1],
          used: parts[2],
          free: parts[3],
          percentage: parts[4]
        };
      }
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const uninstallApp = async (pkg: string, deviceId?: string) => {
  const cmd = await getAdbCommand();
  const deviceFlag = deviceId ? `-s ${deviceId}` : '';
  const { stdout } = await execAsync(`${cmd} ${deviceFlag} uninstall ${pkg}`);
  return stdout.includes('Success');
};

export const installApp = async (apkPath: string, deviceId?: string) => {
  const cmd = await getAdbCommand();
  const deviceFlag = deviceId ? `-s ${deviceId}` : '';
  // Resolve path to handle windows slashes and spaces correctly
  const absoluteApkPath = path.resolve(apkPath);
  const { stdout } = await execAsync(`${cmd} ${deviceFlag} install -r -g "${absoluteApkPath}"`);
  return stdout.includes('Success');
};

export const pushObb = async (obbDir: string, pkg: string, deviceId?: string) => {
  const cmd = await getAdbCommand();
  const deviceFlag = deviceId ? `-s ${deviceId}` : '';
  const targetParent = '/storage/emulated/0/Android/obb/';
  
  // Resolve local path correctly
  const absoluteObbDir = path.resolve(obbDir);
  
  await execAsync(`${cmd} ${deviceFlag} shell mkdir -p ${targetParent}`);
  const { stdout } = await execAsync(`${cmd} ${deviceFlag} push "${absoluteObbDir}" "${targetParent}"`);
  return stdout;
};

/**
 * Tries to extract the package name from an APK file.
 * Uses 'aapt dump badging' if available, otherwise falls back to null.
 */
export const getApkPackageName = async (apkPath: string): Promise<string | null> => {
  const absolutePath = path.resolve(apkPath);
  try {
    const { stdout } = await execAsync(`aapt dump badging "${absolutePath}"`);
    const match = stdout.match(/package: name='([^']+)'/);
    return match ? match[1] : null;
  } catch {
    try {
      // aapt2 fallback
      const { stdout } = await execAsync(`aapt2 dump badging "${absolutePath}"`);
      const match = stdout.match(/package: name='([^']+)'/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
};
