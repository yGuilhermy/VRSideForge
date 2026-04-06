'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import api from '@/lib/api';
import { useStore } from '@/store/useStore';
import { useTranslation } from '@/lib/i18n';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Search, HardDriveDownload, ImageOff, ChevronLeft, ChevronRight, Heart, RefreshCw, Filter, Globe, Languages, Activity, Folder, LayoutDashboard, Users, Zap, SortAsc, CheckCircle2, AlertCircle, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface Game {
  id: number;
  title: string;
  tags: string;
  size: string;
  image_url: string;
  post_url: string;
  isLocalDownload?: boolean;
  wishlist?: number;
  translated_title?: string;
  isDownloading?: boolean;
  torrentProgress?: number;
  genre?: string;
}

export default function Home() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('time');
  const [genreFilter, setGenreFilter] = useState('');
  const [devFilter, setDevFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [translateMode, setTranslateMode] = useState(true);
  const [showFolders, setShowFolders] = useState(false);
  const [manualIndexFolder, setManualIndexFolder] = useState<string | null>(null);
  const [manualGameId, setManualGameId] = useState('');
  const [gameSearchQuery, setGameSearchQuery] = useState('');
  const [isManualIndexOpen, setIsManualIndexOpen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [limit, setLimit] = useState(20);
  const [showAllGenres, setShowAllGenres] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  
  
  
  const { offlineMode, downloadPath, setDownloadPath } = useStore();
  const queryClient = useQueryClient();

  const router = useRouter();

  const { data: serverSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
  });

  useEffect(() => {
    if (serverSettings?.start) {
      router.push('/setup');
    } else if (serverSettings?.downloadPath) {
      setDownloadPath(serverSettings.downloadPath);
    }
  }, [serverSettings, setDownloadPath, router]);

  useEffect(() => {
    const socket = io();
    
    socket.on('game_saved', (data) => {
      console.log('Novo jogo salvo:', data.title);
      queryClient.invalidateQueries({ queryKey: ['games'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const { data, isLoading, isError } = useQuery<{ games: Game[], pages: number, total: number }>({
    queryKey: ['games', page, search, typeFilter, sort, genreFilter, devFilter, limit, statusFilter],
    queryFn: async () => {
      const res = await api.get('/games', {
        params: { 
          page, 
          q: search, 
          type: typeFilter, 
          limit, 
          path: downloadPath,
          sort,
          genre: genreFilter,
          developer: devFilter,
          status: statusFilter
        }
      });
      return res.data;
    },
  });
  
  const { data: physicalFolders = [], refetch: refetchFolders } = useQuery<any[]>({
    queryKey: ['folders', downloadPath, showFolders, typeFilter],
    queryFn: async () => {
      const res = await api.get('/filesystem/folders', { params: { path: downloadPath } });
      return res.data;
    },
    enabled: typeFilter === 'baixados' && showFolders && !!downloadPath,
    staleTime: 0,
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/filesystem/scan-local-downloads', { path: downloadPath });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(t('home.folders.scanSuccess', { count: data.matchedCount }));
      queryClient.invalidateQueries({ queryKey: ['games'] });
      if (showFolders) refetchFolders();
    },
    onError: (err: any) => toast.error(t('common.error') + ': ' + err.message)
  });

  const manualIndexMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/filesystem/manual-index', { 
        path: downloadPath, 
        folderName: manualIndexFolder, 
        gameId: manualGameId 
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('home.folders.indexed'));
      setIsManualIndexOpen(false);
      setManualIndexFolder(null);
      setManualGameId('');
      refetchFolders();
      queryClient.invalidateQueries({ queryKey: ['games'] });
    },
    onError: (err: any) => toast.error(t('common.error') + ': ' + err.message)
  });

  const removeIndexMutation = useMutation({
    mutationFn: async (folderName: string) => {
      const res = await api.post('/filesystem/remove-index', { folderName });
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('home.folders.removeSuccess'));
      refetchFolders();
      queryClient.invalidateQueries({ queryKey: ['games'] });
    },
    onError: (err: any) => toast.error(t('common.error') + ': ' + err.message)
  });

  const { data: dbGamesSearch } = useQuery({
    queryKey: ['games_search', gameSearchQuery],
    queryFn: async () => {
      if (!gameSearchQuery) return { games: [] };
      const res = await api.get('/games', { params: { q: gameSearchQuery, limit: 10 } });
      return res.data;
    },
    enabled: isManualIndexOpen && gameSearchQuery.length > 2
  });

  const games = data?.games || [];
  const totalPages = data?.pages || 1;
  const totalItems = data?.total || 0;

  const { data: filters = { genres: [], developers: [] } } = useQuery<{ genres: string[], developers: string[] }>({
    queryKey: ['filters'],
    queryFn: async () => {
      const res = await api.get('/filters');
      return res.data;
    },
  });

  const { data: torrents = [] } = useQuery<any[]>({
    queryKey: ['torrents'],
    queryFn: async () => (api.get('/torrent/status').then(res => res.data)),
    refetchInterval: 5000,
  });

  const bulkDownloadMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await api.post('/torrent/bulk-download', { ids });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(t('home.bulk.success', { count: data.count }));
      setSelectedIds([]);
      setSelectionMode(false);
      queryClient.invalidateQueries({ queryKey: ['torrents'] });
    },
    onError: (err: any) => toast.error(t('common.error') + ': ' + err.message)
  });

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const { data: updateInfo } = useQuery({
    queryKey: ['update_check'],
    queryFn: async () => (await api.get('/update/check')).data,
    staleTime: 24 * 60 * 60 * 1000,
  });

  useEffect(() => {
    if (updateInfo) {
      if (updateInfo.available) {
        toast.info(t('home.update.available'), {
          description: t('home.update.description', { version: updateInfo.remoteVersion }),
          icon: <Zap className="h-4 w-4 text-primary animate-pulse" />,
          duration: 15000,
          action: {
            label: t('home.update.view'),
            onClick: () => window.open(updateInfo.githubUrl, '_blank')
          }
        });
      }
    }
  }, [updateInfo]);

  const filteredGames = useMemo(() => {
    return games.filter((game) => {
      const matchSearch = game.title.toLowerCase().includes(search.toLowerCase());
      return matchSearch;
    });
  }, [games, search]);

  const allInPageSelected = filteredGames.length > 0 && filteredGames.every(g => selectedIds.includes(g.id));

  const selectAll = () => {
    if (allInPageSelected) {
      const currentIds = filteredGames.map(g => g.id);
      const nextSelection = selectedIds.filter(id => !currentIds.includes(id));
      setSelectedIds(nextSelection);
    } else {
      const currentIds = filteredGames.map(g => g.id);
      const uniqueNew = currentIds.filter(id => !selectedIds.includes(id));
      const nextSelection = [...selectedIds, ...uniqueNew];
      setSelectedIds(nextSelection);
      toast.success(t('home.bulk.selected', { count: nextSelection.length }));
    }
  };
  const cleanTitle = (game: Game) => {
    const targetTitle = (translateMode && game.translated_title) ? game.translated_title : game.title;
    return targetTitle.replace(/\[.*?\]/g, '').trim();
  };



  useEffect(() => {
    if (typeFilter === 'baixados' && statusFilter === 'available') {
      setStatusFilter('');
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, sort, genreFilter, devFilter, limit, statusFilter]);

  return (
    <div className={`flex flex-col lg:flex-row ${showSidebar ? 'gap-8' : 'gap-0'} transition-all duration-300 relative`}>
      {/* Sidebar Filters */}
      <aside className={`${showSidebar ? 'w-full lg:w-72 opacity-100 mb-6 lg:mb-0' : 'w-0 h-0 overflow-hidden opacity-0 lg:w-0'} transition-all duration-300 ease-in-out space-y-6 shrink-0`}>
        <div className="sticky top-20 space-y-6">
          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" /> {t('home.search.title')}
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('home.search.placeholder')}
                className="pl-9 bg-card/50 border-border/50 focus:border-primary/50"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-indigo-500" /> {t('home.sort.title')}
            </h2>
            <div className="flex flex-col gap-2">
              <Button 
                variant={sort === 'time' ? 'default' : 'outline'} 
                className="justify-start gap-2"
                onClick={() => setSort('time')}
              >
                <Zap className="h-4 w-4" />
                {t('home.sort.newest')}
              </Button>
              <Button 
                variant={sort === 'alpha' ? 'default' : 'outline'} 
                className="justify-start gap-2"
                onClick={() => setSort('alpha')}
              >
                <SortAsc className="h-4 w-4" />
                {t('home.sort.alphabetical')}
              </Button>
              <Button 
                variant={sort === 'seeds' ? 'default' : 'outline'} 
                className="justify-start gap-2"
                onClick={() => setSort('seeds')}
              >
                <Users className="h-4 w-4" />
                {t('home.sort.seeds')}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <HardDriveDownload className="h-5 w-5 text-blue-500" /> {t('home.filter.downloadStatus')}
            </h2>
            <div className="flex flex-col gap-2">
              <Button 
                variant={statusFilter === '' ? 'default' : 'outline'} 
                className="justify-start gap-2 px-3"
                onClick={() => setStatusFilter('')}
              >
                <Filter className="h-4 w-4" />
                <span className="truncate">{t('home.filter.all')}</span>
              </Button>
              {typeFilter !== 'baixados' && (
                <Button 
                  variant={statusFilter === 'available' ? 'default' : 'outline'} 
                  className="justify-start gap-2 px-3"
                  onClick={() => setStatusFilter('available')}
                >
                  <Globe className="h-4 w-4" />
                  <span className="truncate">{t('home.filter.available')}</span>
                </Button>
              )}
              <Button 
                variant={statusFilter === 'downloading' ? 'default' : 'outline'} 
                className="justify-start gap-2 px-3"
                onClick={() => setStatusFilter('downloading')}
              >
                <Activity className="h-4 w-4" />
                <span className="truncate">{t('home.filter.downloading')}</span>
              </Button>
              <Button 
                variant={statusFilter === 'installed' ? 'default' : 'outline'} 
                className="justify-start gap-2 px-3"
                onClick={() => setStatusFilter('installed')}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span className="truncate">{t('home.filter.installed')}</span>
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Globe className="h-5 w-5 text-sky-500" /> {t('home.translation.title')}
            </h2>
            <Button 
              variant={translateMode ? 'default' : 'outline'} 
              className="w-full justify-start gap-2"
              onClick={() => setTranslateMode(!translateMode)}
            >
              <Languages className="h-4 w-4" />
              {translateMode ? t('home.translation.viewOriginal') : t('home.translation.translateTitles')}
            </Button>
          </div>

          {typeFilter === 'baixados' && (
            <div className="space-y-4 animate-in fade-in duration-500 delay-100">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <LayoutDashboard className="h-5 w-5 text-amber-500" /> {t('home.tools.title')}
              </h2>
              <Button 
                variant={showFolders ? 'default' : 'outline'} 
                className={`w-full justify-start gap-2 border-amber-500/20 hover:bg-amber-500/10 transition-all ${showFolders ? 'bg-amber-600 hover:bg-amber-700 shadow-md' : ''}`}
                onClick={() => setShowFolders(!showFolders)}
              >
                <Folder className={`h-4 w-4 ${showFolders ? 'animate-bounce' : ''}`} />
                {showFolders ? t('home.tools.hideFolders') : t('home.tools.showFolders')}
              </Button>
            </div>
          )}

          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Filter className="h-5 w-5 text-emerald-500" /> {t('home.filter.genre')}
            </h2>
            <div className="flex flex-wrap gap-2">
              <Badge 
                variant={genreFilter === '' ? 'default' : 'secondary'}
                className="cursor-pointer"
                onClick={() => setGenreFilter('')}
              >
                {t('home.filter.all')}
              </Badge>
              {filters.genres.slice(0, showAllGenres ? undefined : 15).map(genre => (
                <Badge 
                  key={genre}
                  variant={genreFilter === genre ? 'default' : 'secondary'}
                  className="cursor-pointer"
                  onClick={() => setGenreFilter(genreFilter === genre ? '' : genre)}
                >
                  {genre}
                </Badge>
              ))}
              {filters.genres.length > 15 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full text-[10px] h-8 text-primary hover:bg-primary/5 mt-2"
                  onClick={() => setShowAllGenres(!showAllGenres)}
                >
                  {showAllGenres ? `${t('sidebar.showLess')} -` : `${t('sidebar.showMore')} (${filters.genres.length - 15})+`}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Activity className="h-5 w-5 text-rose-500" /> {t('home.filter.developer')}
            </h2>
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {filters.developers.map(dev => (
                <button
                  key={dev}
                  onClick={() => setDevFilter(devFilter === dev ? '' : dev)}
                  className={`text-left px-3 py-1.5 rounded-md text-sm transition-colors ${devFilter === dev ? 'bg-primary/20 text-primary font-bold' : 'hover:bg-muted text-muted-foreground'}`}
                >
                  {dev}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-wrap gap-3">
            <Badge 
              variant={typeFilter === '' ? 'default' : 'secondary'}
              className="cursor-pointer text-sm px-4 py-2 transition-all hover:scale-105"
              onClick={() => setTypeFilter('')}
            >
              {t('home.filter.allGames')}
            </Badge>
            <Badge 
              variant={typeFilter === 'baixados' ? 'default' : 'secondary'}
              className={`cursor-pointer text-sm px-4 py-2 transition-all hover:scale-105 ${typeFilter === 'baixados' ? 'bg-emerald-600' : ''}`}
              onClick={() => setTypeFilter('baixados')}
            >
              <HardDriveDownload className="h-4 w-4 mr-2" /> {t('home.filter.myGames')}
            </Badge>
            <Badge 
              variant={typeFilter === 'wishlist' ? 'default' : 'secondary'}
              className={`cursor-pointer text-sm px-4 py-2 transition-all hover:scale-105 ${typeFilter === 'wishlist' ? 'bg-rose-600 text-white' : ''}`}
              onClick={() => setTypeFilter('wishlist')}
            >
              <Heart className="h-4 w-4 mr-2" /> {t('home.filter.wishlist')}
            </Badge>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant={selectionMode ? 'default' : 'outline'}
              size="sm"
              className={`gap-2 ${selectionMode ? 'bg-primary border-none text-black' : 'border-primary/20 hover:bg-primary/5'}`}
              onClick={() => {
                setSelectionMode(!selectionMode);
                if (selectionMode) setSelectedIds([]);
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span className="hidden sm:inline">{selectionMode ? t('home.bulk.cancel') : t('home.bulk.enable')}</span>
            </Button>

            {selectionMode && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-primary/20 hover:bg-primary/10 animate-in fade-in slide-in-from-left-2 duration-300"
                onClick={() => selectAll()}
              >
                <Zap className="h-4 w-4" />
                <span>{allInPageSelected ? t('home.bulk.deselectAll') : t('home.bulk.selectAll')}</span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-primary/20 hover:bg-primary/5 flex"
              onClick={() => setShowSidebar(!showSidebar)}
              title={showSidebar ? t('home.sidebar.hide') : t('home.sidebar.show')}
            >
              {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              <span className="hidden sm:inline">{showSidebar ? t('home.sidebar.hide') : t('home.sidebar.show')}</span>
            </Button>
            
            {typeFilter === 'baixados' && (
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2 border-emerald-500/30 text-emerald-600 hover:bg-emerald-50"
                onClick={() => scanMutation.mutate()}
                disabled={scanMutation.isPending}
              >
                <RefreshCw className={`h-4 w-4 ${scanMutation.isPending ? 'animate-spin' : ''}`} />
                {t('common.status')}
              </Button>
            )}
            <p className="text-muted-foreground text-sm font-medium">
              {t('home.status.showing')} <span className="text-foreground">{totalItems}</span> {t('home.status.games')}
            </p>
          </div>
        </div>

        {/* Floating Bulk Action Bar */}
        {selectionMode && selectedIds.length > 0 && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-10 duration-300">
            <div className="bg-card text-card-foreground px-6 py-4 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-primary/20 backdrop-blur-xl flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground uppercase font-black tracking-widest">{t('home.bulk.title')}</span>
                <span className="text-lg font-bold text-primary">{t('home.bulk.selected', { count: selectedIds.length })}</span>
              </div>
              <div className="h-8 w-[1px] bg-border/50" />
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setSelectionMode(false);
                    setSelectedIds([]);
                  }}
                >
                  {t('home.bulk.cancel')}
                </Button>
                <Button 
                  className="bg-primary hover:bg-primary/90 text-black shadow-lg shadow-primary/20 gap-2"
                  size="sm"
                  onClick={() => bulkDownloadMutation.mutate(selectedIds)}
                  disabled={bulkDownloadMutation.isPending}
                >
                  <HardDriveDownload className="h-4 w-4" />
                  {t('home.bulk.downloadAll')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <Card key={i} className="h-[300px] overflow-hidden bg-card/60 animate-pulse border-border">
                <Skeleton className="h-[180px] w-full" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Folders Display (Exclusive to Meus Jogos) */}
        {typeFilter === 'baixados' && showFolders && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
              <h3 className="text-lg font-bold flex items-center gap-2 text-amber-500">
                <Folder className="h-5 w-5" /> {t('home.folders.title')} ({physicalFolders.length})
              </h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{t('home.folders.directory')}</p>
            </div>
            
            {/* Debug path indicator */}
            <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-3 py-1.5 rounded-lg border border-border/30">
              📁 <span className="text-foreground">{downloadPath || `(${t('settings.downloadPath.placeholder')})`}</span>
            </div>

            {physicalFolders.length === 0 ? (
              <div className="p-12 text-center bg-card/20 rounded-2xl border border-dashed border-border/50">
                <Folder className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-muted-foreground">{t('home.folders.noFolders')}</p>
                <p className="text-xs text-muted-foreground/60 mt-2">{t('home.folders.checkSettings')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {physicalFolders.map(folder => {
                  const isIndexed = folder.isIndexed;
                  const hasApk = folder.hasApk;
                  
                  return (
                    <div 
                      key={folder.name} 
                      className={`p-4 rounded-xl border flex items-center gap-3 group transition-all cursor-pointer ${
                        isIndexed 
                          ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10' 
                          : 'border-border/50 bg-card/40 hover:border-amber-500/50 hover:bg-amber-500/5'
                      }`}
                      onClick={() => {
                        if (!isIndexed && hasApk) {
                          setManualIndexFolder(folder.name);
                          setIsManualIndexOpen(true);
                          setGameSearchQuery('');
                        } else if (isIndexed) {
                          toast.info(t('home.folders.indexedMessage', { id: folder.gameId }));
                        } else if (!hasApk) {
                          toast.error(t('home.folders.noApk'));
                        }
                      }}
                      onDoubleClick={() => {
                        if (isIndexed) {
                          if (window.confirm(t('home.folders.removeConfirm'))) {
                            removeIndexMutation.mutate(folder.name);
                          }
                        }
                      }}
                    >
                      <div className={`p-2 rounded-lg transition-colors ${
                        isIndexed 
                          ? 'bg-emerald-500/10 text-emerald-600' 
                          : 'bg-amber-500/10 text-amber-600 group-hover:bg-amber-500 group-hover:text-white'
                      }`}>
                        {isIndexed ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <Folder className="h-5 w-5 shrink-0" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-sm truncate" title={folder.name}>{folder.name}</span>
                        {isIndexed ? (
                          <span className="text-[10px] text-emerald-600 font-bold uppercase">{t('home.folders.indexedWithId', { id: folder.gameId })}</span>
                        ) : hasApk ? (
                          <span className="text-[10px] text-amber-600 font-bold uppercase flex items-center gap-1">
                            <AlertCircle className="h-2.5 w-2.5" /> {t('home.folders.clickToIndex')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="border-b border-border/30 my-8 shadow-sm" />
          </div>
        )}

        {isError && (
          <div className="p-8 text-center text-red-500 bg-red-500/10 rounded-xl border border-red-500/20">
            <p className="font-medium text-lg">{t('home.status.error')}</p>
          </div>
        )}

        {!isLoading && !isError && filteredGames.length === 0 && (
          <div className="text-center p-12 bg-card rounded-xl border border-border/50">
            <ImageOff className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">{t('home.status.noGames')}</h3>
            <p className="text-muted-foreground">{t('home.status.noGamesDesc')}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredGames.map((game) => {
            const isSelected = selectedIds.includes(game.id);
            return (
              <div 
                key={game.id} 
                className={`group h-full cursor-pointer relative ${selectionMode && isSelected ? 'scale-[1.02]' : ''} transition-all duration-300`}
                onClick={(e) => {
                  if (selectionMode) {
                    e.preventDefault();
                    toggleSelection(game.id);
                  }
                }}
              >
                {selectionMode && (
                  <div className={`absolute top-4 right-4 z-40 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-primary border-primary shadow-lg shadow-primary/40' : 'bg-black/20 border-white/40 backdrop-blur-sm'}`}>
                    {isSelected && <CheckCircle2 className="h-4 w-4 text-white" />}
                  </div>
                )}
                <Link 
                  href={selectionMode ? '#' : `/game/${game.id}`} 
                  className={`block h-full ${selectionMode ? 'pointer-events-none' : ''}`}
                >
                  <Card className={`h-full overflow-hidden flex flex-col transition-all duration-300 ${isSelected && selectionMode ? 'border-primary ring-2 ring-primary/20 shadow-2xl shadow-primary/10' : 'hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1 border-border/40'} bg-card/40 backdrop-blur-md rounded-2xl`}>
                    <div className="relative aspect-[16/9] w-full bg-muted overflow-hidden border-b border-border/10">
                      {game.image_url ? (
                        <img
                          src={game.image_url}
                          alt={game.title}
                          className="object-cover w-full h-full transition-transform duration-700 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full">
                          <ImageOff className="h-10 w-10 text-muted-foreground/30" />
                        </div>
                      )}
                      
                      {!selectionMode && game.wishlist === 1 && (
                        <div className="absolute top-3 right-3 z-30 animate-in zoom-in-50 duration-500">
                          <div className="bg-rose-600 shadow-xl text-white p-2 rounded-full backdrop-blur-md border border-rose-400/30">
                            <Heart className="h-4 w-4 fill-current" />
                          </div>
                        </div>
                      )}
                      
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      
                      {(() => {
                        const activeTorrent = torrents.find((t: any) => t.gameId === game.id);
                        const isDownloading = !!activeTorrent;
                        const progress = activeTorrent ? activeTorrent.progress : 0;
                        const isPredownloading = activeTorrent?.state === 'predownload';
                        const isFinished = (parseFloat(progress) >= 99.9) || (game.isLocalDownload && parseFloat(progress) === 0 && !activeTorrent);
                        const showDownloading = isDownloading && !isFinished && !isPredownloading;

                        return (
                          <>
                            {isFinished && (
                              <div className="absolute top-3 left-3 animate-in fade-in zoom-in-50 duration-500 z-30">
                                <Badge className="bg-emerald-500 text-white backdrop-blur-md border-none px-2.5 py-1 shadow-xl flex items-center gap-1.5 text-[10px] font-black tracking-widest rounded-full">
                                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                  {t('home.status.downloaded')}
                                </Badge>
                              </div>
                            )}
                            {isPredownloading && (
                              <div className="absolute top-3 left-3 animate-in fade-in zoom-in-50 duration-500 z-30">
                                <Badge className="bg-purple-600 text-white backdrop-blur-md border-none px-2.5 py-1 shadow-xl flex items-center gap-1.5 text-[10px] font-black tracking-widest rounded-full">
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                  {t('home.status.predownload')}
                                </Badge>
                              </div>
                            )}
                            {showDownloading && (
                              <div className="absolute top-3 left-3 flex flex-col gap-1.5 w-36 animate-in fade-in zoom-in-50 duration-500 z-30">
                                <Badge className="bg-indigo-600 text-white backdrop-blur-md border-none shadow-xl flex items-center gap-1.5 text-[10px] font-black tracking-widest w-full justify-center py-1 rounded-full">
                                  <Activity className="h-3 w-3 animate-pulse" />
                                  {t('home.status.downloading')} {progress}%
                                </Badge>
                                <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden backdrop-blur-md p-[1px] border border-white/10">
                                  <div 
                                    className="bg-indigo-400 h-full rounded-full shadow-[0_0_8px_rgba(129,140,248,0.6)] transition-all duration-1000 ease-in-out" 
                                    style={{ width: `${progress}%` }} 
                                  />
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}

                      <div className="absolute bottom-3 right-3 flex flex-wrap gap-1.5 items-end justify-end z-30 max-w-[80%]">
                        {(() => {
                           // 1. Prioritize translated genre from DB
                           let genreTags: string[] = [];
                           if (game.genre) {
                             genreTags = game.genre.split(/[,|/]+/).map(g => g.trim()).filter(g => g);
                           }

                           // 2. Fallback tag map for markers that Google might miss in the title
                           const markerMap: Record<string, string> = {
                             'RUS': 'PT-BR',
                             'ENG': 'ING',
                             'РУС': 'PT-BR',
                             'АНГ': 'ING',
                             'СИМУЛЯТОРЫ': 'Simuladores',
                             'ЭКШЕН': 'Ação',
                             'ШУТЕРЫ': 'Tiro',
                             'ГОЛОВОЛОМКИ': 'Quebra-cabeça',
                             'ПРИКЛЮЧЕНЧЕСКИЕ': 'Aventura',
                             'РОЛЕВЫЕ ИГРЫ': 'RPG',
                             'АРКАДЫ': 'Arcade'
                           };

                           // 3. Extract markers from title brackets
                           const titleTags = ((translateMode && game.translated_title ? game.translated_title : game.title).match(/\[.*?\]/g) || [])
                             .map(t => t.replace(/[\[\]]/g, '').trim())
                             .map(t => markerMap[t.toUpperCase()] || t)
                             .filter(t => {
                                const tl = t.toLowerCase();
                                return tl === 'pt-br' || tl === 'ing' || tl === 'quest' || tl === 'pcvr' || tl === 'psvr';
                             });

                           const allTags = Array.from(new Set([...genreTags, ...titleTags]));

                           return allTags.map((tag, i) => (
                             <Badge key={i} className="bg-black/70 backdrop-blur-md text-white border-white/10 text-[9px] px-2 py-0.5 rounded-full uppercase tracking-tighter font-black shadow-lg">
                               {tag}
                             </Badge>
                           ));
                        })()}
                      </div>
                    </div>
                    
                    <CardContent className="p-4 flex-1 flex flex-col justify-start gap-1">
                      <CardTitle className="text-sm font-bold line-clamp-2 leading-tight tracking-tight group-hover:text-primary transition-colors duration-300 uppercase">
                        {cleanTitle(game)}
                      </CardTitle>
                      {game.isLocalDownload && (
                        <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" /> {t('home.status.installed')}
                        </p>
                      )}
                    </CardContent>
                    
                    <CardFooter className="px-5 py-3 text-[11px] font-black text-muted-foreground/50 flex justify-between items-center border-t border-white/5 bg-white/[0.02] mt-auto">
                      <div className="flex items-center gap-1.5 uppercase tracking-[0.1em]">
                        <HardDriveDownload className="h-3.5 w-3.5 text-primary/60" />
                        {game.size}
                      </div>
                      <div className="w-1.5 h-1.5 rounded-full bg-border/30" />
                    </CardFooter>
                  </Card>
                </Link>
              </div>
            );
          })}
        </div>

        {/* Pagination and Items Per Page */}
        {(totalPages > 1 || totalItems > 10) && (
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-12 border-t border-border/20">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground mr-2">{t('home.pagination.itemsPerPage')}</span>
              <div className="flex gap-2">
                {[10, 20, 50, 100].map((v) => (
                  <Button
                    key={v}
                    variant={limit === v ? 'default' : 'outline'}
                    size="sm"
                    className="w-10 h-10 p-0 rounded-full"
                    onClick={() => setLimit(v)}
                  >
                    {v}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2 ml-2">
                <Input
                  type="number"
                  placeholder={t('home.pagination.custom')}
                  min={1}
                  max={500}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value);
                    if (val > 0) setLimit(val);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = parseInt((e.target as HTMLInputElement).value);
                      if (val > 0) setLimit(val);
                    }
                  }}
                />
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center bg-card/50 px-4 py-2 rounded-full border border-border/50 min-w-32 justify-center">
                  <span className="text-sm font-bold">
                    {t('home.pagination.page')} {page} {t('home.pagination.of')} {totalPages}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Manual Index Dialog */}
        <Dialog open={isManualIndexOpen} onOpenChange={setIsManualIndexOpen}>
          <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-md border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Folder className="h-5 w-5 text-amber-500" /> {t('home.folders.title')}
              </DialogTitle>
              <DialogDescription>
                {t('home.folders.clickToIndex')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('home.folders.directory')}</Label>
                <div className="p-2 bg-muted rounded text-xs font-mono break-all border border-border/50">
                  {manualIndexFolder}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gameSearch">{t('home.folders.searchGame')}</Label>
                <Input
                  id="gameSearch"
                  placeholder={t('home.folders.searchHint')}
                  value={gameSearchQuery}
                  onChange={(e) => setGameSearchQuery(e.target.value)}
                  autoFocus
                />
                
                {gameSearchQuery.length > 2 && dbGamesSearch && dbGamesSearch.games && (
                  <div className="mt-2 max-h-40 overflow-y-auto border border-border/50 rounded-md bg-card custom-scrollbar shadow-sm">
                    {dbGamesSearch.games.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">{t('home.folders.noResults')}</div>
                    ) : (
                      dbGamesSearch.games.map((g: any) => (
                        <div 
                          key={g.id} 
                          className={`p-2 text-sm cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted transition-colors ${manualGameId === String(g.id) ? 'bg-primary/20 text-primary font-bold border-l-2 border-l-primary' : ''}`}
                          onClick={() => setManualGameId(String(g.id))}
                        >
                          {g.title.replace(/\[.*?\]/g, '').trim()} <span className="text-xs text-muted-foreground ml-1">(ID: {g.id})</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                <div className="pt-2">
                  <Label htmlFor="gameId" className="text-xs text-muted-foreground">{t('home.folders.manualIdHint')}</Label>
                  <Input
                    id="gameId"
                    placeholder="2128"
                    value={manualGameId}
                    onChange={(e) => setManualGameId(e.target.value)}
                    type="number"
                    className="mt-1 h-8 text-sm"
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setIsManualIndexOpen(false)}>{t('common.cancel')}</Button>
              <Button 
                onClick={() => manualIndexMutation.mutate()}
                disabled={!manualGameId || manualIndexMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {manualIndexMutation.isPending ? t('common.loading') : t('common.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Update Logic moved to toast */}
      </main>
    </div>
  );
}
