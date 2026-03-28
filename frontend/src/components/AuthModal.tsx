'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, KeyRound, ExternalLink, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function AuthModal({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captchaCode, setCaptchaCode] = useState('');
  const [errorVisible, setErrorVisible] = useState<string | null>(null);
  
  const [captchaInfo, setCaptchaInfo] = useState<{
    requiresCaptcha: boolean;
    captchaUrl: string;
    captchaSid: string;
    captchaField: string;
    pendingCookies?: string[];
  } | null>(null);

  const loginMutation = useMutation({
    mutationFn: (data: any) => api.post('/auth/login', data),
    onSuccess: (res) => {
      if (res.data.success) {
        toast.success('Autenticado com sucesso!');
        onOpenChange(false);
        queryClient.invalidateQueries({ queryKey: ['sessionValid'] });
        setCaptchaInfo(null);
        setCaptchaCode('');
        setErrorVisible(null);
      } else if (res.data.requiresCaptcha) {
        setCaptchaInfo(res.data);
        setCaptchaCode('');
        setErrorVisible(null);
        toast.info('Captcha necessário para login ou senha incorreta');
      } else if (res.data.error) {
        setErrorVisible(res.data.error);
        if (captchaInfo) {
           setErrorVisible("O captcha pode estar incorreto. Tente novamente.");
        }
        toast.error(res.data.error);
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || 'Erro ao tentar autenticar';
      setErrorVisible(msg);
      toast.error(msg);
    }
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorVisible(null);
    loginMutation.mutate({
      username,
      password,
      captchaCode: captchaInfo ? captchaCode : undefined,
      captchaSid: captchaInfo ? captchaInfo.captchaSid : undefined,
      captchaField: captchaInfo ? captchaInfo.captchaField : undefined,
      pendingCookies: captchaInfo ? captchaInfo.pendingCookies : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val);
      if (!val) setErrorVisible(null); // Clear errors on close
    }}>
      <DialogContent className="sm:max-w-md border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <KeyRound className="h-5 w-5 text-primary" /> Autenticação RuTracker
          </DialogTitle>
          <DialogDescription>
            Insira suas credenciais para login no fórum. A autenticação será processada de forma segura em segundo plano.
          </DialogDescription>
        </DialogHeader>

        {errorVisible && (
          <Alert variant="destructive" className="animate-in fade-in zoom-in-95 duration-200 bg-destructive/10 border-destructive/20 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="font-bold">Erro na Autenticação</AlertTitle>
            <AlertDescription className="text-xs opacity-90">
              {errorVisible}
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleLogin} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="username">Usuário</Label>
            <Input 
              id="username" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              placeholder="Ex: seu_usuario"
              required
              disabled={loginMutation.isPending}
              className="bg-background border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input 
              id="password" 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="••••••••"
              required
              disabled={loginMutation.isPending}
              className="bg-background border-border"
            />
          </div>

          {captchaInfo && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg border border-border animate-in fade-in slide-in-from-top-2">
              <Label className="text-primary font-semibold">Responda ao Captcha</Label>
              <div className="flex flex-col items-center gap-2 bg-white p-3 rounded-md border border-border shadow-sm">
                <img 
                  src={captchaInfo.captchaUrl} 
                  alt="Captcha" 
                  className="max-h-12 object-contain select-none"
                  onContextMenu={(e) => e.preventDefault()}
                />
              </div>
              <Input 
                value={captchaCode} 
                onChange={(e) => setCaptchaCode(e.target.value)} 
                placeholder="Insira o código acima"
                required
                disabled={loginMutation.isPending}
                className="bg-background border-primary/20 ring-1 ring-primary/10"
                autoFocus
              />
            </div>
          )}

          <div className="flex flex-col gap-3 pt-2">
            <Button type="submit" className="w-full font-bold shadow-lg shadow-primary/10" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {captchaInfo ? 'Validando Captcha...' : 'Autenticando...'}
                </>
              ) : (
                captchaInfo ? 'Confirmar Captcha' : 'Realizar Login'
              )}
            </Button>
            
            <div className="flex justify-center mt-2">
              <Button 
                variant="ghost" 
                size="sm" 
                type="button" 
                className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5"
                onClick={() => window.open('https://rutracker.me/forum/profile.php?mode=register', '_blank')}
              >
                Ainda não tem conta? <span className="underline font-medium">Registrar agora</span>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
