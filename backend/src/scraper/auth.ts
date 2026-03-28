import { getPage, saveCookies } from './browser';
import { Page } from 'puppeteer';
import * as cheerio from 'cheerio';

let activeLoginPage: Page | null = null;

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

export async function loginToRutracker(
  username: string, 
  password: string, 
  captchaCode?: string, 
  captchaSid?: string, 
  captchaField?: string
) {
  console.log(`[Auth] loginToRutracker for ${username}. Has captcha: ${!!captchaCode}`);
  
  try {
    let page: Page;
    if (captchaCode && activeLoginPage && !activeLoginPage.isClosed()) {
        page = activeLoginPage;
        console.log('[Auth] Resuming previous login page for captcha submission.');
    } else {
        if (activeLoginPage && !activeLoginPage.isClosed()) {
            await activeLoginPage.close().catch(() => {});
        }
        page = await getPage(undefined, true, true); // Create fresh page without cookies
        
        console.log('[Auth] Opening fresh login page...');
        try {
            await page.goto('https://rutracker.me/forum/login.php', { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e: any) {
            console.warn('[Auth] Goto login page timed out, trying with networkidle2...');
            await page.goto('https://rutracker.me/forum/login.php', { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        }
        activeLoginPage = page;
    }

    // Wait for form - increased timeout and added multiple selector candidates
    try {
        await page.waitForSelector('input[name="login_username"]', { timeout: 15000 });
    } catch (e: any) {
        const title = await page.title();
        const content = await page.content();
        const url = page.url();
        console.error(`[Auth] Login form not found. Current URL: ${url}, Title: ${title}`);
        
        if (content.includes('login.php?mode=logout') || content.includes('Выход') || content.includes('logout')) {
            console.log('[Auth] Already logged in (Logout link found). Saving cookies and returning success.');
            await saveCookies(page);
            await page.close();
            activeLoginPage = null;
            return { success: true };
        }

        if (content.includes('ddos-guard') || content.includes('cloudflare')) {
            return { success: false, error: 'O site está sob proteção de tráfego. Aguarde alguns instantes e tente novamente.' };
        }
        
        // Final attempt: maybe it's just slow? Look for any input
        const hasInputs = await page.evaluate(() => document.querySelectorAll('input').length > 0);
        if (!hasInputs && !content.includes('rutracker')) {
             return { success: false, error: 'O site não respondeu corretamente. Verifique sua conexão ou se o RuTracker está online.' };
        }

        return { success: false, error: `Não foi possível localizar o formulário de login (URL: ${url}).` };
    }

    // 1. Fill fields - Always fill credentials because they might be cleared on failed attempt/reload
    console.log(`[Auth] Filling credentials for ${username}...`);
    
    // Helper to clear and type
    const clearAndType = async (selector: string, value: string) => {
        await page.focus(selector).catch(() => {});
        await page.evaluate((sel) => {
            const el = document.querySelector(sel) as HTMLInputElement;
            if (el) el.value = '';
        }, selector);
        await page.type(selector, value, { delay: 10 });
    };

    const userSelector = '#login-form-full input[name="login_username"]';
    const passSelector = '#login-form-full input[name="login_password"]';

    try {
        await page.waitForSelector('#login-form-full', { timeout: 5000 });
        await clearAndType(userSelector, username);
        await clearAndType(passSelector, password);
        await page.evaluate(() => {
            const form = document.querySelector('#login-form-full');
            if (form) {
                form.querySelectorAll('input').forEach(input => {
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                });
            }
        });
    } catch (e: any) {
        console.warn(`[Auth] Error filling credentials in #login-form-full: ${e.message}. Trying generic fallback.`);
        await page.evaluate((u, p) => {
            const userBox = (document.querySelector('#login-form-full input[name="login_username"]') || document.querySelector('input[name="login_username"]')) as HTMLInputElement;
            const passBox = (document.querySelector('#login-form-full input[name="login_password"]') || document.querySelector('input[name="login_password"]')) as HTMLInputElement;
            if (userBox) {
                userBox.value = u;
                userBox.dispatchEvent(new Event('input', { bubbles: true }));
                userBox.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (passBox) {
                passBox.value = p;
                passBox.dispatchEvent(new Event('input', { bubbles: true }));
                passBox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, username, password);
    }

    if (captchaCode && captchaField) {
        console.log(`[Auth] Filling captcha code into field: ${captchaField}`);
        const capSelector = `#login-form-full input[name="${captchaField}"]`;
        try {
            await clearAndType(capSelector, captchaCode);
            await page.evaluate((sel) => {
                const box = document.querySelector(`#login-form-full input[name="${sel}"]`);
                if (box) {
                    box.dispatchEvent(new Event('input', { bubbles: true }));
                    box.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, captchaField);
        } catch (e: any) {
            console.warn(`[Auth] Error filling captcha in #login-form-full: ${e.message}`);
            await page.evaluate((sel, code) => {
                const box = (document.querySelector(`#login-form-full input[name="${sel}"]`) || document.querySelector(`input[name="${sel}"]`)) as HTMLInputElement;
                if (box) {
                    box.value = code;
                    box.dispatchEvent(new Event('input', { bubbles: true }));
                    box.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, captchaField, captchaCode);
        }
    }
    
    await new Promise(r => setTimeout(r, 500)); // Small pause for JS to process inputs

    // 2. Submit
    console.log('[Auth] Attempting form submission...');
    const submitBtnSelector = '#login-form-full input[name="login"], #login-form-full input[type="submit"]';
    
    try {
        // Wait for the button to be visible and clickable in the FULL form
        const btn = await page.waitForSelector(submitBtnSelector, { visible: true, timeout: 5000 });
        if (btn) {
            await btn.scrollIntoView();
            console.log('[Auth] Clicking visible login button in #login-form-full...');
            await Promise.all([
               page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => console.log('[Auth] Navigation timeout - potential success or captcha...')),
               btn.click()
            ]);
        }
    } catch (e: any) {
        console.warn(`[Auth] Failed to click button in #login-form-full: ${e.message}. Trying direct form submission.`);
        await page.evaluate(() => {
            const form = document.querySelector('#login-form-full') as HTMLFormElement;
            if (form) {
                console.log('[Auth] Submitting #login-form-full via JS...');
                form.submit();
            } else {
                console.warn('[Auth] #login-form-full not found even during submission fallback.');
            }
        });
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    }

    // Small delay to ensure any JS-based redirects happen
    await new Promise(r => setTimeout(r, 2000));

    // 3. Re-evaluate
    const finalUrl = page.url();
    const title = await page.title();
    const content = await page.content();
    console.log(`[Auth] Evaluation after submission. URL: ${finalUrl}, Title: ${title}`);
    
    const $ = cheerio.load(content);
    
    const errorMsg = $('.warnColor1').text().trim() || $('.error').text().trim();
    const logoutLink = content.includes('login.php?mode=logout') || content.includes('Выход') || content.includes('logout');
    const profileLink = content.includes('profile.php') || content.includes('u=');

    if (logoutLink && profileLink && !errorMsg) {
        console.log('[Auth] Success! Logged in as ' + username);
        await saveCookies(page);
        await page.close();
        activeLoginPage = null;
        return { success: true };
    }

    // Check for captcha demand
    const captchaImg = $('img[alt="pic"]').attr('src');
    const capSidInput = $('input[name="cap_sid"]').val();
    const capCodeInputName = $('input[name^="cap_code_"]').attr('name');

    if (captchaImg && capSidInput && capCodeInputName) {
        console.log(`[Auth] Action required: Captcha needed. (Field: ${capCodeInputName})`);
        return {
          success: false,
          requiresCaptcha: true,
          captchaUrl: captchaImg.startsWith('http') ? captchaImg : `https://rutracker.me/forum/${captchaImg}`,
          captchaSid: String(capSidInput),
          captchaField: capCodeInputName
        };
    }

    if (errorMsg) {
        console.log(`[Auth] Forum Error: ${errorMsg}`);
        // If error but also on login page, keep it open for retry? 
        // No, usually it's cleaner to reset or wait for next attempt.
        return { success: false, error: translateError(errorMsg) };
    }

    console.warn('[Auth] Unknown state after login attempt. Content length: ' + content.length);
    return { success: false, error: 'Login falhou sem erro específico. Verifique suas credenciais.' };

  } catch (err: any) {
    console.error(`[Auth] Error: ${err.message}`);
    if (activeLoginPage) {
        await activeLoginPage.close().catch(() => {});
        activeLoginPage = null;
    }
    return { success: false, error: `Erro no navegador: ${err.message}` };
  }
}
