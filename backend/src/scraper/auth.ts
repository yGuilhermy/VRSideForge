import axios from 'axios';
import * as cheerio from 'cheerio';
import * as iconv from 'iconv-lite';
import { getDb } from '../db/sqlite';
import { URLSearchParams } from 'url';

const LOGIN_URL = 'https://rutracker.me/forum/login.php';

const ERROR_MAP: Record<string, string> = {
  'Вы ввели неверное/неактивное имя пользователя или неверный пароль': 'Usuário ou senha incorretos.',
  'Введите код подтверждения': 'Código de confirmação (Captcha) incorreto ou ausente.',
  'Код подтверждения не соответствует отображенному на картинке': 'O código do Captcha não coincide com a imagem.'
};

function translateError(msg: string): string {
  for (const [ru, pt] of Object.entries(ERROR_MAP)) {
    if (msg.includes(ru)) return pt;
  }
  return msg;
}

/**
 * Encodes params to Windows-1251 application/x-www-form-urlencoded
 */
function encodeParams(params: Record<string, string>): Buffer {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    const encodedKey = encodeURIComponent(key);
    // Encode value to win1251, then to URI percent format
    const win1251Buffer = iconv.encode(value, 'win1251');
    const encodedValue = Array.from(win1251Buffer)
      .map(b => '%' + b.toString(16).toUpperCase().padStart(2, '0'))
      .join('');
    parts.push(`${encodedKey}=${encodedValue}`);
  }
  return Buffer.from(parts.join('&'));
}

export async function loginToRutracker(
  username: string, 
  password: string, 
  captchaCode?: string, 
  captchaSid?: string, 
  captchaField?: string,
  pendingCookies?: string[]
) {
  const db = getDb();

  const payload: Record<string, string> = {
    'login_username': username,
    'login_password': password,
    'login': 'вход',
    'redirect': 'index.php'
  };

  if (captchaCode && captchaSid && captchaField) {
    payload['cap_sid'] = captchaSid;
    payload[captchaField] = captchaCode;
  }

  const encodedBody = encodeParams(payload);

  try {
    const response = await axios.post(LOGIN_URL, encodedBody, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Origin': 'https://rutracker.me',
        'Referer': LOGIN_URL,
        'Cookie': pendingCookies ? pendingCookies.join('; ') : ''
      },
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    const body = iconv.decode(Buffer.from(response.data), 'win1251');
    const $ = cheerio.load(body);

    const errorMsg = $('.warnColor1').text().trim();
    const captchaImg = $('img[alt="pic"]').attr('src');
    const capSidInput = $('input[name="cap_sid"]').val();
    const capCodeInputName = $('input[name^="cap_code_"]').attr('name');

    // Combine previous cookies with new ones
    const newCookies = response.headers['set-cookie'] || [];
    const mergedCookies = pendingCookies ? [...pendingCookies, ...newCookies] : newCookies;

    if (captchaImg && capSidInput && capCodeInputName) {
      return {
        success: false,
        requiresCaptcha: true,
        captchaUrl: captchaImg.startsWith('http') ? captchaImg : `https://rutracker.me/forum/${captchaImg}`,
        captchaSid: String(capSidInput),
        captchaField: capCodeInputName,
        pendingCookies: mergedCookies
      };
    }

    if (errorMsg && !response.headers['set-cookie']) {
      return { success: false, error: translateError(errorMsg) };
    }

    if (response.headers['set-cookie'] || body.includes('profile.php') || response.status === 302) {
      const allCookies = response.headers['set-cookie'] || mergedCookies;
      
      const sessionCookies = allCookies.map(c => {
        const parts = c.split(';')[0].split('=');
        return {
          name: parts[0],
          value: parts.slice(1).join('='),
          domain: 'rutracker.me',
          path: '/forum/',
          httpOnly: c.includes('HttpOnly'),
          secure: c.includes('Secure')
        };
      });

      await db.run('INSERT OR REPLACE INTO session (id, cookies) VALUES (1, ?)', [JSON.stringify(sessionCookies)]);
      return { success: true };
    }

    return { success: false, error: 'Login falhou. Verifique suas credenciais.' };

  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
