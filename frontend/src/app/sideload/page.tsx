'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import api from '@/lib/api';
import { useStore } from '@/store/useStore';
import { useTranslation } from '@/lib/i18n';
import { Card, CardContent, CardTitle, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Smartphone, HardDrive, Trash2, DownloadCloud, RefreshCw, FolderDown, AlertCircle, Layers, CheckCircle2, PackageSearch, X } from 'lucide-react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface LocalItem {
  name: string;
  packageName: string | null;
  isIndexed: boolean;
  status: 'predownload' | 'download' | 'concluido' | 'unindexed' | 'unknown';
}

export default function SideloadPage() {
  const { t } = useTranslation();
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [installingFolder, setInstallingFolder] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<{ 
    current: number, 
    total: number, 
    percent: number, 
    step?: number,
    name?: string, 
    message?: string,
    completed?: boolean,
    assetType?: 'apk' | 'obb'
  } | null>(null);
  const [finishedItem, setFinishedItem] = useState<{ name: string, success: boolean } | null>(null);
  const { downloadPath } = useStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    const socketUrl = `${window.location.protocol}//${window.location.hostname}:4000`;
    console.log(`[Socket] Connecting to ${socketUrl}...`);
    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected to backend on port 4000');
    });

    socket.on('adb_event', (data: any) => {
      console.log('[ADB Socket Event Received]', data);
      
      if (data.type === 'progress') {
           setInstallProgress({ 
             total: data.total, 
             current: data.current, 
             percent: 0,
             step: data.step,
             name: data.currentName,
             message: data.message,
             assetType: data.assetType
           });
           if (data.message) toast.info(data.message);
      } else if (data.type === 'finished') {
        const itemName = data.folderPath ? data.folderPath.split(/[\\/]/).pop() : t('common.app');
        setInstallingFolder(null);
        
        if (data.success) {
          // Mark as completed but keep visible for 5s
          setInstallProgress(prev => prev ? { ...prev, completed: true, step: 3 } : null);
          setTimeout(() => {
            setInstallProgress(null);
          }, 5000);
        } else {
          setInstallProgress(null);
          setFinishedItem({ name: itemName || t('common.app'), success: false });
        }
        
        if (data.success) {
          toast.success(t('sideload.install.installed'));
        } else {
          toast.error(t('common.error') + ': ' + (t('sideload.install.fail') || 'Falha na instalação.'));
        }
        queryClient.invalidateQueries({ queryKey: ['adb-apps', selectedDevice] });
      } else if (data.type === 'error') {
        setInstallingFolder(null);
        setInstallProgress(null);
        toast.error(t('common.error') + ': ' + data.message);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedDevice, queryClient, t]);

  const { data: devices = [], isLoading: loadingDevices, refetch: refetchDevices } = useQuery<string[]>({
    queryKey: ['adb-devices'],
    queryFn: async () => {
      const res = await api.get('/adb/devices');
      return res.data.devices;
    },
    refetchInterval: 5000
  });

  const { data: deviceInfo, isLoading: loadingApps } = useQuery<{ apps: string[], storage: any }>({
    queryKey: ['adb-apps', selectedDevice],
    queryFn: async () => {
      const res = await api.get('/adb/apps', { params: { deviceId: selectedDevice } });
      return res.data;
    },
    enabled: !!selectedDevice
  });

  const { data: localFolders = [], isLoading: loadingFolders } = useQuery<LocalItem[]>({
    queryKey: ['local-folders', downloadPath],
    queryFn: async () => {
      if (!downloadPath) return [];
      const res = await api.get('/filesystem/folders', { params: { path: downloadPath } });
      return res.data;
    },
    enabled: !!downloadPath
  });

  // Auto select first device if available
  if (devices.length > 0 && !selectedDevice) {
    setSelectedDevice(devices[0]);
  } else if (devices.length === 0 && selectedDevice) {
    setSelectedDevice(null);
  }

  const installedPackages = new Set(deviceInfo?.apps ?? []);

  const isInstalled = (item: LocalItem): boolean => {
    if (item.packageName && installedPackages.has(item.packageName)) return true;
    return false;
  };

  const formatSpeed = (speedBytes?: number) => {
    if (!speedBytes || speedBytes <= 0) return '';
    const mb = speedBytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB/s`;
  };

  const formatEta = (seconds?: number) => {
    if (seconds === undefined || seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const uninstallMutation = useMutation({
    mutationFn: async (pkg: string) => {
      const res = await api.post('/adb/uninstall', { pkg, deviceId: selectedDevice });
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('sideload.apps.uninstalled')); 
      queryClient.invalidateQueries({ queryKey: ['adb-apps', selectedDevice] });
    },
    onError: (error: any) => {
      toast.error(t('common.error') + ': ' + (error.response?.data?.error || t('sideload.apps.failUninstall')));
    }
  });

  const installMutation = useMutation({
    mutationFn: async (folderName: string) => {
      setInstallingFolder(folderName);
      setInstallProgress({ 
        total: 1, 
        current: 0, 
        percent: 0, 
        name: folderName, 
        step: 1,
        message: t('sideload.install.waiting') 
      });

      if (!downloadPath) throw new Error(t('sideload.install.noPath'));
      const fullPath = `${downloadPath}/${folderName}`;
      const res = await api.post('/adb/install', { folderPath: fullPath, deviceId: selectedDevice });
      return res.data;
    },
    onSuccess: () => {
      // toast.success(t('sideload.install.installed')); // Removido: agora via socket
      queryClient.invalidateQueries({ queryKey: ['adb-apps', selectedDevice] });
    },
    onError: (error: any) => {
      toast.error(t('common.error') + ': ' + (error.response?.data?.error || error.message));
    },
    onSettled: () => {
      // setInstallingFolder(null); // Agora controlado pelo socket
    }
  });

const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/filesystem/scan-local-downloads', { path: downloadPath });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(t('sideload.install.scanMatches', { count: data.matchedCount }));
      queryClient.invalidateQueries({ queryKey: ['local-folders'] });
      queryClient.invalidateQueries({ queryKey: ['games'] });
    },
    onError: (err: any) => toast.error(t('common.error') + ': ' + err.message)
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Smartphone className="h-8 w-8 text-primary" />
            {t('sideload.title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            {t('sideload.description')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${scanMutation.isPending ? 'animate-spin' : ''}`} />
            {t('sideload.updateStatus')}
          </Button>
          <Button variant="outline" onClick={() => refetchDevices()}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingDevices ? 'animate-spin' : ''}`} />
            {t('sideload.updateConnection')}
          </Button>
        </div>
      </div>
      
      {/* Barra de Progresso Global Flutuante */}
      <AnimatePresence>
        {installProgress && (
          <motion.div 
            initial={{ opacity: 0, x: -50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -100, scale: 0.8, transition: { duration: 0.5 } }}
            className="fixed bottom-6 left-6 z-50 w-[350px]"
          >
            <Card className={`backdrop-blur-md shadow-2xl transition-all duration-500 border-2 ${
              installProgress.completed 
                ? 'border-emerald-500/50 bg-emerald-500/10 shadow-emerald-500/20' 
                : 'border-primary/50 bg-card/95 shadow-primary/20'
            }`}>
              <CardContent className="pt-5 pb-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1 overflow-hidden">
                    <span className={`text-xs font-bold flex items-center gap-2 uppercase tracking-wider ${
                      installProgress.completed ? 'text-emerald-400' : 'text-indigo-400'
                    }`}>
                       {installProgress.completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <PackageSearch className="h-3.5 w-3.5" />}
                       {installProgress.completed 
                         ? t('sideload.install.finishedTitle') 
                         : (installProgress.assetType === 'obb' ? t('sideload.install.copying') : (installProgress.message || t('sideload.install.installing')))
                       }
                    </span>
                    <p className="text-[11px] text-muted-foreground font-mono truncate" title={installProgress.name || installingFolder || ''}>
                      {installProgress.name || installingFolder}
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 -mr-2 -mt-2 text-muted-foreground hover:text-foreground"
                    onClick={() => setInstallProgress(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-col gap-1">
                      {installProgress.completed ? (
                        <span className="text-lg font-black text-emerald-400 drop-shadow-sm animate-pulse">
                          {t('sideload.install.installed')}
                        </span>
                      ) : installProgress.step && (
                        <span className="text-lg font-black text-indigo-400 drop-shadow-sm">
                          {(() => {
                            if (installProgress.assetType === 'obb') {
                              if (installProgress.step === 1) {
                                // If it's a second OBB or more (not 1/total), we can use the specialized label if desired
                                // But simple logic: if current > 0 then it's at least the second asset.
                                // However, user specifically asked for "second OBB" logic if possible.
                                return t('sideload.install.phase1Obb');
                              }
                              return t('sideload.install.phase2').replace('3', '2'); // Fase 2/2
                            }
                            return t(`sideload.install.phase${installProgress.step}`);
                          })()}
                        </span>
                      )}
                   </div>
                   <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground pt-1">
                      <span>
                        {installProgress.assetType === 'obb' ? t('sideload.install.obb') : t('common.app')} {installProgress.current + 1} / {installProgress.total}
                      </span>
                      {installProgress.completed && (
                        <span className="text-emerald-500 animate-bounce">Syncing...</span>
                      )}
                   </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Aviso Extra de Conclusão */}
      <AlertDialog open={!!finishedItem} onOpenChange={(open) => !open && setFinishedItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {finishedItem?.success ? (
                <>
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  {t('sideload.install.finishedTitle')}
                </>
              ) : (
                <>
                  <AlertCircle className="h-6 w-6 text-rose-500" />
                  {t('sideload.install.failTitle')}
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {finishedItem ? (
                finishedItem.success 
                  ? t('sideload.install.successDesc', { name: finishedItem.name })
                  : t('sideload.install.failDesc', { name: finishedItem.name })
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setFinishedItem(null)} className={finishedItem?.success ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}>
              {t('sideload.install.understood')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Dispositivos Conectados */}
        <Card className="col-span-1 md:col-span-1 border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="text-emerald-500 h-5 w-5" />
              {t('sideload.connectionStatus.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingDevices ? (
              <Skeleton className="h-10 w-full" />
            ) : devices.length > 0 ? (
              <div className="space-y-2">
                {devices.map(dev => (
                  <Button 
                    key={dev} 
                    variant={selectedDevice === dev ? 'default' : 'outline'}
                    className="w-full justify-start font-mono"
                    onClick={() => setSelectedDevice(dev)}
                  >
                    <Smartphone className="h-4 w-4 mr-2" />
                    {dev}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mb-2 opacity-50 text-rose-500" />
                <p className="text-sm">{t('sideload.connectionStatus.noDevice')}</p>
                <p className="text-xs opacity-70 mt-1">{t('sideload.connectionStatus.noDeviceDesc')}</p>
              </div>
            )}

            {selectedDevice && deviceInfo?.storage && (
              <div className="mt-4 p-4 bg-muted/40 rounded-xl border border-border/50 space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-semibold text-muted-foreground">{t('sideload.connectionStatus.storage')}</span>
                  <span className="font-bold text-emerald-400">{deviceInfo.storage.free} {t('sideload.connectionStatus.free')}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground text-xs">{t('sideload.connectionStatus.total')}: {deviceInfo.storage.total}</span>
                  <span className="text-muted-foreground text-xs">{t('sideload.connectionStatus.usage')}: {deviceInfo.storage.percentage}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instalar Jogos Locais */}
        <Card className="col-span-1 md:col-span-2 border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-3 border-b border-border/30">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FolderDown className="text-sky-500 h-5 w-5" />
                {t('sideload.install.title')}
              </span>
              <Badge variant="secondary" className="font-normal">
                {localFolders.length} {t('sideload.install.found')}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-[400px] overflow-y-auto custom-scrollbar">
            {!downloadPath ? (
              <div className="p-8 text-center text-muted-foreground">
                {t('sideload.install.noPath')}
              </div>
            ) : loadingFolders ? (
              <div className="p-8 flex justify-center">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground/50" />
              </div>
            ) : localFolders.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {t('sideload.install.noGames')}
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {localFolders.map(item => {
                  const installed = isInstalled(item);
                    const isInstalling = installingFolder === item.name;
                    const isWaiting = installMutation.isPending && !isInstalling;
                    const isReady = item.status === 'concluido';
                    const isDownloading = item.status === 'download' || item.status === 'predownload';

                    return (
                      <div key={item.name} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 hover:bg-muted/30 transition-colors">
                        <div className="flex flex-col mb-2 sm:mb-0 mr-4 min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold line-clamp-1 truncate">{item.name}</span>
                            {isDownloading && (
                              <Badge variant="outline" className="text-[10px] h-4 bg-indigo-500/10 text-indigo-500 border-indigo-500/20 animate-pulse">
                                {t('sideload.install.inProgress')}
                              </Badge>
                            )}
                            {item.status === 'unindexed' && (
                              <Badge variant="outline" className="text-[10px] h-4 bg-amber-500/10 text-amber-500 border-amber-500/20">
                                {t('sideload.install.notIndexed')}
                              </Badge>
                            )}
                          </div>
                          {item.packageName && (
                            <span className="text-xs text-muted-foreground font-mono truncate">{item.packageName}</span>
                          )}
                        </div>

                        {installed ? (
                          <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-500/10 text-emerald-500 text-sm font-semibold border border-emerald-500/20">
                            <CheckCircle2 className="h-4 w-4" />
                            {t('sideload.install.installed')}
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-1">
                            <Button 
                              size="sm" 
                              onClick={() => installMutation.mutate(item.name)}
                              disabled={!selectedDevice || installMutation.isPending || !isReady}
                              className={`shrink-0 ${
                                isInstalling ? 'bg-indigo-600' : 
                                isWaiting ? 'bg-muted text-muted-foreground' : 
                                !isReady ? 'bg-muted/50 text-muted-foreground/50 border border-dashed border-border' :
                                'bg-sky-600 hover:bg-sky-700'
                              }`}
                              variant={!isReady ? 'ghost' : 'default'}
                            >
                              {isInstalling ? (
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <DownloadCloud className="h-4 w-4 mr-2" />
                              )}
                              {isInstalling ? t('sideload.install.installing') : isWaiting ? t('sideload.install.waiting') : isReady ? t('sideload.install.installOnQuest') : t('sideload.install.onHold')}
                            </Button>
                            {!isReady && !isDownloading && (
                              <span className="text-[9px] text-muted-foreground italic px-1">{t('sideload.install.indexToEnable')}</span>
                            )}
                            {isDownloading && (
                              <span className="text-[9px] text-indigo-500 italic px-1">{t('sideload.install.waitForCompletion')}</span>
                            )}
                          </div>
                        )}
                      </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Aplicativos Instalados */}
      <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
        <CardHeader className="pb-3 border-b border-border/30">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Layers className="text-indigo-500 h-5 w-5" />
              {t('sideload.apps.title')}
            </span>
            {deviceInfo && (
              <Badge variant="secondary" className="font-normal bg-indigo-500/10 text-indigo-400">
                {deviceInfo.apps.length} {t('sideload.apps.packagesDetected')}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 max-h-[500px] overflow-y-auto custom-scrollbar">
          {!selectedDevice ? (
            <div className="p-8 text-center text-muted-foreground">
              {t('sideload.apps.selectDevice')}
            </div>
          ) : loadingApps ? (
            <div className="p-8 flex justify-center">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground/50" />
            </div>
          ) : deviceInfo?.apps && deviceInfo.apps.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 divide-y sm:divide-y-0 sm:gap-px bg-border/30">
              {deviceInfo.apps.map(app => (
                <div key={app} className="flex justify-between items-center bg-card p-4">
                  <span className="font-mono text-xs truncate mr-4" title={app}>{app}</span>
                  <Button 
                    variant="destructive" 
                    size="icon"
                    className="h-8 w-8 shrink-0 hover:bg-rose-700"
                    onClick={() => {
                      if (confirm(t('sideload.apps.confirmUninstall').replace('{}', app))) {
                        uninstallMutation.mutate(app);
                      }
                    }}
                    disabled={uninstallMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              {t('sideload.apps.noApps')}
            </div>
          )}
        </CardContent>
      </Card>
      
    </div>
  );
}
