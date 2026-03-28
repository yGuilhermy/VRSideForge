import { getPage, saveCookies, launchBrowser, closeBrowser } from './browser';
import { buildAxiosSession, fetchPostDetailsHttp } from './httpFetcher';
import * as cheerio from 'cheerio';
import { getDb } from '../db/sqlite';
import { fetchGameImage } from '../utils/images';
import { translateText } from '../utils/translate';
import { io } from '../index';

let isRunning = false;
let currentStatus = 'Idle';
let captchaRequested = false;
let captchaData: { imageUrl?: string, id?: string } | null = null;
let resolveCaptcha: ((code: string) => void) | null = null;

/** Parallelism for HTTP requests — much safer than browser tabs */
const HTTP_CONCURRENCY = 8;

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export function getStatus() {
  return { isRunning, currentStatus, captchaRequested, captchaData };
}

export function stopScraper() {
  isRunning = false;
  currentStatus = 'Stopped';
}

export async function submitCaptcha(code: string) {
  if (resolveCaptcha) {
    resolveCaptcha(code);
    resolveCaptcha = null;
    captchaRequested = false;
    captchaData = null;
  }
}

export async function checkSession() {
  try {
    const page = await getPage('https://rutracker.me/forum/index.php');
    const content = await page.content();
    const $ = cheerio.load(content);
    if ($('#login-box').length > 0) return false;
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Puppeteer-based extractor — kept for retries/manual update where session matters.
 * For bulk scraping, use fetchPostDetailsHttp (10–20x faster).
 */
export async function extractPostDetails(url: string, useNewTab: boolean = false) {
  const page = await getPage(url, useNewTab);
  const content = await page.content();
  const $ = cheerio.load(content);

  if ($('form').text().toLowerCase().includes('captcha') || $('#login-box').length > 0) {
    captchaRequested = true;
    currentStatus = 'Waiting for Auth/Captcha on ' + url;
    if (useNewTab) await page.close();
    return null;
  }

  const title = $('.maintitle').first().text().trim();
  let description = $('.post_body').first().text().trim();
  const magnet = $('a.magnet-link').attr('href');

  // --- IMAGE EXTRACTION (multi-strategy with filtering) ---
  const isValidImage = (url: string | undefined): boolean => {
    if (!url) return false;
    if (url.includes('rutracker.cc/smiles')) return false;
    if (url.includes('rutracker.cc/icons')) return false;
    if (url.endsWith('.gif')) return false;
    if (url.includes('icon_')) return false;
    return true;
  };

  // Strategy 1: <img class="postImgAligned"> — the large aligned post image   
  let postImage: string | undefined;
  $('img.postImgAligned, img.postImg').each((_, el) => {
    if (!postImage) {
      const src = $(el).attr('src');
      if (isValidImage(src)) postImage = src;
    }
  });

  // Strategy 2: BBCode [img=right]URL[/img] inside the raw textarea
  if (!postImage) {
    const textareaContent = $('textarea').first().text();
    const bbMatch = textareaContent.match(/\[img(?:=[^\]]+)?\](https?:\/\/[^\[]+\.(?:png|jpg|jpeg|webp)[^\[]*?)\[\/img\]/i);
    if (bbMatch && isValidImage(bbMatch[1])) postImage = bbMatch[1].trim();
  }

  // Strategy 3: Any non-icon image inside the post body
  if (!postImage) {
    $('.post_body img').each((_, el) => {
      if (!postImage) {
        const src = $(el).attr('src');
        if (isValidImage(src)) postImage = src;
      }
    });
  }
  
  if (useNewTab) await page.close();

  if (!title || !magnet) return null;

  description = description
    .replace(/Скриншоты[\s\S]*?(?=\n\n|\n[A-Z]|[A-Z]|$)/gi, '')
    .replace(/Помощь Рутрекеру \| Донаты \| Donations[\s\S]*$/gi, '')
    .replace(/\s{3,}/g, '\n\n')
    .trim();

  const textBody = (title + ' ' + description).toLowerCase();
  const tags = [];
  if (textBody.includes('quest 3s')) tags.push('Quest 3S');
  else if (textBody.includes('quest 3')) tags.push('Quest 3');
  else if (textBody.includes('quest 2')) tags.push('Quest 2');
  else if (textBody.includes('quest')) tags.push('Quest');
  else if (textBody.includes('pcvr')) tags.push('PCVR');
  else tags.push('VR');

  let size = 'Unknown';
  const sizeFromElem = $('#tor-size-humn').text().trim();
  if (sizeFromElem) {
    size = sizeFromElem.replace(/&nbsp;|\s+/g, ' ');
  } else {
    const sizeMatch = description.match(/Размер:\s*([\d\.]+\s*(GB|MB|KB))/i);
    if (sizeMatch) size = sizeMatch[1];
  }

  // Stats (Improved Selector/Regex)
  const statsTable = $('#t-tor-stats');
  
  let seeds = parseInt($('span.seed b').text()) || 0;
  if (seeds === 0) {
    const seedMatch = statsTable.text().match(/Сиды:\s*(\d+)/i);
    if (seedMatch) seeds = parseInt(seedMatch[1]);
  }

  let leeches = parseInt($('span.leech b').text()) || 0;
  if (leeches === 0) {
    const leechMatch = statsTable.text().match(/Личи:\s*(\d+)/i);
    if (leechMatch) leeches = parseInt(leechMatch[1]);
  }
  
  const statsText = statsTable.text();
  const regMatch = statsText.match(/Зарегистрирован:\s*([\w\d\sа-яА-ЯёЁ\-\.,]+)/i);
  const registeredAt = regMatch ? regMatch[1].trim() : '';

  const dlMatch = statsText.match(/\.torrent скачан:\s*(\d+)/i) || statsText.match(/скачан:\s*(\d+)\s+раз/i);
  const torrentDownloads = dlMatch ? parseInt(dlMatch[1]) : 0;

  return { 
    title, description, magnet, post_url: url, tags: tags.join(','), 
    size, postImage, seeds, leeches, registeredAt, torrentDownloads 
  };
}

async function translateGame(title: string, description: string) {
  let translated_description = null;
  let translated_title = null;

  try {
    // 1. Translate description
    translated_description = await translateText(description, 'pt');

    // 2. Translate title (including the bracketed categories)
    translated_title = await translateText(title, 'pt');
  } catch (err) {
    console.log(`[!] Translation failed for ${title}.`);
  }

  // Extract meta-info
  let genre = description.match(/Жанр:\s*([^\n]+)/i)?.[1].trim();
  let developer = description.match(/Разработчик:\s*([^\n]+)/i)?.[1].trim();
  let publisher = description.match(/Издатель:\s*([^\n]+)/i)?.[1].trim();
  const version = description.match(/Версия:\s*([^\n]+)/i)?.[1].trim();
  let languages = description.match(/Языки:\s*([^\n]+)/i)?.[1].trim();
  let play_modes = description.match(/Поддерживаемые игровые режимы:\s*([^\n]+)/i)?.[1].trim();

  // 3. Translate metadata fields (they are short, so this is fast)
  try {
    if (genre) genre = await translateText(genre, 'pt');
    if (developer && developer !== 'Mikalai Kazei' && developer !== 'Unknown') developer = await translateText(developer, 'pt');
    if (publisher && publisher !== 'Mikalai Kazei' && publisher !== 'Unknown') publisher = await translateText(publisher, 'pt');
    if (languages) languages = await translateText(languages, 'pt');
    if (play_modes) play_modes = await translateText(play_modes, 'pt');
  } catch (err) {
    console.log(`[!] Metadata translation failed for ${title}.`);
  }

  return { 
    translated_description, 
    translated_title,
    genre, developer, publisher, version, languages, play_modes
  };
}

async function saveGameToDb(details: NonNullable<Awaited<ReturnType<typeof fetchPostDetailsHttp>>>, fallbackSize: string) {
  const db = getDb();
  const finalSize = (details.size && details.size !== 'Unknown') ? details.size : fallbackSize;
  const image_url = await fetchGameImage(details.title, details.postImage);
  
  const { translated_description, translated_title, genre, developer, publisher, version, languages, play_modes } = await translateGame(details.title, details.description);

  await db.run(
    `INSERT INTO games (title, translated_title, description, translated_description, magnet, post_url, tags, size, image_url, seeds, leeches, registered_at, torrent_downloads, genre, developer, publisher, version, languages, play_modes) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [details.title, translated_title, details.description, translated_description, details.magnet, details.post_url, details.tags, finalSize, image_url,
     details.seeds, details.leeches, details.registeredAt, details.torrentDownloads, genre, developer, publisher, version, languages, play_modes]
  );
  await db.run('DELETE FROM failed_games WHERE post_url = ?', [details.post_url]);
  console.log(`[✓] Saved: ${details.title}`);
  io.emit('game_saved', { title: details.title });
}

export async function startScraper() {
  if (isRunning) return;
  isRunning = true;
  currentStatus = 'Initializing...';
  console.log('--- Hybrid Scraper Started (Puppeteer list + HTTP details) ---');

  try {
    const db = getDb();

    const baseQueries = [
      { name: 'Oculos Quests games', url: 'https://rutracker.me/forum/tracker.php?f=2420' },
      { name: 'Deep Archive (All Quest)', url: 'https://rutracker.me/forum/viewforum.php?f=2420' },
      { name: 'Quest 3S', url: 'https://rutracker.me/forum/tracker.php?f=2420&nm=Quest+3S' },
      { name: 'VR Meta Quest', url: 'https://rutracker.me/forum/tracker.php?f=2420&nm=VR+Meta+Quest' },
      { name: 'Quest 3', url: 'https://rutracker.me/forum/tracker.php?f=2420&nm=Quest+3' },
    ];

    // Build the HTTP session from saved cookies once
    await buildAxiosSession();
    console.log('[HTTP] Axios session initialized from saved cookies.');

    for (const query of baseQueries) {
      if (!isRunning) break;
      let start = 0;
      let hasNextPage = true;

      console.log(`[List] Starting query: ${query.name}`);

      while (hasNextPage && isRunning) {
        const forumUrl = `${query.url}&start=${start}`;
        currentStatus = `Listing ${query.name} (offset ${start})...`;
        console.log(`[List] Navigating to: ${forumUrl}`);

        // Use Puppeteer ONLY for the list page (bot detection is common here)
        const page = await getPage(forumUrl);
        const content = await page.content();
        const $ = cheerio.load(content);

        const isTracker = forumUrl.includes('tracker.php');
        const rawItems: { link: string; size: string }[] = [];

        if (isTracker) {
          const rows = $('#tor-tbl tr.tCenter, tr.tCenter');
          console.log(`[List] Found ${rows.length} rows in tracker.`);
          rows.each((_, el) => {
            const link = $(el).find('a.tLink').attr('href');
            const size = $(el).find('a.tr-dl').text().replace('↓', '').trim();
            if (link) {
              const fullUrl = link.startsWith('http') ? link : `https://rutracker.me/forum/${link}`;
              rawItems.push({ link: fullUrl, size });
            }
          });
        } else {
          // viewforum.php logic
          const topicLinks = $('a.torTopic');
          console.log(`[List] Found ${topicLinks.length} topics in forum view.`);
          topicLinks.each((_, el) => {
            const link = $(el).attr('href');
            if (link) {
              const fullUrl = link.startsWith('http') ? link : `https://rutracker.me/forum/${link}`;
              rawItems.push({ link: fullUrl, size: 'Unknown' });
            }
          });
        }

        const nextBtn = $('a.pg, a.p-next').filter((_, el) => $(el).text().includes('След'));
        const hasNext = nextBtn.length > 0;

        if (rawItems.length === 0) {
          if ($('#login-box').length > 0 || content.includes('login.php')) {
            console.log(`[!] Auth required for ${query.name}. Stopping.`);
            captchaRequested = true;
          }
          hasNextPage = false;
          break;
        }
        const itemsToProcess: { link: string; size: string }[] = [];
        for (const item of rawItems) {
          const exists = await db.get('SELECT id FROM games WHERE post_url = ?', [item.link]);
          if (!exists) itemsToProcess.push(item);
          else console.log(`[Skip] ${item.link}`);
        }

        console.log(`[Queue] ${itemsToProcess.length} new items. Fetching with HTTP (concurrency=${HTTP_CONCURRENCY})...`);
        currentStatus = `Fetching ${itemsToProcess.length} items for ${query.name}...`;

        // Process in parallel HTTP batches (no browser needed)
        for (let i = 0; i < itemsToProcess.length; i += HTTP_CONCURRENCY) {
          if (!isRunning) break;
          const batch = itemsToProcess.slice(i, i + HTTP_CONCURRENCY);

          await Promise.allSettled(batch.map(async (item) => {
            let attempts = 0;
            const maxAttempts = 4;
            let success = false;

            while (attempts < maxAttempts && !success && isRunning) {
              try {
                attempts++;
                console.log(`[HTTP] Fetching (${attempts}/${maxAttempts}): ${item.link}`);
                const details = await fetchPostDetailsHttp(item.link);

                if (details) {
                  await saveGameToDb(details, item.size);
                  success = true;
                } else {
                  console.log(`[Auth?] No data from ${item.link}. Session may be expired.`);
                  await db.run(
                    `INSERT INTO failed_games (post_url, size, error_message, attempts) VALUES (?, ?, ?, ?)
                     ON CONFLICT(post_url) DO UPDATE SET attempts = attempts + 1, last_attempt = CURRENT_TIMESTAMP, error_message = ?`,
                    [item.link, item.size, 'Session expired or no data', attempts, 'Session expired or no data']
                  );
                  break;
                }
              } catch (err: any) {
                console.error(`[HTTP] Error on ${item.link}: ${err.message}`);
                if (attempts >= maxAttempts) {
                  await db.run(
                    `INSERT INTO failed_games (post_url, size, error_message, attempts) VALUES (?, ?, ?, ?)
                     ON CONFLICT(post_url) DO UPDATE SET attempts = attempts + 1, last_attempt = CURRENT_TIMESTAMP, error_message = ?`,
                    [item.link, item.size, err.message, attempts, err.message]
                  );
                } else {
                  await delay(1000 * attempts);
                }
              }
            }
          }));

          // Brief pause between HTTP batches
          if (isRunning) await delay(500 + Math.random() * 500);
        }

        if (hasNext) {
          start += 50;
          // Small pause between pages
          await delay(2000 + Math.random() * 1000);
        } else {
          hasNextPage = false;
        }
      }
    }

    console.log('--- Scraper Finished ---');
    currentStatus = 'Finished';
  } catch (err: any) {
    console.error('--- Scraper Fatal Error ---', err);
    currentStatus = `Error: ${err.message}`;
  } finally {
    isRunning = false;
  }
}

