import axios from 'axios';

export async function translateText(text: string, targetLang = 'pt'): Promise<string> {
  if (!text) return '';
  
  try {
    // Current character limit for the free API is around 5000 chars total for the URL
    // We'll chunk to safely stay under the limit
    const MAX_CHUNK_SIZE = 3500;
    
    if (text.length <= MAX_CHUNK_SIZE) {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
      const response = await axios.get(url);
      if (response.data && response.data[0]) {
        return response.data[0].map((item: any) => item[0]).join('');
      }
      return text;
    }

    // Split text into chunks that respect sentence boundaries if possible
    const chunks: string[] = [];
    let currentText = text;

    while (currentText.length > 0) {
      if (currentText.length <= MAX_CHUNK_SIZE) {
        chunks.push(currentText);
        break;
      }

      let splitAt = currentText.lastIndexOf('\n', MAX_CHUNK_SIZE);
      if (splitAt === -1 || splitAt < MAX_CHUNK_SIZE / 2) {
        splitAt = currentText.lastIndexOf('. ', MAX_CHUNK_SIZE);
      }
      if (splitAt === -1 || splitAt < MAX_CHUNK_SIZE / 2) {
        splitAt = MAX_CHUNK_SIZE;
      }

      chunks.push(currentText.slice(0, splitAt));
      currentText = currentText.slice(splitAt).trim();
    }

    const translatedChunks = await Promise.all(
      chunks.map(chunk => translateText(chunk, targetLang))
    );

    return translatedChunks.join('\n');
  } catch (error) {
    console.error('Translation error:', error);
    return text;
  }
}
