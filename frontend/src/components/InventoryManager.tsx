'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useTranslation } from '@/lib/i18n';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Database, Edit, Trash2, Save, X, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function InventoryManager() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});

  const { data: inventory = {}, isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => (await api.get('/inventory')).data,
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { hash: string, data: any }) => api.post('/inventory/update', vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success(t('settings.inventory.updateSuccess'));
      setEditingItem(null);
    },
    onError: () => toast.error('Error updating index'),
  });

  const removeMutation = useMutation({
    mutationFn: (hash: string) => api.post('/inventory/remove', { hash }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success(t('settings.inventory.removeSuccess'));
    },
    onError: () => toast.error('Error removing item'),
  });

  const handleEdit = (hash: string, item: any) => {
    setEditingItem({ hash, ...item });
    setEditForm({ ...item });
  };

  const handleSave = () => {
    if (!editingItem) return;
    updateMutation.mutate({ 
      hash: editingItem.hash, 
      data: {
        ...editForm,
        gameId: parseInt(editForm.gameId),
        progress: parseFloat(editForm.progress)
      } 
    });
  };

  const handleRemove = (hash: string) => {
    if (confirm(t('settings.inventory.confirmDelete'))) {
      removeMutation.mutate(hash);
    }
  };

  const inventoryEntries = Object.entries(inventory);

  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-purple-500" /> {t('settings.inventory.title')}
        </CardTitle>
        <CardDescription>
          {t('settings.inventory.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : inventoryEntries.length === 0 ? (
          <div className="text-center p-8 text-sm text-muted-foreground">
            {t('settings.inventory.noItems')}
          </div>
        ) : (
          <div className="rounded-md border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-bold">{t('settings.inventory.folder')}</TableHead>
                  <TableHead className="font-bold hidden md:table-cell">{t('settings.inventory.status')}</TableHead>
                  <TableHead className="font-bold">{t('settings.inventory.progress')}</TableHead>
                  <TableHead className="font-bold text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventoryEntries.map(([hash, item]: [string, any]) => (
                  <TableRow key={hash} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium max-w-[200px] truncate" title={item.folderName}>
                      {item.folderName}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${item.status === 'concluido' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                        {item.status}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{item.progress}%</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(hash, item)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleRemove(hash)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
          <DialogContent className="sm:max-w-md bg-card border-primary/20 backdrop-blur-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-primary" /> {t('settings.inventory.edit')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('settings.inventory.folder')}</Label>
                <Input 
                  value={editForm.folderName || ''} 
                  onChange={(e) => setEditForm({...editForm, folderName: e.target.value})}
                  className="bg-background"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('settings.inventory.gameId')}</Label>
                  <Input 
                    type="number"
                    value={editForm.gameId || 0} 
                    onChange={(e) => setEditForm({...editForm, gameId: e.target.value})}
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.inventory.status')}</Label>
                  <select 
                    className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm ring-offset-background"
                    value={editForm.status || ''}
                    onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                  >
                    <option value="concluido">concluido</option>
                    <option value="download">download</option>
                    <option value="predownload">predownload</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('settings.inventory.progress')}</Label>
                <Input 
                  type="number" 
                  step="0.1" 
                  max="100" 
                  min="0"
                  value={editForm.progress || 0} 
                  onChange={(e) => setEditForm({...editForm, progress: e.target.value})}
                  className="bg-background"
                />
              </div>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex gap-3 text-xs text-amber-500">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <p>Alterar estes valores manualmente pode afetar o rastreamento do qBitTorrent.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditingItem(null)}>
                {t('settings.inventory.close')}
              </Button>
              <Button onClick={handleSave} disabled={updateMutation.isPending} className="bg-primary text-black hover:bg-primary/90">
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {t('settings.inventory.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