export async function updateGame(id: number, full: boolean = false) {
  const db = getDb();
  const game = await db.get('SELECT * FROM games WHERE id = ?', [id]);
  if (!game) throw new Error('Game not found');

  // Try HTTP first, fall back to Puppeteer
  let details = await fetchPostDetailsHttp(game.post_url).catch(() => null);
  if (!details) details = await extractPostDetails(game.post_url, true);
  if (!details) throw new Error('Could not fetch details from forum');

  if (full) {
    const image_url = await fetchGameImage(details.title, details.postImage);
    const { translated_description, translated_title, genre, developer, publisher, version, languages, play_modes } = await translateGame(details.title, details.description);
    
    await db.run(
      `UPDATE games SET title = ?, translated_title = ?, description = ?, translated_description = ?, magnet = ?, tags = ?, size = ?, image_url = ?, seeds = ?, leeches = ?, registered_at = ?, torrent_downloads = ?, genre = ?, developer = ?, publisher = ?, version = ?, languages = ?, play_modes = ? WHERE id = ?`,
      [details.title, translated_title, details.description, translated_description, details.magnet, details.tags, details.size, image_url, details.seeds, details.leeches, details.registeredAt, details.torrentDownloads, genre, developer, publisher, version, languages, play_modes, id]
    );
  } else {
    await db.run(
      `UPDATE games SET seeds = ?, leeches = ?, torrent_downloads = ? WHERE id = ?`,
      [details.seeds, details.leeches, details.torrentDownloads, id]
    );
  }

  return await db.get('SELECT * FROM games WHERE id = ?', [id]);
}

