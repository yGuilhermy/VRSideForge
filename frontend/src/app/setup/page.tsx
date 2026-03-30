'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';
import { useStore } from '@/store/useStore';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Loader2, ChevronRight, MonitorSmartphone, Languages, Folder, DownloadCloud, Activity, KeyRound, PlayCircle } from 'lucide-react';

export default function SetupPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<boolean | null>(null);
  const [adbStatus, setAdbStatus] = useState<any>(null);
  const [qbitStatus, setQbitStatus] = useState<any>(null);

  // Store
  const { interfaceLanguage, setInterfaceLanguage, translationLanguage, setTranslationLanguage, downloadPath, setDownloadPath } = useStore();

  const handleNext = () => {
    setSuccess(null);
    setLoading(false);
    setStep(s => s + 1);
  };

  const handleSkip = () => {
    handleNext();
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      await api.post('/settings', { start: false });
      router.push('/');
    } catch (err: any) {
      toast.error('Erro ao finalizar: ' + err.message);
      setLoading(false);
    }
  };

  // Step 2: ADB Check
  const checkAdb = async () => {
    setLoading(true);
    setAdbStatus(null);
    try {
      const [pathRes, devRes] = await Promise.all([
        api.get('/adb/check-path').catch(() => ({ data: { present: false } })),
        api.get('/adb/devices').catch(() => ({ data: { devices: [] } }))
      ]);
      const present = pathRes.data?.present;
      const devices = devRes.data?.devices?.length || 0;
      setAdbStatus({ present, devices });
      
      if (present) {
        setSuccess(true);
      } else {
        setSuccess(false);
      }
    } catch {
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: qBit Check
  const checkQbit = async () => {
    setLoading(true);
    setQbitStatus(null);
    try {
      const res = await api.get('/torrent/check');
      const { isRunning, webUiWorking } = res.data;
      setQbitStatus({ isRunning, webUiWorking });
      
      if (webUiWorking) {
        setSuccess(true);
      } else {
        setSuccess(false);
      }
    } catch {
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  // Step 4: RuTracker Check
  const checkSession = async () => {
    setLoading(true);
    try {
      const res = await api.get('/session/status');
      if (res.data?.valid) {
        setSuccess(true);
      } else {
        setSuccess(false);
      }
    } catch {
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  const manualLogin = async () => {
    setLoading(true);
    toast.info('Navegador aberto. Faça login no RuTracker...');
    try {
      const res = await api.get('/session/validate');
      if (res.data?.success) {
        setSuccess(true);
        toast.success('Login bem-sucedido!');
      } else {
        setSuccess(false);
        toast.error('Falha no login ou timeout.');
      }
    } catch {
      setSuccess(false);
      toast.error('Erro ao conectar.');
    } finally {
      setLoading(false);
    }
  };

  // Step 5: Save Path
  const savePath = async () => {
    setLoading(true);
    try {
      await api.post('/settings', { downloadPath });
      setSuccess(true);
    } catch (err: any) {
      toast.error('Erro ao salvar caminho: ' + err.message);
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  // Step 6: Start Scraper
  const startScraper = async () => {
    setLoading(true);
    try {
      await api.post('/scraper/start');
      toast.success('Scraper iniciado!');
      handleFinish();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
      setLoading(false);
    }
  };

  // Auto checks on mount per step
  useEffect(() => {
    setSuccess(null);
    if (step === 2) checkAdb();
    else if (step === 3) checkQbit();
    else if (step === 4) checkSession();
  }, [step]);

  return (
    <div className="flex items-center justify-center min-h-[80vh] bg-background">
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 blur-[100px] rounded-full pointer-events-none" />

      <Card className="w-full max-w-2xl shadow-2xl border-primary/20 bg-card/60 backdrop-blur-xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-700">
        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-border/50 absolute top-0 left-0">
          <div 
            className="h-full bg-primary transition-all duration-700 ease-in-out" 
            style={{ width: `${(step / 6) * 100}%` }}
          />
        </div>

        <CardHeader className="text-center pt-10 pb-6 border-b border-border/10">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 transform transition-all duration-500 hover:scale-110 shadow-lg shadow-primary/20">
            {step === 1 && <Languages className="w-8 h-8 text-primary" />}
            {step === 2 && <MonitorSmartphone className="w-8 h-8 text-primary" />}
            {step === 3 && <DownloadCloud className="w-8 h-8 text-primary" />}
            {step === 4 && <KeyRound className="w-8 h-8 text-primary" />}
            {step === 5 && <Folder className="w-8 h-8 text-primary" />}
            {step === 6 && <PlayCircle className="w-8 h-8 text-primary" />}
          </div>
          <CardTitle className="text-3xl font-black bg-gradient-to-r from-primary to-primary-foreground bg-clip-text text-transparent">
            {t('setup.title')}
          </CardTitle>
          <CardDescription className="text-base mt-2">
            {t(`setup.step${step}.title`)} - {t(`setup.step${step}.description`)}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-8 min-h-[250px] flex flex-col justify-center items-center">
          {/* STEP 1: Language */}
          {step === 1 && (
            <div className="w-full space-y-6 animate-in slide-in-from-right-8 duration-500">
              <div className="space-y-3">
                <label className="text-sm font-semibold">{t('setup.step1.interface')}</label>
                <div className="grid grid-cols-2 gap-4">
                  <Button 
                    variant={interfaceLanguage === 'pt' ? 'default' : 'outline'} 
                    className="h-14 font-bold tracking-wide"
                    onClick={() => {
                      setInterfaceLanguage('pt');
                      api.post('/settings', { interfaceLanguage: 'pt' });
                    }}
                  >
                    Português (BR)
                  </Button>
                  <Button 
                    variant={interfaceLanguage === 'en' ? 'default' : 'outline'} 
                    className="h-14 font-bold tracking-wide"
                    onClick={() => {
                      setInterfaceLanguage('en');
                      api.post('/settings', { interfaceLanguage: 'en' });
                    }}
                  >
                    English
                  </Button>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-border/10">
                <label className="text-sm font-semibold">{t('setup.step1.translation')}</label>
                <div className="grid grid-cols-2 gap-4">
                  <Button 
                    variant={translationLanguage === 'pt' ? 'default' : 'outline'} 
                    className="h-14 font-bold tracking-wide"
                    onClick={() => {
                      setTranslationLanguage('pt');
                      api.post('/settings', { translationLanguage: 'pt' });
                    }}
                  >
                    Português (BR)
                  </Button>
                  <Button 
                    variant={translationLanguage === 'en' ? 'default' : 'outline'} 
                    className="h-14 font-bold tracking-wide"
                    onClick={() => {
                      setTranslationLanguage('en');
                      api.post('/settings', { translationLanguage: 'en' });
                    }}
                  >
                    English
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: ADB */}
          {step === 2 && (
            <div className="w-full flex flex-col items-center justify-center text-center space-y-6 animate-in slide-in-from-right-8 duration-500">
              {loading ? (
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
              ) : success === true ? (
                <div className="flex flex-col items-center gap-4 text-emerald-500">
                  <CheckCircle2 className="w-16 h-16 animate-in zoom-in-50 duration-500" />
                  <p className="font-bold text-lg">
                    {adbStatus?.devices > 0 ? t('setup.step2.successAll') : t('setup.step2.successPathOnly')}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 text-rose-500 w-full">
                  <AlertBox message={t('setup.step2.fail')} icon={<XCircle className="w-8 h-8 text-rose-500 shrink-0" />} />
                  <Button variant="outline" onClick={checkAdb} className="mt-4 hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/30">
                    <MonitorSmartphone className="w-4 h-4 mr-2" /> Tentar Novamente
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: qBit */}
          {step === 3 && (
            <div className="w-full flex flex-col items-center justify-center text-center space-y-6 animate-in slide-in-from-right-8 duration-500">
              {loading ? (
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
              ) : success === true ? (
                <div className="flex flex-col items-center gap-4 text-emerald-500">
                  <CheckCircle2 className="w-16 h-16 animate-in zoom-in-50 duration-500" />
                  <p className="font-bold text-lg">{t('setup.step3.success')}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 w-full">
                  {!qbitStatus?.isRunning ? (
                    <AlertBox message={t('setup.step3.failNotRunning')} icon={<XCircle className="w-8 h-8 text-rose-500 shrink-0" />} isWarning={false} />
                  ) : (
                    <AlertBox message={t('setup.step3.failRunningNoWebUI')} icon={<XCircle className="w-8 h-8 text-amber-500 shrink-0" />} isWarning={true} />
                  )}
                  <Button variant="outline" onClick={checkQbit} className="mt-4 hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/30">
                    <DownloadCloud className="w-4 h-4 mr-2" /> Tentar Novamente
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Session */}
          {step === 4 && (
            <div className="w-full flex flex-col items-center justify-center text-center space-y-6 animate-in slide-in-from-right-8 duration-500">
              {loading ? (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  <p className="text-muted-foreground animate-pulse">Aguardando login no navegador...</p>
                </div>
              ) : success === true ? (
                <div className="flex flex-col items-center gap-4 text-emerald-500">
                  <CheckCircle2 className="w-16 h-16 animate-in zoom-in-50 duration-500" />
                  <p className="font-bold text-lg">{t('setup.step4.success')}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 w-full">
                  <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10 mb-2 px-4 py-1">Sessão Ausente</Badge>
                  <Button size="lg" className="w-full max-w-sm h-14 font-bold shadow-xl shadow-primary/20" onClick={manualLogin}>
                    <KeyRound className="w-5 h-5 mr-2" /> {t('setup.step4.loginBtn')}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* STEP 5: Path */}
          {step === 5 && (
            <div className="w-full space-y-6 animate-in slide-in-from-right-8 duration-500">
               <div className="space-y-4">
                <label className="text-sm font-semibold">{t('setup.step5.path')}</label>
                <div className="flex gap-2">
                  <Input 
                    value={downloadPath} 
                    onChange={(e) => setDownloadPath(e.target.value)}
                    className="h-12 bg-card/50"
                  />
                  <Button 
                    onClick={savePath} 
                    disabled={loading} 
                    className="h-12 px-6"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                  </Button>
                </div>
                {success === true && (
                  <p className="text-emerald-500 text-sm font-medium flex items-center gap-2 mt-2 animate-in fade-in duration-300">
                    <CheckCircle2 className="w-4 h-4" /> Caminho validado com sucesso!
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 6: Finished / Scraper */}
          {step === 6 && (
            <div className="w-full flex flex-col items-center justify-center text-center space-y-8 animate-in slide-in-from-right-8 duration-500">
               <div className="p-6 bg-primary/10 rounded-full mb-2">
                 <PlayCircle className="w-16 h-16 text-primary" />
               </div>
               <div className="space-y-4">
                 <h3 className="text-2xl font-bold">Tudo Pronto!</h3>
                 <p className="text-muted-foreground">{t('setup.step6.description')}</p>
               </div>
               
               <div className="flex gap-4 w-full justify-center">
                 <Button variant="outline" size="lg" className="h-14 px-8 font-bold text-muted-foreground hover:text-foreground hover:bg-muted" onClick={handleFinish}>
                   Deixar para depois
                 </Button>
                 <Button size="lg" className="h-14 px-8 font-bold shadow-xl shadow-primary/20" onClick={startScraper} disabled={loading}>
                   {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Activity className="w-5 h-5 mr-2" />}
                   {t('setup.step6.startScraper')}
                 </Button>
               </div>
            </div>
          )}

        </CardContent>

        <CardFooter className="flex justify-between p-6 bg-card/30 border-t border-border/10">
          <Button 
            variant="ghost" 
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1 || loading}
            className="text-muted-foreground hover:text-foreground"
          >
            {t('setup.back')}
          </Button>

          {step < 6 && (
            <div className="flex gap-3">
              <Button 
                variant="ghost" 
                onClick={handleSkip} 
                disabled={loading} 
                className="text-muted-foreground/60 hover:text-muted-foreground"
              >
                {t('setup.skip')}
              </Button>
              <Button onClick={handleNext} disabled={loading} className="px-6 font-semibold group shadow-md">
                {t('setup.next')} 
                <ChevronRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

function AlertBox({ message, icon, isWarning = false }: { message: string, icon: React.ReactNode, isWarning?: boolean }) {
  return (
    <div className={`flex items-start gap-4 p-4 rounded-xl border text-left ${isWarning ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'}`}>
      {icon}
      <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{message}</p>
    </div>
  );
}
