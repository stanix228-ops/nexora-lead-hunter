import { initBrowser } from './scraper.service';

async function main() {
  const b = await initBrowser();
  const ctx = await b.newContext({
    locale: 'ru-RU',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });
  const p = await ctx.newPage();

  p.on('response', async (res) => {
    const url = res.url();
    if (url.includes('items/byid')) {
      try {
        console.log('=== FULL ITEMS/BYID RESPONSE ===');
        const json = await res.json();
        console.log(JSON.stringify(json, null, 2));
      } catch (err: any) {
        console.log('Err reading:', err.message);
      }
    }
  });

  const bypass = async () => {
    try {
      if (p.url().includes('museum')) {
        const el = await p.$('a:has-text("Пропустить")');
        if (el) {
          await Promise.all([p.waitForNavigation({ timeout: 15000 }).catch(() => {}), el.click()]);
          await p.waitForTimeout(2000);
        }
      }
    } catch {}
  };

  console.log('Navigating to 2GIS...');
  await p.goto('https://2gis.kz/almaty', { waitUntil: 'domcontentloaded' });
  await bypass();
  await p.waitForTimeout(1000);
  console.log('Searching for Стоматология...');
  await p.goto('https://2gis.kz/almaty/search/Стоматология', { waitUntil: 'domcontentloaded' });
  await bypass();
  if (p.url().includes('museum')) {
    await bypass();
    await p.goto('https://2gis.kz/almaty/search/Стоматология', { waitUntil: 'domcontentloaded' });
    await bypass();
  }
  await p.waitForTimeout(7000);

  console.log('Testing page 2 direct navigation...');
  await p.goto('https://2gis.kz/almaty/search/%D0%A1%D1%82%D0%BE%D0%BC%D0%B0%D1%82%D0%BE%D0%BB%D0%BE%D0%B3%D0%B8%D1%8F/page/2', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await p.waitForTimeout(4000);

  const p2Cards = await p.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/firm/"]'));
    return anchors.map(a => ({
      href: (a as HTMLAnchorElement).href,
      text: a.textContent?.trim(),
      id: a.getAttribute('href')?.match(/\/firm\/(\d+)/)?.[1],
    })).filter(f => f.text && f.text.length > 2 && f.id);
  });

  console.log(`Page 2 found ${p2Cards.length} firm cards:`);
  for (const c of p2Cards.slice(0, 5)) {
    console.log(`  - [${c.id}] ${c.text}`);
  }

  await b.close();
}

main().catch(console.error);