export async function retryFailedGame(id: number) {
  const db = getDb();
  const failed = await db.get('SELECT * FROM failed_games WHERE id = ?', [id]);
  if (!failed) throw new Error('Failed game record not found');

  let details = await fetchPostDetailsHttp(failed.post_url).catch(() => null);
  if (!details) details = await extractPostDetails(failed.post_url, true);
  if (!details) throw new Error('Could not fetch details from forum (session expired?)');

  const image_url = await fetchGameImage(details.title, details.postImage);
  
  const { translated_description, translated_title, genre, developer, publisher, version, languages, play_modes } = await translateGame(details.title, details.description);
  
  await db.run(
    `INSERT INTO games (title, translated_title, description, translated_description, magnet, post_url, tags, size, image_url, seeds, leeches, registered_at, torrent_downloads, genre, developer, publisher, version, languages, play_modes) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [details.title, translated_title, details.description, translated_description, details.magnet, details.post_url, details.tags, details.size, image_url,
     details.seeds, details.leeches, details.registeredAt, details.torrentDownloads, genre, developer, publisher, version, languages, play_modes]
  );

  await db.run('DELETE FROM failed_games WHERE id = ?', [id]);
  io.emit('game_saved', { title: details.title });
  return { success: true };
}

export async function retryAllFailedGames() {
  const db = getDb();
  const failed = await db.all('SELECT * FROM failed_games');
  
  let successes = 0;
  let errors = 0;

  for (const item of failed) {
    try {
      await retryFailedGame(item.id);
      successes++;
      await delay(800);
    } catch (e) {
      errors++;
      console.error(`[Retry All] Failed for ${item.post_url}`);
    }
  }

  return { successes, errors };
}
