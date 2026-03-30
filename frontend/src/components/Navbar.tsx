'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { useTranslation } from '@/lib/i18n';
import { Settings, Home, Gamepad2, WifiOff, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Navbar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { offlineMode } = useStore();

  if (pathname === '/setup') return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center flex-wrap px-4 sm:px-6 lg:px-8">
        <div className="mr-8 flex items-center mb-2 sm:mb-0">
          <Link href="/" className="flex items-center space-x-2">
            <img src="/icon.png" alt="VR Rookie Icon" className="h-8 w-8" />
            <span className="font-bold sm:inline-block hidden">VR Rookie Downloader</span>
          </Link>
        </div>
        
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <Link
              href="/"
              className={`transition-colors hover:text-foreground/80 ${pathname === '/' ? 'text-foreground' : 'text-foreground/60'}`}
            >
              <span className="flex items-center gap-2"><Home className="h-4 w-4" /> {t('common.home')}</span>
            </Link>
            <Link
              href="/sideload"
              className={`transition-colors hover:text-foreground/80 ${pathname === '/sideload' ? 'text-foreground' : 'text-foreground/60'}`}
            >
              <span className="flex items-center gap-2"><Gamepad2 className="h-4 w-4" /> {t('common.sideload')}</span>
            </Link>
            <Link
              href="/settings"
              className={`transition-colors hover:text-foreground/80 ${pathname === '/settings' ? 'text-foreground' : 'text-foreground/60'}`}
            >
              <span className="flex items-center gap-2"><Settings className="h-4 w-4" /> {t('common.settings')}</span>
            </Link>
          </nav>

          <div className="hidden sm:flex items-center space-x-2 border-l border-border pl-4 ml-4">
            {offlineMode ? (
              <div className="flex items-center text-sm gap-2 text-destructive font-medium">
                <WifiOff className="h-4 w-4" /> {t('common.offlineMode')}
              </div>
            ) : (
              <div className="flex items-center text-sm gap-2 text-green-500 font-medium">
                <Wifi className="h-4 w-4" /> {t('common.active')}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
