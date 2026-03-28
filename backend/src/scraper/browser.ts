import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import { getDb } from '../db/sqlite';

puppeteer.use(StealthPlugin());

let browser: Browser | null = null;
let activePage: Page | null = null;

export async function launchBrowser(headless: boolean = true) {
  // If browser exists but headless mode doesn't match requested mode, close it and restart
  if (browser) {
    // There isn't a direct way to check headless status of a running browser easily via Puppeteer API
    // but we can trust the call origin. For simplicity, we just check if it's already there.
    // However, if we want to FORCE non-headless for manual login:
    if (!headless && (browser as any)._process?.spawnargs.includes('--headless')) {
        console.log('[Browser] Restarting browser in non-headless mode...');
        await closeBrowser();
    }
  }

  if (!browser) {
    browser = await puppeteer.launch({
      headless,
      protocolTimeout: 240000,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }) as unknown as Browser;
  }
  return browser;
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    activePage = null;
  }
}

export async function getPage(url?: string, useNewTab: boolean = false, skipCookies: boolean = false): Promise<Page> {
  const b = await launchBrowser();
  let page: Page;
  
  if (useNewTab) {
    page = await b.newPage();
  } else {
    if (!activePage || activePage.isClosed()) {
      activePage = await b.newPage();
      await activePage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    }
    page = activePage;
  }
  
  if (!skipCookies) {
    // Always try to load cookies from DB to reflect recent logins
    const db = getDb();
    const session = await db.get('SELECT cookies FROM session WHERE id = 1');
    if (session && session.cookies) {
      try {
        const cookies = JSON.parse(session.cookies);
        if (Array.isArray(cookies) && cookies.length > 0) {
          await page.setCookie(...cookies).catch(e => console.warn('[Browser] Error setting cookies:', e.message));
        }
      } catch (e) {
        console.warn('[Browser] Failed to parse session cookies');
      }
    }
  }

  if (url) {
    try {
      // Faster navigation: domcontentloaded is usually enough for scraping logic
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e: any) {
      console.warn(`[Browser] Navigation warning for ${url}: ${e.message}`);
      // Try again with different wait if it timed out
      if (e.message.includes('timeout')) {
        await page.goto(url, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
      }
    }
  }
  return page;
}

export async function saveCookies(page: Page) {
  const cookies = await page.cookies();
  const db = getDb();
  await db.run('INSERT OR REPLACE INTO session (id, cookies) VALUES (1, ?)', [JSON.stringify(cookies)]);
}
