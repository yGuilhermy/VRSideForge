'use client';

import Link from 'next/link';
import { Activity, Database, Zap, ExternalLink } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { usePathname } from 'next/navigation';

const GithubIcon = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

export default function Footer() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const currentYear = new Date().getFullYear();

  if (pathname === '/setup') return null;

  return (
    <footer className="w-full border-t border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 mt-auto">
      <div className="container mx-auto px-4 py-8 md:py-12 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 lg:grid-cols-4">
          {/* Brand Section */}
          <div className="md:col-span-2 lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center space-x-2">
              <img src="/icon.png" alt="VR Rookie Icon" className="h-8 w-8" />
              <span className="text-xl font-bold tracking-tight">VR Rookie <span className="text-primary">Downloader</span></span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              {t('footer.description')}
            </p>
            <div className="flex space-x-4 pt-2">
              <a 
                href="https://github.com/yGuilhermy/VRRookieDownloader" 
                target="_blank" 
                rel="noreferrer" 
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="GitHub Repository"
              >
                <GithubIcon className="h-5 w-5" />
              </a>
              <a 
                href="https://rutracker.org" 
                target="_blank" 
                rel="noreferrer" 
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Rutracker Forum"
              >
                <ExternalLink className="h-5 w-5" />
              </a>
            </div>
          </div>
 
          {/* Navigation Links */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">{t('footer.navigation')}</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/" className="hover:text-primary transition-colors">{t('common.home')}</Link>
              </li>
              <li>
                <Link href="/sideload" className="hover:text-primary transition-colors">{t('common.sideload')}</Link>
              </li>
              <li>
                <Link href="/settings" className="hover:text-primary transition-colors">{t('common.settings')}</Link>
              </li>
            </ul>
          </div>
 
          {/* Legal/Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">{t('footer.info')}</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a 
                  href="https://github.com/yGuilhermy/VRRookieDownloader?tab=readme-ov-file#aviso-legal-disclaimer" 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center gap-2 hover:text-primary transition-colors"
                >
                  <Database className="h-3 w-3" /> 
                  <span>{t('footer.legal')}</span>
                </a>
              </li>
              <li>
                <a 
                  href="https://developer.android.com/tools/adb" 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center gap-2 hover:text-primary transition-colors"
                >
                  <Zap className="h-3 w-3 text-yellow-500" />
                  <span>{t('footer.poweredBy')}</span>
                </a>
              </li>
              <li>
                <a 
                  href="https://github.com/yGuilhermy/VRRookieDownloader" 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center gap-2 hover:text-primary transition-colors"
                >
                  <Activity className="h-3 w-3" /> 
                  <span>{t('footer.beta')}</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
 
        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-border/40 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted-foreground">
          <p>© {currentYear} VR Rookie Downloader · {t('footer.copyright')} · By <a href="https://github.com/yGuilhermy" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">@yGuilhermy</a>.</p>
          <div className="flex items-center gap-1">
            {t('footer.madeWith')} <Activity className="h-3 w-3 text-red-500 fill-red-500" /> {t('footer.forEnthusiasts')}
          </div>
        </div>
      </div>

      {/* Aesthetic gradient overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent pointer-events-none" />
    </footer>
  );
}
