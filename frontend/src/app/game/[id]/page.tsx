'use client';

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import api from '@/lib/api';
import { useStore } from '@/store/useStore';
import { useTranslation } from '@/lib/i18n';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Languages, Download, ArrowLeft, ExternalLink, HardDriveDownload, ImageOff, Server, Pause, Play, Trash2, XCircle, Activity, RefreshCw, Info, Database, Heart, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface GameDetail {
  id: number;
  title: string;
  description: string;
  translated_description: string | null;
  magnet: string;
  post_url: string;
  tags: string;
  size: string;
  image_url: string;
  seeds: number;
  leeches: number;
  registered_at: string;
  torrent_downloads: number;
  isLocalDownload?: boolean;
  localPath?: string;
  wishlist?: number;
  translated_title?: string;
}

export default function GamePage() {
  const { id } = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { downloadPath } = useStore();
  const [showTranslated, setShowTranslated] = React.useState(true);

  const translateTag = (tag: string) => {
    const tagMap: Record<string, string> = {
      'Головоломки': 'Puzzle',
      'Ритм': 'Ritmo',
      'Экшен': 'Ação',
      'Аркады': 'Arcade',
      'Спорт': 'Esporte',
      'Настольные': 'Tabuleiro',
      'Стратегии': 'Estratégia',
      'Гonki': 'Corrida',
      'Симуляторы': 'Simulação',
      'Шутеры': 'Tiro',
      'Файтинги': 'Luta',
      'Ролевые игры': 'RPG',
      'Приключенческие': 'Aventura',
      'Платформеры': 'Plataforma',
      'Песочница': 'Sandbox',
      'Медициna': 'Medicina',
      'Обучение': 'Educação',
      'Смешанная реальность': 'Realidade Mista',
      'Мультиплеер': 'Multijogador',
      'Казуальные': 'Casual',
      'Музыка и ритm': 'Música e Ritmo',
      'Путешествия и исследования': 'Exploração',
      'Практика': 'Prática',
      'Игры para вечеринки': 'Festa',
      'Симуляторы выживания': 'Sobrevivência',
      'Социальные приложения': 'Social',
      'Образ жизни': 'Estilo de Vida',
      'Творчество и дизайн': 'Criação e Design',
      'Производительность': 'Produtividade',
      'Медиа и трансляции': 'Mídia e Transmissão',
      'Утилиты': 'Utilitários',
      'Нарративные игры': 'Jogos Narrativos',
      'Мультипликация': 'Animação',
      'Семья': 'Família',
      'Эксперименты': 'Experimentos',
      'Искусство и творчество': 'Arte e Criatividade',
      'Образование': 'Educação',
      'Расслабление и медитация': 'Relaxamento e Meditação',
      'Полет': 'Voo',
      'Здоровье и фитнес': 'Saúde e Fitness',
    };
    const cleanTag = tag.replace(/\[|\]/g, '').trim();
    if (cleanTag.includes(',')) {
      return cleanTag.split(',').map(part => {
        const trimmed = part.trim();
        return tagMap[trimmed] || trimmed;
      }).join(', ');
    }
    return tagMap[cleanTag] || cleanTag;
  };

  const { data: torrents = [] } = useQuery<any[]>({
    queryKey: ['torrents'],
    queryFn: async () => (api.get('/torrent/status').then(res => res.data)),
    refetchInterval: 5000,
  });

  React.useEffect(() => {
    const socket = io();
    
    socket.on('torrent_status_update', () => {
      queryClient.invalidateQueries({ queryKey: ['torrents'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const { data: game, isLoading, isError } = useQuery<GameDetail>({
    queryKey: ['game', id],
    queryFn: async () => {
      const res = await api.get(`/games/${id}`, { params: { path: downloadPath } });
      return res.data;
    },
  });

  const translateMutation = useMutation({
    mutationFn: () => api.post(`/translate/${id}`),
    onSuccess: (res) => {
      toast.success(t('game.description.translationDone'));
      queryClient.setQueryData(['game', id], (old: any) => ({
        ...old,
        translated_description: res.data.translated_description,
        translated_title: res.data.translated_title,
      }));
    },
    onError: () => toast.error(t('game.description.translationFailed')),
  });

  const qbitMutation = useMutation({
    mutationFn: () => api.post('/torrent/download', { magnet: game?.magnet, gameId: game?.id }),
    onSuccess: () => {
      toast.success(`${t('common.status')}: Download iniciado!`);
      // Força refetch imediato para pegar o estado predownload
      queryClient.invalidateQueries({ queryKey: ['torrents'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || t('common.error')),
  });

  const qbitAction = useMutation({
    mutationFn: (action: string) => {
      // Busca pelo gameId — garantido pelo novo torrent/status
      const active = torrents.find((t: any) => t.gameId === game?.id);
      if (!active) throw new Error('Torrent não encontrado');
      return api.post('/torrent/action', { hash: active.hash, action });
    },
    onSuccess: () => {
      toast.success(t('common.save'));
      queryClient.invalidateQueries({ queryKey: ['torrents'] });
    },
    onError: (err: any) => toast.error(err.message || t('common.error')),
  });

  const updateMutation = useMutation({
    mutationFn: (full: boolean) => api.post(`/games/${id}/update`, { full }),
    onSuccess: (res) => {
      toast.success(res.data.seeds !== undefined ? t('game.stats.updateData') : t('game.stats.fullRebuild'));
      queryClient.setQueryData(['game', id], res.data);
    },
    onError: () => toast.error(t('common.error')),
  });

  const wishlistMutation = useMutation({
    mutationFn: (wishlist: boolean) => api.post(`/games/${id}/wishlist`, { wishlist }),
    onSuccess: (res) => {
      toast.success(res.data.wishlist ? t('game.wishlist.added') : t('game.wishlist.removed'));
      queryClient.setQueryData(['game', id], (old: any) => ({ ...old, wishlist: res.data.wishlist ? 1 : 0 }));
    },
  });

  const { data: devices = [] } = useQuery<string[]>({
    queryKey: ['adb-devices'],
    queryFn: async () => {
      const res = await api.get('/adb/devices');
      return res.data.devices;
    },
    refetchInterval: 5000
  });

  const installMutation = useMutation({
    mutationFn: async (localPathString: string) => {
      if (!downloadPath) throw new Error("Caminho de download não configurado.");
      const selectedDevice = devices.length > 0 ? devices[0] : null;
      if (!selectedDevice) throw new Error("Nenhum dispositivo VR detectado via USB.");
      
      const fullPath = `${downloadPath}\\${localPathString}`;
      const res = await api.post('/adb/install', { folderPath: fullPath, deviceId: selectedDevice });
      return res.data;
    },
    onSuccess: () => toast.success(t('sideload.install.installed')),
    onError: (error: any) => toast.error(t('common.error') + ': ' + (error.response?.data?.error || error.message))
  });

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
        <div className="grid md:grid-cols-3 gap-6">
          <Skeleton className="h-64 md:col-span-2 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !game) {
    return (
      <div className="text-center p-12 max-w-lg mx-auto bg-card rounded-xl border border-destructive/20 shadow-lg mt-10">
        <h2 className="text-2xl font-bold text-destructive mb-4">{t('game.notFound')}</h2>
        <Button onClick={() => router.push('/')}>{t('game.backHome')}</Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 relative">
      {/* Indicador de Instalação Global */}
      {installMutation.isPending && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-10 pointer-events-none">
          <Card className="bg-indigo-600/90 text-white backdrop-blur-md border-none shadow-2xl p-4 flex items-center gap-4 w-72">
            <div className="bg-white/20 p-2 rounded-full">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold uppercase tracking-wider">{t('game.sideloading')}</p>
              <p className="text-xs text-indigo-100/80">{t('game.installingOnQuest')}</p>
              <div className="w-full bg-black/20 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-white h-full w-full animate-progress-loading origin-left"></div>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Link href="/" className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors group">
        <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" /> {t('game.back')}
      </Link>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Imagem Cover */}
        <div className="w-full md:w-1/3 shrink-0">
          <Card className="overflow-hidden border-border/50 bg-card/40 backdrop-blur-md shadow-2xl relative group p-0 gap-0 rounded-3xl">
            <div className="aspect-[3/4] sm:aspect-video md:aspect-[3/4] w-full bg-muted flex items-center justify-center">
              {game.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={game.image_url}
                  alt={game.title}
                  className="object-cover w-full h-full"
                />
              ) : (
                <ImageOff className="h-16 w-16 text-muted-foreground/30" />
              )}
            </div>
            
            <CardContent className="p-4 flex flex-col gap-4">
              {(() => {
                // Busca por gameId diretamente — não depende de nome normalizado
                const active = torrents.find((t: any) => t.gameId === game.id);
                
                const progressNumber = active ? parseFloat(active.progress) : 0;
                const isDownloaded = (game.isLocalDownload && progressNumber === 0) || progressNumber >= 99.9;
                const isPredownloading = active?.state === 'predownload';
                
                return (
                  <div className="flex flex-col gap-3">
                    <Button 
                      className={`w-full font-bold h-auto py-4 flex flex-col items-center gap-1 group shadow-lg transition-all transform hover:scale-[1.02] ${
                        isDownloaded 
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20' 
                          : isPredownloading
                            ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/20'
                            : active 
                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20'
                              : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                      }`}
                      size="lg"
                      onClick={() => {
                        if (!isDownloaded && !active) qbitMutation.mutate();
                      }}
                      disabled={qbitMutation.isPending || active}
                    >
                      <div className="flex items-center gap-2">
                        {isDownloaded ? <HardDriveDownload className="h-5 w-5" /> : active ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Server className="h-5 w-5" />}
                        <span className="text-lg">
                          {isDownloaded ? t('game.downloadStatus.finished') : isPredownloading ? t('game.downloadStatus.predownload') : active ? `${t('game.downloadStatus.downloading')} ${active.progress}%` : t('game.downloadStatus.downloadServer')}
                        </span>
                      </div>
                      {active && !isDownloaded && (
                        <div className="w-full bg-white/20 h-1.5 rounded-full mt-2 overflow-hidden">
                          <div 
                            className="bg-white h-full transition-all duration-1000" 
                            style={{ width: `${active.progress}%` }}
                          ></div>
                        </div>
                      )}
                    </Button>

                    {isDownloaded && game.localPath && (
                      <Button 
                        variant="default"
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-12 gap-2 animate-in slide-in-from-bottom-2 duration-500"
                        onClick={() => installMutation.mutate(game.localPath!)}
                        disabled={installMutation.isPending || devices.length === 0}
                      >
                        {installMutation.isPending ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Smartphone className="h-5 w-5" />
                        )}
                        {devices.length === 0 ? t('game.actions.connectQuest') : t('game.actions.installOnQuest')}
                      </Button>
                    )}

                    {!active && !isDownloaded && (
                      <Button 
                        variant="outline" 
                        className="w-full border-border/50 hover:bg-muted font-semibold"
                        onClick={() => window.open(game.magnet, '_self')}
                      >
                        <Download className="mr-2 h-4 w-4" /> {t('game.downloadStatus.downloadLocal')}
                      </Button>
                    )}

                    {active && (
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                          onClick={() => qbitAction.mutate('delete')}
                          title={t('game.actions.remove')}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          className="col-span-2 flex gap-2"
                          onClick={() => {
                            if(confirm(t('game.actions.deleteConfirm'))) {
                              qbitAction.mutate('delete_drive');
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" /> {t('game.actions.deleteFiles')}
                        </Button>
                      </div>
                    )}

                    <Button variant="ghost" className="w-full text-xs text-muted-foreground hover:bg-transparent hover:text-foreground" onClick={() => window.open(game.post_url, '_blank')}>
                      <ExternalLink className="mr-2 h-3 w-3" /> {t('game.actions.viewPost')}
                    </Button>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        {/* Detalhes */}
        <div className="flex-1 space-y-6">
          <div>
            <div className="flex flex-wrap gap-2 mb-3">
              {game.tags.split(',').map(tag => (
                <Badge key={tag} variant="secondary" className="bg-secondary/50 backdrop-blur shrink-0 rounded-full px-3 py-1 font-bold">
                  {showTranslated ? translateTag(tag.trim()) : tag.trim()}
                </Badge>
              ))}
              <Badge variant="outline" className="shrink-0 flex items-center gap-1.5 border-primary/30 text-primary bg-primary/5 rounded-full px-3 py-1 font-black">
                <HardDriveDownload className="h-3.5 w-3.5" /> {game.size}
              </Badge>
            </div>
            
            <div className="flex flex-wrap gap-2 mb-2">
              {((showTranslated && game.translated_title ? game.translated_title : game.title).match(/\[.*?\]/g) || []).map((m, i) => (
                <Badge key={i} variant="outline" className="border-border/60 text-muted-foreground bg-muted/30 uppercase text-[10px] font-black rounded-full px-2 py-0.5 tracking-tighter">
                  {showTranslated ? translateTag(m) : m.replace(/\[|\]/g, '')}
                </Badge>
              ))}
              {game.wishlist === 1 && (
                <Badge className="bg-rose-500 text-white border-none animate-in zoom-in-50 rounded-full px-3 py-1 font-black shadow-lg shadow-rose-500/20">{t('game.wishlist.title')}</Badge>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 border-b border-border/30 pb-4 mb-2">
              <div className="flex flex-col flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="font-mono text-[10px] py-0 px-2 border-indigo-500/30 text-indigo-500/70 bg-indigo-500/5">Game ID: {game.id}</Badge>
                </div>
                <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/70">
                  {(showTranslated && game.translated_title ? game.translated_title : game.title).replace(/\[.*?\]/g, '').trim()}
                </h1>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className={`rounded-2xl h-14 w-14 transition-all duration-300 ${game.wishlist === 1 ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}
                onClick={() => wishlistMutation.mutate(!(game.wishlist === 1))}
                disabled={wishlistMutation.isPending}
              >
                <Heart className={`h-8 w-8 ${game.wishlist === 1 ? 'fill-current' : ''}`} />
              </Button>
            </div>

            {game.isLocalDownload && (
              <div className="flex items-center gap-2 text-emerald-500 font-bold mb-4 animate-in slide-in-from-left-4 duration-500">
                <div className="bg-emerald-500/10 p-2 rounded-xl">
                  <HardDriveDownload className="h-5 w-5" />
                </div>
                <span>{t('game.installed')}</span>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {/* Torrent Stats Bar */}
            <div className="flex flex-wrap gap-4 p-4 bg-card/30 backdrop-blur border border-border/40 rounded-2xl shadow-inner scrollbar-hide overflow-x-auto">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-muted-foreground/60 mb-0.5">{t('game.stats.seeds')}</span>
                <span className="text-emerald-400 font-mono text-lg flex items-center gap-1.5">
                  <Activity className="h-4 w-4" /> {game.seeds}
                </span>
              </div>
              <div className="w-[1px] bg-border/40 h-10 self-center hidden sm:block"></div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-muted-foreground/60 mb-0.5">{t('game.stats.leeches')}</span>
                <span className="text-amber-400 font-mono text-lg">
                  {game.leeches}
                </span>
              </div>
              <div className="w-[1px] bg-border/40 h-10 self-center hidden sm:block"></div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-muted-foreground/60 mb-0.5">{t('game.stats.downloads')}</span>
                <span className="text-foreground/80 font-mono text-lg">
                  {game.torrent_downloads} <span className="text-xs text-muted-foreground">x</span>
                </span>
              </div>
              <div className="w-[1px] bg-border/40 h-10 self-center hidden sm:block"></div>
              <div className="flex items-center">
                <Popover>
                  <PopoverTrigger
                    className="h-10 text-muted-foreground hover:text-primary hover:bg-primary/5 gap-2 px-3 rounded-xl border border-dashed border-border/40 inline-flex items-center justify-center shrink-0 font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                    disabled={updateMutation.isPending}
                  >
                    <RefreshCw className={`h-4 w-4 ${updateMutation.isPending ? 'animate-spin' : ''}`} />
                    <span className="text-[10px] uppercase font-bold">{t('game.stats.updateData')}</span>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3 bg-card/90 backdrop-blur border-border/50 rounded-2xl shadow-2xl" side="top" align="end">
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1 mb-2">{t('game.stats.selectMode')}</p>
                      
                      <button 
                        onClick={() => updateMutation.mutate(false)}
                        className="w-full flex items-start gap-3 p-2 rounded-xl hover:bg-primary/10 transition-colors text-left group"
                      >
                        <div className="bg-emerald-500/20 p-2 rounded-lg text-emerald-500 group-hover:scale-110 transition-transform">
                          <Info className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{t('game.stats.statsOnly')}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight">{t('game.stats.statsOnlyDesc')}</p>
                        </div>
                      </button>

                      <button 
                        onClick={() => {
                          if(confirm(t('game.stats.rebuildConfirm'))) {
                            updateMutation.mutate(true);
                          }
                        }}
                        className="w-full flex items-start gap-3 p-2 rounded-xl hover:bg-amber-500/10 transition-colors text-left group"
                      >
                        <div className="bg-amber-500/20 p-2 rounded-lg text-amber-500 group-hover:scale-110 transition-transform">
                          <Database className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{t('game.stats.fullRebuild')}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight">{t('game.stats.fullRebuildDesc')}</p>
                        </div>
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <Card className="border-border/50 bg-card/40 backdrop-blur p-6 rounded-3xl shadow-lg relative overflow-hidden">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold flex items-center gap-2">
                  <Languages className="h-6 w-6 text-indigo-500" /> {t('game.description.title')}
                </h3>
                
                <div className="flex gap-2">
                  {!game.translated_description ? (
                    <Button 
                      variant="default" 
                      size="sm" 
                      onClick={() => translateMutation.mutate()}
                      disabled={translateMutation.isPending}
                      className="bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20 shadow-lg"
                    >
                      {translateMutation.isPending ? t('game.description.translating') : t('game.description.translateNow')}
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowTranslated(!showTranslated)}
                      className="border-border/60 hover:bg-muted"
                    >
                      {showTranslated ? t('game.description.viewOriginal') : t('game.description.viewTranslation')}
                    </Button>
                  )}
                </div>
              </div>
              
              <div className="text-foreground/90 whitespace-pre-wrap leading-relaxed text-lg font-medium selection:bg-indigo-500/30">
                {showTranslated && game.translated_description ? (
                  game.translated_description
                ) : (
                  <span className="font-normal opacity-80">{game.description}</span>
                )}
              </div>

              {!game.translated_description && (
                <div className="mt-6 text-muted-foreground italic flex flex-col items-center justify-center py-10 text-center bg-muted/20 rounded-2xl border border-dashed border-border/50">
                  <Languages className="h-12 w-12 text-muted-foreground/20 mb-3" />
                  <p className="text-lg">{t('game.description.russianPost')}</p>
                  <p className="text-sm opacity-60">{t('game.description.clickTranslate')}</p>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
