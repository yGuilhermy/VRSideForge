'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useStore } from '@/store/useStore';
import { useTranslation } from '@/lib/i18n';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, KeyRound, ServerOff, Database, Bot, RefreshCcw, LogIn, StopCircle, PlayCircle, FolderOpen, Languages, AlertTriangle, Zap, Globe } from 'lucide-react';
import { toast } from 'sonner';

import AdminPanel from '@/components/AdminPanel';
import AuthModal from '@/components/AuthModal';
import InventoryManager from '@/components/InventoryManager';

export default function Settings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { 
    offlineMode, setOfflineMode, 
    downloadPath, setDownloadPath,
    interfaceLanguage, setInterfaceLanguage,
    translationLanguage, setTranslationLanguage
  } = useStore();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const { data: sessionData, isLoading: sessionLoading } = useQuery<{ valid: boolean }>({
    queryKey: ['sessionValid'],
    queryFn: async () => (await api.get('/session/status')).data,
    refetchInterval: 10000,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
  });

  useEffect(() => {
    if (settings?.downloadPath) {
      setDownloadPath(settings.downloadPath);
    }
    if (settings?.translationLanguage) {
      setTranslationLanguage(settings.translationLanguage);
    }
    if (settings?.interfaceLanguage) {
      setInterfaceLanguage(settings.interfaceLanguage);
    }
    if (settings?.offlineMode !== undefined) {
      setOfflineMode(settings.offlineMode);
    }
  }, [settings, setDownloadPath, setTranslationLanguage, setInterfaceLanguage, setOfflineMode]);

  const { data: scraperStatus, refetch: refetchScraper } = useQuery<{
    isRunning: boolean;
    currentStatus: string;
    captchaRequested: boolean;
    captchaData: any;
  }>({
    queryKey: ['scraperStatus'],
    queryFn: async () => (await api.get('/scraper/status')).data,
    refetchInterval: 3000,
  });

  const authMutation = useMutation({
    mutationFn: () => api.get('/session/validate'),
    onSuccess: (res) => {
      toast.success(res.data.message || t('settings.forumSession.active'));
      queryClient.invalidateQueries({ queryKey: ['sessionValid'] });
    },
    onError: () => toast.error(t('common.error')),
  });

  const startScraper = useMutation({
    mutationFn: () => api.post('/scraper/start'),
    onSuccess: () => {
      toast.success(t('settings.indexer.title') + ' ' + t('common.started'));
      refetchScraper();
    },
  });

  const stopScraper = useMutation({
    mutationFn: () => api.post('/scraper/stop'),
    onSuccess: () => {
      toast.success(t('settings.indexer.title') + ' ' + t('common.stopped'));
      refetchScraper();
    },
  });
  
  const saveSettings = useMutation({
    mutationFn: (data: { downloadPath?: string, translationLanguage?: string, interfaceLanguage?: string, offlineMode?: boolean }) => api.post('/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success(t('settings.syncSuccess'));
    },
    onError: (err: any) => toast.error(err.response?.data?.error || t('settings.syncError')),
  });

  const handleSavePath = () => {
    saveSettings.mutate({ downloadPath });
  };

  const handleTranslationLanguageChange = (val: string) => {
    setTranslationLanguage(val);
    saveSettings.mutate({ translationLanguage: val });
  };

  const handleInterfaceLanguageChange = (val: 'pt' | 'en') => {
    setInterfaceLanguage(val);
    saveSettings.mutate({ interfaceLanguage: val });
  };

  const handleOfflineModeChange = (val: boolean) => {
    setOfflineMode(val);
    saveSettings.mutate({ offlineMode: val });
  };

  const updateCheck = useMutation({
    mutationFn: async () => (await api.get('/update/check')).data,
    onSuccess: (data) => {
      if (data.available) {
        toast.info(t('home.update.available'), {
          description: t('home.update.description', { version: data.remoteVersion }),
          icon: <Zap className="h-4 w-4 text-primary animate-pulse" />,
          duration: 15000,
          action: {
            label: t('home.update.view'),
            onClick: () => window.open(data.githubUrl, '_blank')
          }
        });
      } else {
        toast.success(t('home.update.upToDate'), {
          icon: <Zap className="h-4 w-4 text-emerald-500" />,
          duration: 3000
        });
      }
    },
    onError: () => toast.error(t('common.error'))
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">{t('settings.title')}</h1>
        <p className="text-muted-foreground">{t('settings.description')}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Idioma */}
        <Card className="border-border/50 bg-card/60 backdrop-blur md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Languages className="h-5 w-5 text-indigo-500" /> {t('settings.language.title')}
            </CardTitle>
            <CardDescription>{t('settings.language.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex-1 space-y-2">
                <Label>{t('settings.language.interface.label')}</Label>
                <Select value={interfaceLanguage} onValueChange={handleInterfaceLanguageChange}>
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt">Português (Brasil)</SelectItem>
                    <SelectItem value="en">English (US)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('settings.language.interface.description')}</p>
              </div>
              <div className="flex-1 space-y-2">
                <Label>{t('settings.language.translation.label')}</Label>
                <Select value={translationLanguage} onValueChange={handleTranslationLanguageChange}>
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt">Português (Brasil)</SelectItem>
                    <SelectItem value="en">English (US)</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="ru">Русский (Original)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('settings.language.translation.description')}</p>
              </div>
            </div>

            <Alert className="bg-amber-500/10 border-amber-500/50">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertTitle>{t('common.status')}</AlertTitle>
              <AlertDescription className="text-sm">
                {t('settings.language.translation.warning')}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Sessão */}
        <Card className="border-border/50 bg-card/60 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> {t('settings.forumSession.title')}
            </CardTitle>
            <CardDescription>
              {t('settings.forumSession.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sessionLoading ? (
              <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}</div>
            ) : sessionData?.valid ? (
              <div className="flex items-center text-green-500 font-medium gap-2 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div> {t('settings.forumSession.active')}
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertTitle>{t('settings.forumSession.invalid')}</AlertTitle>
                <AlertDescription>{t('settings.forumSession.invalidDescription')}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter>
            <Button 
              onClick={() => setAuthModalOpen(true)} 
              variant={sessionData?.valid ? 'secondary' : 'default'}
              className="w-full sm:w-auto font-bold shadow-sm"
            >
              <LogIn className="h-4 w-4 mr-2" />
              {sessionData?.valid ? t('settings.forumSession.reauthenticate') : t('settings.forumSession.login')}
            </Button>
          </CardFooter>
        </Card>

        {/* Offline Mode */}
        <Card className="border-border/50 bg-card/60 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ServerOff className="h-5 w-5 text-amber-500" /> {t('settings.offlineMode.title')}
            </CardTitle>
            <CardDescription>
              {t('settings.offlineMode.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Label htmlFor="offline-mode" className="text-base font-medium cursor-pointer">
              {t('settings.offlineMode.label')}
            </Label>
              <Switch
                id="offline-mode"
                checked={offlineMode}
                onCheckedChange={handleOfflineModeChange}
                className="data-[state=checked]:bg-amber-500"
              />
          </CardContent>
          <CardFooter>
            <p className="text-sm text-muted-foreground">
              {t('settings.offlineMode.footer')}
            </p>
          </CardFooter>
        </Card>

        {/* Pasta de Downloads */}
        <Card className="border-border/50 bg-card/60 backdrop-blur md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-emerald-500" /> {t('settings.downloadPath.title')}
            </CardTitle>
            <CardDescription>
              {t('settings.downloadPath.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="download-path">{t('settings.downloadPath.label')}</Label>
                <div className="flex gap-2">
                  <Input 
                    id="download-path" 
                    value={downloadPath} 
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDownloadPath(e.target.value)} 
                    onBlur={handleSavePath}
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePath()}
                    placeholder={t('settings.downloadPath.placeholder')} 
                    className="bg-background border-border"
                  />
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleSavePath}
                    disabled={saveSettings.isPending}
                    className="shrink-0"
                  >
                    {saveSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('settings.downloadPath.footer')}
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t border-border/50 pt-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="flex items-center gap-2">
               <Zap className="h-4 w-4 text-primary" />
               <span className="text-sm font-medium">Software: v0.1.7</span>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => updateCheck.mutate()}
              disabled={updateCheck.isPending}
              className="gap-2 border-primary/20 hover:border-primary/50"
            >
              {updateCheck.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              {t('settings.checkUpdates')}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Indexador */}
      <Card className="border-border/50 bg-card/60 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-500" /> {t('settings.indexer.title')}
          </CardTitle>
          <CardDescription>
            {t('settings.indexer.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-muted/50 p-4 rounded-lg border border-border">
            <div>
              <p className="font-semibold text-lg flex items-center gap-2">
                {t('settings.indexer.status')}: 
                <span className={scraperStatus?.isRunning ? 'text-green-500' : 'text-muted-foreground'}>
                  {scraperStatus?.isRunning ? t('common.running') : t('common.stopped')}
                </span>
                {scraperStatus?.isRunning && <Loader2 className="h-4 w-4 animate-spin text-green-500" />}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('settings.indexer.activity')}: {scraperStatus?.currentStatus || t('settings.indexer.none')}
              </p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              {scraperStatus?.isRunning ? (
                <Button onClick={() => stopScraper.mutate()} variant="destructive" className="w-full sm:w-auto font-bold group">
                  <StopCircle className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" /> {t('common.stop')}
                </Button>
              ) : (
                <Button onClick={() => startScraper.mutate()} className="w-full sm:w-auto font-bold bg-green-600 hover:bg-green-700 text-white group" disabled={offlineMode}>
                  <PlayCircle className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" /> {t('common.start')}
                </Button>
              )}
            </div>
          </div>

          {scraperStatus?.captchaRequested && (
            <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
              <AlertTriangle className="h-4 w-4 text-destructive mr-2" />
              <AlertTitle className="flex items-center font-bold">{t('settings.indexer.captchaTitle')}</AlertTitle>
              <AlertDescription className="mt-2 text-sm">
                <p className="mb-4">{t('settings.indexer.captchaDescription')}</p>
                <Button variant="outline" className="w-full bg-background mt-4">{t('settings.indexer.solveManual')}</Button>
              </AlertDescription>
            </Alert>
          )}

        </CardContent>
        <CardFooter className="bg-muted/30 border-t border-border/50 pt-4 flex justify-between items-center">
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <RefreshCcw className="h-3 w-3" /> {t('settings.indexer.footer')}
          </div>
        </CardFooter>
      </Card>
      
      <InventoryManager />
      <AdminPanel />
      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
    </div>
  );
}
