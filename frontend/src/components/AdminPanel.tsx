'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useStore } from '@/store/useStore';
import { useTranslation } from '@/lib/i18n';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Trash2, Edit, Database, AlertOctagon, RefreshCw, AlertTriangle, Download, UploadCloud, Search } from 'lucide-react';
import { toast } from 'sonner';

interface Game {
  id: number;
  title: string;
  tags: string;
  genre: string;
  developer: string;
  publisher: string;
  version: string;
  languages: string;
  play_modes: string;
}

export default function AdminPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { interfaceLanguage, translationLanguage } = useStore();
  const [clearCount, setClearCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [editGame, setEditGame] = useState<Game | null>(null);
  const [backupConfirm, setBackupConfirm] = useState<{ tempPath: string; metadata: any } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { data } = useQuery<{ games: Game[] }>({
    queryKey: ['admin_games'],
    queryFn: async () => (await api.get('/games', { params: { limit: 10000 } })).data,
  });

  const games = data?.games || [];

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/games/${id}`),
    onSuccess: () => {
      toast.success(t('admin.table.noGenre')); // Using a generic success or adding new ones
      queryClient.invalidateQueries({ queryKey: ['admin_games'] });
      queryClient.invalidateQueries({ queryKey: ['games'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (game: Game) => api.put(`/games/${game.id}`, { 
      title: game.title, 
      tags: game.tags,
      genre: game.genre,
      developer: game.developer,
      publisher: game.publisher,
      version: game.version,
      languages: game.languages,
      play_modes: game.play_modes
    }),
    onSuccess: () => {
      toast.success(t('admin.edit.save'));
      setEditGame(null);
      queryClient.invalidateQueries({ queryKey: ['admin_games'] });
      queryClient.invalidateQueries({ queryKey: ['games'] });
    },
  });

  const clearDbMutation = useMutation({
    mutationFn: () => api.delete('/db/clear'),
    onSuccess: () => {
      toast.success(t('admin.actions.clear'));
      setClearCount(0);
      queryClient.invalidateQueries({ queryKey: ['admin_games'] });
      queryClient.invalidateQueries({ queryKey: ['games'] });
    },
  });

  const handleClearDb = () => {
    if (clearCount < 4) {
      setClearCount(c => c + 1);
      toast.error(t('admin.actions.clearWarning', { remaining: 5 - clearCount - 1 }));
    } else {
      clearDbMutation.mutate();
    }
  };

  const checkBackupMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/db/import/check', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data;
    },
    onSuccess: (data) => {
      setBackupConfirm({ tempPath: data.tempPath, metadata: data.metadata });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || t('common.error'));
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  });

  const applyBackupMutation = useMutation({
    mutationFn: (tempPath: string) => api.post('/db/import/apply', { tempPath }),
    onSuccess: () => {
      toast.success(t('admin.backup.confirm'));
      setBackupConfirm(null);
      setTimeout(() => window.location.reload(), 1500);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || t('common.error'))
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      checkBackupMutation.mutate(e.target.files[0]);
    }
  };

  const { data: failedData, refetch: refetchFailed } = useQuery<{ items: any[] }>({
    queryKey: ['failed_games'],
    queryFn: async () => (await api.get('/scraper/failed')).data,
  });

  const retryMutation = useMutation({
    mutationFn: (id: number) => api.post(`/scraper/failed/${id}/retry`),
    onSuccess: () => {
      toast.success(t('admin.failed.retry'));
      refetchFailed();
      queryClient.invalidateQueries({ queryKey: ['admin_games'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || t('common.error')),
  });

  const retryAllMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/scraper/failed/retry-all');
      return res.data;
    },
    onSuccess: (data: any) => {
      toast.success(t('admin.failed.retryAllSuccess', { successes: data.successes, errors: data.errors }));
      refetchFailed();
      queryClient.invalidateQueries({ queryKey: ['admin_games'] });
    },
    onError: () => toast.error(t('common.error')),
  });

  const rebuildAllMutation = useMutation({
    mutationFn: () => api.post('/scraper/rebuild-all'),
    onSuccess: () => {
      toast.success(t('admin.rebuildAll.success'));
    },
    onError: (err: any) => toast.error(err.response?.data?.error || t('common.error'))
  });

  const failedItems = failedData?.items || [];

  const cleanTitle = (title: string) => title.replace(/\[.*?\]\s*/g, '').trim();

  const filteredGames = games.filter(g => 
    g.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    cleanTitle(g.title).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur w-full mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-indigo-500" /> {t('admin.title')}
        </CardTitle>
        <CardDescription>
          {t('admin.description')}
        </CardDescription>
        <div className="mt-4 relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder={t('admin.search')} 
            className="pl-9 h-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="rounded-md border border-border/50 overflow-auto max-h-[400px] custom-scrollbar">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow>
                 <TableHead className="w-[80px]">{t('admin.table.id')}</TableHead>
                <TableHead>{t('admin.table.title')}</TableHead>
                <TableHead>{t('admin.table.meta')}</TableHead>
                <TableHead className="text-right">{t('admin.table.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGames.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">{t('admin.table.noData')}</TableCell>
                </TableRow>
              )}
              {filteredGames.map(game => (
                <TableRow key={game.id}>
                  <TableCell className="font-mono text-xs">{game.id}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]" title={game.title}>
                    {cleanTitle(game.title)}
                  </TableCell>
                   <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-emerald-500 uppercase">{game.genre || t('admin.table.noGenre')}</span>
                      <span className="text-[9px] text-muted-foreground italic">{game.developer || t('admin.table.noDev')}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="icon" variant="ghost" onClick={() => setEditGame(game)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="destructive" onClick={() => deleteMutation.mutate(game.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <CardFooter className="bg-muted/20 border-t border-border/50 pt-4 flex flex-row flex-wrap justify-between items-center gap-4">
        <span className="text-sm text-muted-foreground mr-auto">{t('admin.table.total')}: {filteredGames.length} {filteredGames.length !== games.length ? `(${games.length})` : ''}</span>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Rebuild All Button */}
          <Button 
            variant="outline" 
            className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
            onClick={() => {
              if(confirm(t('admin.rebuildAll.confirm', { lang: translationLanguage === 'pt' ? 'Português' : 'English' }))) {
                rebuildAllMutation.mutate();
              }
            }}
            disabled={rebuildAllMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${rebuildAllMutation.isPending ? 'animate-spin' : ''}`} /> 
            {t('admin.rebuildAll.button')}
          </Button>

          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".zip" 
            onChange={handleFileChange} 
          />
          <Button 
            variant="outline" 
            className="border-primary/50 text-primary hover:bg-primary/10"
            onClick={() => window.open('/api/db/export', '_self')}
          >
            <Download className="h-4 w-4 mr-2" /> {t('admin.actions.export')}
          </Button>

          <Button 
            variant="secondary" 
            onClick={() => fileInputRef.current?.click()}
            disabled={checkBackupMutation.isPending}
          >
            <UploadCloud className="h-4 w-4 mr-2" /> 
            {checkBackupMutation.isPending ? t('admin.actions.importing') : t('admin.actions.import')}
          </Button>

          <Button 
            variant={clearCount > 0 ? 'destructive' : 'outline'} 
            className={clearCount > 2 ? 'animate-pulse font-bold' : ''}
            onClick={handleClearDb}
          >
            {clearCount === 0 && <><AlertOctagon className="h-4 w-4 mr-2 text-destructive" /> {t('admin.actions.clear')}</>}
            {clearCount > 0 && t('admin.actions.confirmClear', { count: clearCount })}
          </Button>
        </div>
      </CardFooter>

      {/* Seção de Falhas */}
      <CardHeader className="border-t border-border/50 bg-muted/5 mt-4">
        <CardTitle className="flex items-center gap-2 text-amber-500">
          <AlertTriangle className="h-5 w-5" /> {t('admin.failed.title')}
        </CardTitle>
        <CardDescription>
          {t('admin.failed.description')}
        </CardDescription>
        {failedItems.length > 0 && (
          <div className="mt-2">
            <Button 
              size="sm" 
              variant="default"
              className="bg-amber-500 hover:bg-amber-600 text-white gap-2 border-none"
              disabled={retryAllMutation.isPending}
              onClick={() => retryAllMutation.mutate()}
            >
              <RefreshCw className={`h-4 w-4 ${retryAllMutation.isPending ? 'animate-spin' : ''}`} />
              {retryAllMutation.isPending ? t('admin.failed.processing') : t('admin.failed.retryAll')}
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent>
        <div className="rounded-md border border-amber-500/20 overflow-auto max-h-[300px] custom-scrollbar">
          <Table>
            <TableHeader className="bg-amber-500/5 sticky top-0 z-10">
              <TableRow>
                <TableHead>{t('admin.failed.title')}</TableHead>
                <TableHead className="w-[120px]">{t('admin.failed.retry')}</TableHead>
                <TableHead className="text-right">{t('admin.table.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center h-20 text-muted-foreground italic">{t('admin.failed.noFailures')}</TableCell>
                </TableRow>
              )}
              {failedItems.map((item: any) => (
                <TableRow key={item.id} className="group hover:bg-amber-500/5 transition-colors">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-xs font-mono text-muted-foreground truncate max-w-[300px]" title={item.post_url}>
                        {item.post_url}
                      </span>
                      <span className="text-[10px] text-destructive font-bold">{item.error_message}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-bold text-amber-600">
                    {item.attempts}x
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="border-amber-500/30 hover:bg-amber-500/10 gap-2 h-8"
                      disabled={retryMutation.isPending}
                      onClick={() => retryMutation.mutate(item.id)}
                    >
                      <RefreshCw className={`h-3 w-3 ${retryMutation.isPending ? 'animate-spin' : ''}`} />
                      {t('admin.failed.retry')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <CardFooter className="bg-amber-500/5 text-amber-600/60 text-[10px] py-2 px-6 rounded-b-xl border-t border-amber-500/10">
        {t('admin.failed.status')}
      </CardFooter>

      <Dialog open={!!editGame} onOpenChange={(v) => !v && setEditGame(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('admin.edit.title')} #{editGame?.id}</DialogTitle>
            <DialogDescription>{t('admin.edit.description')}</DialogDescription>
          </DialogHeader>
          {editGame && (
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">{t('admin.edit.labelTitle')}</Label>
                <Input 
                  id="title" 
                  value={editGame.title} 
                  onChange={e => setEditGame({ ...editGame, title: e.target.value })} 
                />
              </div>
               <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="genre">{t('admin.edit.genre')}</Label>
                  <Input 
                    id="genre" 
                    value={editGame.genre || ''} 
                    onChange={e => setEditGame({ ...editGame, genre: e.target.value })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="developer">{t('admin.edit.developer')}</Label>
                  <Input 
                    id="developer" 
                    value={editGame.developer || ''} 
                    onChange={e => setEditGame({ ...editGame, developer: e.target.value })} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="publisher">{t('admin.edit.publisher')}</Label>
                  <Input 
                    id="publisher" 
                    value={editGame.publisher || ''} 
                    onChange={e => setEditGame({ ...editGame, publisher: e.target.value })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="version">{t('admin.edit.version')}</Label>
                  <Input 
                    id="version" 
                    value={editGame.version || ''} 
                    onChange={e => setEditGame({ ...editGame, version: e.target.value })} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="languages">{t('admin.edit.languages')}</Label>
                  <Input 
                    id="languages" 
                    value={editGame.languages || ''} 
                    onChange={e => setEditGame({ ...editGame, languages: e.target.value })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="play_modes">{t('admin.edit.playModes')}</Label>
                  <Input 
                    id="play_modes" 
                    value={editGame.play_modes || ''} 
                    onChange={e => setEditGame({ ...editGame, play_modes: e.target.value })} 
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditGame(null)}>{t('common.cancel')}</Button>
            <Button onClick={() => editGame && updateMutation.mutate(editGame)}>{t('admin.edit.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!backupConfirm} onOpenChange={(v) => !v && setBackupConfirm(null)}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>{t('admin.backup.title')}</DialogTitle>
            <DialogDescription>
              {t('admin.backup.description')}
            </DialogDescription>
          </DialogHeader>
          {backupConfirm && (
            <div className="bg-muted/50 p-4 rounded-xl text-sm space-y-2 font-mono">
              <p><strong>{t('admin.backup.details.created')}:</strong> {new Date(backupConfirm.metadata.created_at).toLocaleString()}</p>
              <p><strong>{t('admin.backup.details.code')}:</strong> <span className="text-emerald-500 font-bold blur-sm hover:blur-none transition-all duration-300 cursor-help select-none" title="Passe o mouse para revelar">{backupConfirm.metadata.validation_code}</span></p>
              <p><strong>{t('admin.backup.details.files')}:</strong> {backupConfirm.metadata.files.join(', ')}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setBackupConfirm(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}>{t('common.cancel')}</Button>
            <Button 
              variant="destructive" 
              onClick={() => backupConfirm && applyBackupMutation.mutate(backupConfirm.tempPath)}
              disabled={applyBackupMutation.isPending}
            >
              {applyBackupMutation.isPending ? t('common.loading') : t('admin.backup.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
