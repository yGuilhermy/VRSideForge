/**
 * httpFetcher.ts
 * High-performance HTTP scraper using Axios + Cheerio.
 * Updated with Windows-1251 decoding and Lazy-Load <var> support.
 */

import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import * as iconv from 'iconv-lite';
import { getDb } from '../db/sqlite';

let axiosInstance: AxiosInstance | null = null;

export async function buildAxiosSession(): Promise<AxiosInstance> {
  const db = getDb();
  const session = await db.get('SELECT cookies FROM session WHERE id = 1');

  let cookieHeader = '';
  if (session && session.cookies) {
    const cookies: { name: string; value: string }[] = JSON.parse(session.cookies);
    cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  axiosInstance = axios.create({
    baseURL: 'https://rutracker.me/forum',
    timeout: 30000,
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7', 
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Connection': 'keep-alive',
      'Referer': 'https://rutracker.me/forum/',
      'Cookie': cookieHeader,
    }
  });

  return axiosInstance;
}

export function getAxiosInstance(): AxiosInstance {
  if (!axiosInstance) throw new Error('Axios session not initialized. Call buildAxiosSession() first.');
  return axiosInstance;
}

export async function fetchPostDetailsHttp(url: string, retries = 3) {
  const client = getAxiosInstance();

  let htmlUTF8 = '';
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await client.get(url.replace('https://rutracker.me/forum', ''));
      htmlUTF8 = iconv.decode(Buffer.from(res.data), 'win1251');
      break;
    } catch (err: any) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }

  const $ = cheerio.load(htmlUTF8);

  if ($('form').text().toLowerCase().includes('captcha') || $('#login-box').length > 0) {
    return null;
  }

  const title = $('.maintitle').first().text().trim();
  const magnet = $('a.magnet-link').attr('href');

  if (!title || !magnet) return null;

  // --- IMAGE EXTRACTION (Ultra-robust) ---
  const isValidImage = (src: string | undefined): boolean => {
    if (!src) return false;
    if (src.includes('rutracker.cc/smiles')) return false;
    if (src.includes('rutracker.cc/icons')) return false;
    if (src.endsWith('.gif')) return false;
    if (src.includes('clear.gif')) return false;
    if (src.includes('icon_')) return false;
    return true;
  };

  let postImage: string | undefined;

  // Strategy A: Check for <var class="postImg"> (Lazy-load pattern)
  $('var.postImg, var.postImgAligned').each((_, el) => {
    if (!postImage) {
      const titleAttr = $(el).attr('title');
      if (isValidImage(titleAttr)) postImage = titleAttr;
    }
  });

  // Strategy B: Check for <img> with postImg class
  if (!postImage) {
    $('img.postImgAligned, img.postImg').each((_, el) => {
      if (!postImage) {
        const src = $(el).attr('src');
        if (isValidImage(src)) postImage = src;
      }
    });
  }

  // Strategy C: BBCode via raw text (Cheerio loads <textarea> content automatically)
  if (!postImage) {
    const textareaContent = $('textarea').text();
    const bbMatch = textareaContent.match(/\[img(?:=[^\]]+)?\](https?:\/\/[^\[]+\.(?:png|jpg|jpeg|webp)[^\[]*?)\[\/img\]/i);
    if (bbMatch && isValidImage(bbMatch[1])) postImage = bbMatch[1].trim();
  }

  // Strategy D: Last resort - first valid image in post body
  if (!postImage) {
    $('.post_body img').each((_, el) => {
      if (!postImage) {
        const src = $(el).attr('src');
        if (isValidImage(src)) postImage = src;
      }
    });
  }

  let description = $('.post_body').first().text().trim();
  description = description
    .replace(/Скриншоты[\s\S]*?(?=\n\n|\n[A-Z]|[A-Z]|$)/gi, '')
    .replace(/Помощь Руtrekeru[\s\S]*$/gi, '')
    .replace(/\s{3,}/g, '\n\n')
    .trim();

  const textBody = (title + ' ' + description).toLowerCase();
  const tags: string[] = [];
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
    const sizeMatch = description.match(/Размер:\s*([\d\.]+\s*(GB|MB|KB|GB|MB|KB))/i);
    if (sizeMatch) size = sizeMatch[1];
  }

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
  const regMatch = statsTable.text().match(/Зарегистрирован:\s*([\w\d\sа-яА-ЯёЁ\-\.,]+)/i);
  const registeredAt = regMatch ? regMatch[1].trim() : '';
  const dlMatch = statsTable.text().match(/скачан:\s*(\d+)\s*раз/i) || statsTable.text().match(/\.torrent скачан:\s*(\d+)/i);
  const torrentDownloads = dlMatch ? parseInt(dlMatch[1]) : 0;

  return {
    title, description, magnet, post_url: url,
    tags: tags.join(','), size, postImage,
    seeds, leeches, registeredAt, torrentDownloads,
  };
}
