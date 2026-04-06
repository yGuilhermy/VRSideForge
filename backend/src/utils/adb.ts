import { exec, spawn } from 'child_process';
import util from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { EtaEstimator } from './eta';

const execAsync = util.promisify(exec);

let adbCmd = 'adb';
let isAdbResolved = false;

const getAdbFallbackPath = (): string => {
  if (process.platform === 'win32') {
    return path.join(os.homedir(), 'Documents', 'VRSideForge', 'adb', 'adb.exe');
  }
  return path.join(os.homedir(), '.local', 'share', 'VRSideForge', 'adb', 'adb');
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
  try {
    const cmd = await getAdbCommand();
    const deviceFlag = deviceId ? `-s ${deviceId}` : '';
    const { stdout } = await execAsync(`${cmd} ${deviceFlag} uninstall ${pkg}`);
    return stdout.includes('Success');
  } catch (e) {
    return false;
  }
};

export const pullPath = async (remotePath: string, localPath: string, deviceId?: string) => {
  const cmd = await getAdbCommand();
  const deviceFlag = deviceId ? `-s ${deviceId}` : '';
  const { stdout, stderr } = await execAsync(`${cmd} ${deviceFlag} pull "${remotePath}" "${localPath}"`);
  return { stdout, stderr };
};

export const pushPath = async (localPath: string, remotePath: string, deviceId?: string) => {
  const cmd = await getAdbCommand();
  const deviceFlag = deviceId ? `-s ${deviceId}` : '';
  const { stdout, stderr } = await execAsync(`${cmd} ${deviceFlag} push "${localPath}" "${remotePath}"`);
  return { stdout, stderr };
};

export const runAdbCommand = async (command: string, deviceId?: string) => {
  const cmd = await getAdbCommand();
  const deviceFlag = deviceId ? `-s ${deviceId}` : '';
  // Remove 'adb ' prefix from command if present to avoid double adb
  const cleanCommand = command.startsWith('adb ') ? command.substring(4) : command;
  const { stdout, stderr } = await execAsync(`${cmd} ${deviceFlag} ${cleanCommand}`);
  return { stdout, stderr };
};

export const installApp = async (
  apkPath: string, 
  deviceId?: string,
  onProgress?: (percent: number, speed?: number, eta?: number) => void
) => {
  const cmdRaw = await getAdbCommand();
  const cmd = cmdRaw.replace(/"/g, ''); // Remove quotes for spawn
  const deviceFlag = deviceId ? ['-s', deviceId] : [];
  const absoluteApkPath = path.resolve(apkPath);
  
  // 1. Generate a temporary remote name (no spaces)
  const remoteTempPath = `/data/local/tmp/temp_install_${Date.now()}.apk`;

  // Get APK size for ETA calculation
  let totalBytes = 100;
  try {
    totalBytes = fs.statSync(absoluteApkPath).size;
  } catch (e) { }

  const eta = new EtaEstimator(0.1, 0.2);

  // 2. Push APK to device
  const pushOutput = await new Promise<string>((resolve, reject) => {
    const args = [...deviceFlag, 'push', absoluteApkPath, remoteTempPath];
    const child = spawn(cmd, args);
    let output = '';

    const handleOutput = (data: any) => {
      const chunk = data.toString();
      output += chunk;
      
      const match = chunk.match(/\[\s*(\d+)%\]/);
      if (match && onProgress) {
        const percent = parseInt(match[1]);
        // Cap percent at 99 during push, since install phase takes time
        const displayPercent = Math.min(99, percent);
        const doneUnits = (percent / 100) * totalBytes;
        eta.update(totalBytes, doneUnits);
        
        onProgress(displayPercent, eta.getSpeed(), eta.getDisplayEta() || 0);
      }
    };

    child.stdout.on('data', handleOutput);
    child.stderr.on('data', handleOutput);

    child.on('close', (code) => {
      if (code === 0 && !output.includes('error:')) {
        resolve(output);
      } else {
        reject(new Error(`Failed to push APK: \n${output}`));
      }
    });

    child.on('error', (err) => reject(err));
  }).catch(e => e.message);

  if (typeof pushOutput === 'string' && (pushOutput.includes('error:') || pushOutput.includes('Failed to push APK'))) {
    return { success: false, stdout: '', stderr: pushOutput };
  }

  // Set progress to 99% during the install command execution (it freezes here naturally)
  if (onProgress) {
    onProgress(99, 0, 0); 
  }

  // 3. Install APK using pm install. Safe from quote stripping because there are no spaces in remoteTempPath
  const { stdout, stderr } = await runAdbCommand(`shell pm install -r -g ${remoteTempPath}`, deviceId);

  const isSuccess = stdout.includes('Success');

  // 4. Cleanup temp file
  await runAdbCommand(`shell rm ${remoteTempPath}`, deviceId).catch(() => {});

  if (isSuccess && onProgress) {
    onProgress(100, 0, 0);
  }

  return { 
    success: isSuccess, 
    stdout, 
    stderr 
  };
};

export const pushObb = async (
  obbDir: string, 
  pkg: string, 
  deviceId?: string, 
  onProgress?: (percent: number, speed?: number, eta?: number) => void
) => {
  const cmdRaw = await getAdbCommand();
  const cmd = cmdRaw.replace(/"/g, ''); // Remove quotes for spawn
  const deviceFlag = deviceId ? ['-s', deviceId] : [];
  const targetParent = '/storage/emulated/0/Android/obb/';
  
  const absoluteObbDir = path.resolve(obbDir);
  const targetPath = (targetParent + pkg).replace(/\\/g, '/'); // Ensure forward slashes for Android
  
  // Get folder size for ETA calculation
  let totalBytes = 100; // units are percentage by default
  const getDirSize = (dir: string): number => {
    let size = 0;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        size += getDirSize(fullPath);
      } else {
        size += fs.statSync(fullPath).size;
      }
    }
    return size;
  };

  try {
    totalBytes = getDirSize(absoluteObbDir);
  } catch (e: any) {
    console.warn(`[ADB] Could not calculate OBB dir size: ${e.message}`);
  }

  const eta = new EtaEstimator(0.1, 0.2);

  // Clean up existing OBB directory and recreate it (Rookie way)
  try {
    await execAsync(`${cmdRaw} ${deviceId ? `-s ${deviceId}` : ''} shell rm -rf "${targetPath}"`);
    await execAsync(`${cmdRaw} ${deviceId ? `-s ${deviceId}` : ''} shell mkdir -p "${targetPath}"`);
  } catch (e) {
    // Ignore errors if directory cleanup fails
  }

  return new Promise((resolve, reject) => {
    // Push the content of the local folder to the remote folder
    const args = [...deviceFlag, 'push', absoluteObbDir, targetParent];
    const child = spawn(cmd, args);

    let output = '';

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      
      const match = chunk.match(/(\d+)%/);
      if (match && onProgress) {
        const percent = parseInt(match[1]);
        const doneUnits = (percent / 100) * totalBytes;
        eta.update(totalBytes, doneUnits);
        
        onProgress(percent, eta.getSpeed(), eta.getDisplayEta() || 0);
      }
    });

    child.stderr.on('data', (data) => {
      console.error(`[ADB Push Error] ${data}`);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`ADB push failed with code ${code}. Output: ${output}`));
      }
    });
  });
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
