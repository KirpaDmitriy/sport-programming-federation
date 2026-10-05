import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('mockups/manifest.json', root), 'utf8'));
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const cards = manifest.screens.map((screen, index) => `
<article>
  <a class="preview" href="${escape(screen.file)}"><img src="${escape(screen.file)}" alt="${escape(screen.title_ru)}" loading="${index < 2 ? 'eager' : 'lazy'}"></a>
  <div class="caption"><span class="number">${String(index + 1).padStart(2, '0')}</span><div><h2>${escape(screen.title_ru)}</h2><code>${escape(screen.route)}</code></div><a class="open" href="${escape(screen.file)}">Открыть</a></div>
</article>`).join('\n');
const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ФСП / Карьера · Макеты фронтенда</title>
<style>
:root{color-scheme:light;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#251631;background:#f7f5fa}*{box-sizing:border-box}body{margin:0}header{padding:40px max(24px,calc((100vw - 1440px)/2));background:#281036;color:white}header p{max-width:960px;line-height:1.65;color:#e1d5ec}h1{font-size:clamp(28px,4vw,44px);margin:0 0 12px}main{max-width:1488px;margin:auto;padding:32px 24px 48px}.note{border-left:4px solid #650da0;padding:16px 20px;background:white;line-height:1.6;margin-bottom:28px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{border:1px solid #e4ddec;border-radius:14px;background:white;overflow:hidden}.preview{display:block;background:#ece6f3;line-height:0}img{width:100%;height:auto}h2{font-size:18px;margin:0 0 6px}code{font-size:12px;overflow-wrap:anywhere;color:#655371}.caption{display:flex;align-items:center;gap:14px;padding:20px}.caption>div{flex:1;min-width:0}.number{font-weight:750;color:#650da0}.open{color:#520978;min-height:44px;display:inline-flex;align-items:center;padding:0 10px}a:focus-visible{outline:3px solid #a16bdf;outline-offset:4px}footer{margin-top:30px;color:#655371;line-height:1.6}@media(max-width:980px){.grid{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style></head><body>
<header><h1>ФСП / Карьера</h1><p>10 макетов для реализации фронтенда. Кандидат подтверждает квалификацию, работодатель находит его по требованиям и направляет предложение с открытой зарплатой.</p></header>
<main><div class="note"><strong>Как пользоваться.</strong> Откройте изображение для просмотра в исходном размере. Точное поведение, поля и состояния описаны в документах пакета. Даты и подписи в изображениях не заменяют API-контракт. Страницы 01–05 показывают профиль до повышения, 06–10 продолжают сценарий после подтверждения уровня Мидл.</div><section class="grid">${cards}</section>
<footer>Это визуальные референсы. Регистрация, подтверждение почты, ошибки, история и другие обязательные состояния дополнительно описаны в <code>docs/SCREEN_SPECIFICATION.md</code>. Исправления и приоритет текстовых правил перечислены в <code>docs/MOCKUP_CORRECTIONS.md</code>.</footer></main></body></html>`;
await writeFile(new URL('mockups/index.html', root), html);
console.log(`Gallery built: ${manifest.screens.length} screens.`);
