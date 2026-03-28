'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useStore } from '@/store/useStore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, KeyRound, ServerOff, Database, Bot, RefreshCcw, LogIn, StopCircle, PlayCircle, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';

import AdminPanel from '@/components/AdminPanel';
import AuthModal from '@/components/AuthModal';

export default function Settings() {
  const queryClient = useQueryClient();
  const { offlineMode, setOfflineMode, downloadPath, setDownloadPath } = useStore();
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
  }, [settings, setDownloadPath]);

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
      toast.success(res.data.message || 'Sessão validada');
      queryClient.invalidateQueries({ queryKey: ['sessionValid'] });
    },
    onError: () => toast.error('Falha ao validar sessão'),
  });

  const startScraper = useMutation({
    mutationFn: () => api.post('/scraper/start'),
    onSuccess: () => {
      toast.success('Indexador iniciado');
      refetchScraper();
    },
  });

  const stopScraper = useMutation({
    mutationFn: () => api.post('/scraper/stop'),
    onSuccess: () => {
      toast.success('Indexador parado');
      refetchScraper();
    },
  });
  const saveSettings = useMutation({
    mutationFn: (newPath: string) => api.post('/settings', { downloadPath: newPath }),
    onSuccess: () => toast.success('Caminho de download sincronizado!'),
    onError: (err: any) => toast.error(err.response?.data?.error || 'Erro ao sincronizar diretório'),
  });

  const handleSavePath = () => {
    saveSettings.mutate(downloadPath);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Configurações</h1>
        <p className="text-muted-foreground">Gerencie o scraping, a sessão do fórum e preferências.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Sessão */}
        <Card className="border-border/50 bg-card/60 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> Sessão do Fórum
            </CardTitle>
            <CardDescription>
              Acesso ao fórum fonte. Necessário para indexar e buscar informações não-públicas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sessionLoading ? (
              <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Verificando...</div>
            ) : sessionData?.valid ? (
              <div className="flex items-center text-green-500 font-medium gap-2 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div> Sessão Ativa
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertTitle>Sessão Inválida</AlertTitle>
                <AlertDescription>Inicie a autenticação para abrir o navegador e fazer login manualmente.</AlertDescription>
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
              {sessionData?.valid ? 'Re-autenticar' : 'Fazer Login (Background)'}
            </Button>
          </CardFooter>
        </Card>

        {/* Offline Mode */}
        <Card className="border-border/50 bg-card/60 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ServerOff className="h-5 w-5 text-amber-500" /> Modo Offline
            </CardTitle>
            <CardDescription>
              Desativa todas as requisições ao fórum externo. Útil para navegação puramente local.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Label htmlFor="offline-mode" className="text-base font-medium cursor-pointer">
              Ativar Modo Offline
            </Label>
            <Switch
              id="offline-mode"
              checked={offlineMode}
              onCheckedChange={setOfflineMode}
              className="data-[state=checked]:bg-amber-500"
            />
          </CardContent>
          <CardFooter>
            <p className="text-sm text-muted-foreground">
              Quando ativado, o app navegará mais rápido usando apenas o banco de dados.
            </p>
          </CardFooter>
        </Card>

        {/* Pasta de Downloads */}
        <Card className="border-border/50 bg-card/60 backdrop-blur md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-emerald-500" /> Diretório de Downloads
            </CardTitle>
            <CardDescription>
              Pasta onde o servidor irá salvar os jogos e verificar arquivos existentes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="download-path">Caminho da Pasta (Windows ou Linux)</Label>
                <div className="flex gap-2">
                  <Input 
                    id="download-path" 
                    value={downloadPath} 
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDownloadPath(e.target.value)} 
                    onBlur={handleSavePath}
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePath()}
                    placeholder="E:\VRGames" 
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
                  O sistema criará um arquivo <code className="text-primary">.index.json</code> nesta pasta para validação automática.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Indexador */}
      <Card className="border-border/50 bg-card/60 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-500" /> Indexador Automático (Worker)
          </CardTitle>
          <CardDescription>
            Controle o processo automatizado de busca e extração de jogos do fórum.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-muted/50 p-4 rounded-lg border border-border">
            <div>
              <p className="font-semibold text-lg flex items-center gap-2">
                Status: 
                <span className={scraperStatus?.isRunning ? 'text-green-500' : 'text-muted-foreground'}>
                  {scraperStatus?.isRunning ? 'Executando' : 'Parado'}
                </span>
                {scraperStatus?.isRunning && <Loader2 className="h-4 w-4 animate-spin text-green-500" />}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Atividade atual: {scraperStatus?.currentStatus || 'Nenhuma'}
              </p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              {scraperStatus?.isRunning ? (
                <Button onClick={() => stopScraper.mutate()} variant="destructive" className="w-full sm:w-auto font-bold group">
                  <StopCircle className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" /> Parar
                </Button>
              ) : (
                <Button onClick={() => startScraper.mutate()} className="w-full sm:w-auto font-bold bg-green-600 hover:bg-green-700 text-white group" disabled={offlineMode}>
                  <PlayCircle className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" /> Iniciar
                </Button>
              )}
            </div>
          </div>

          {scraperStatus?.captchaRequested && (
            <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
              <AlertTitle className="flex items-center font-bold">Atenção! Captcha Necessário</AlertTitle>
              <AlertDescription className="mt-2">
                <p className="mb-4">O anti-bot do fórum foi ativado. Por favor, resolva o captcha para continuar.</p>
                {/* Normally we'd render the image: <img src={scraperStatus.captchaData.imageUrl} /> */}
                <Button variant="outline" className="w-full bg-background mt-4">Resolver Manualmente (Abrir Pop-up)</Button>
              </AlertDescription>
            </Alert>
          )}

        </CardContent>
        <CardFooter className="bg-muted/30 border-t border-border/50 pt-4 flex justify-between items-center">
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <RefreshCcw className="h-3 w-3" /> Atualização inteligente
          </div>
        </CardFooter>
      </Card>
      
      <AdminPanel />
      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
    </div>
  );
}
