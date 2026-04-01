import axios from 'axios';
import * as cheerio from 'cheerio';

export async function fetchGameImage(fullTitle: string, postImageUrl?: string): Promise<string | null> {
  // 1. Prioritize image from the forum post
  if (postImageUrl && (postImageUrl.startsWith('http') || postImageUrl.startsWith('//'))) {
    return postImageUrl.startsWith('//') ? `https:${postImageUrl}` : postImageUrl;
  }

  // Strip anything between [ ] and trim for external APIs
  const cleanTitle = fullTitle.replace(/\[.*?\]/g, '').trim();
  
  try {

    const searchUrl = `https://store.steampowered.com/search/?term=${encodeURIComponent(cleanTitle)}`;
    const response = await axios.get(searchUrl);
    const $ = cheerio.load(response.data);
    
    const firstResultImg = $('#search_resultsRows a:first-child .search_capsule img').attr('src');
    if (firstResultImg) {
      return firstResultImg.split('?')[0];
    }
    
    return null;
  } catch (err) {
    console.error('Failed to fetch image for', cleanTitle, err);
    return null;
  }
}
