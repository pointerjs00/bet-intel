import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import puppeteerCore, { type HTTPRequest } from 'puppeteer-core';

const puppeteer = addExtra(puppeteerCore);
puppeteer.use(StealthPlugin());

const FOOTBALL_URL = 'https://www.betclic.pt/futebol-s1';
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
];

async function main() {
  const browser = await puppeteer.launch({
    executablePath:
      process.env.PUPPETEER_EXECUTABLE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] as string);
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
    });

    await page.setRequestInterception(true);
    page.on('request', (req: HTTPRequest) => {
      const type = req.resourceType();
      if (['image', 'media', 'font'].includes(type)) {
        req.abort();
        return;
      }

      req.continue();
    });

    await page.goto(FOOTBALL_URL, {
      waitUntil: 'networkidle2',
      timeout: 45_000,
    });

    await dismissCookieConsent(page);
    await sleep(1_500);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight * 0.5, behavior: 'smooth' }));
    await sleep(1_000);

    const overview = await page.evaluate(() => {
      const itemSelectors = [
        'sport-event-listitem',
        '[class*="event_item"]',
        '[data-type="sport-event"]',
      ];

      let items: Element[] = [];
      for (const selector of itemSelectors) {
        const found = Array.from(document.querySelectorAll(selector));
        if (found.length > 0) {
          items = found;
          break;
        }
      }

      const anchors = Array.from(document.querySelectorAll('a[href]'))
        .map((anchor) => ({
          href: anchor.getAttribute('href'),
          text: anchor.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          className: anchor.getAttribute('class'),
        }))
        .filter((anchor) => anchor.text.length > 0 || (anchor.href?.length ?? 0) > 0)
        .slice(0, 50);

      const buttons = Array.from(document.querySelectorAll('button, oddbutton, [role="button"]'))
        .map((button) => ({
          text: button.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          className: button.getAttribute('class'),
          dataTestId: button.getAttribute('data-testid'),
          ariaLabel: button.getAttribute('aria-label'),
        }))
        .filter((button) => button.text.length > 0)
        .slice(0, 50);

      return {
        bodyText: document.body?.innerText?.slice(0, 5_000) ?? '',
        anchors,
        buttons,
        items: items.slice(0, 3).map((item, index) => {
        const anchors = Array.from(item.querySelectorAll('a'))
          .map((anchor) => ({
            href: anchor.getAttribute('href'),
            text: anchor.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            className: anchor.getAttribute('class'),
          }))
          .filter((anchor) => anchor.href || anchor.text);

        const buttons = Array.from(item.querySelectorAll('button, oddbutton, [role="button"]'))
          .map((button) => ({
            text: button.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            className: button.getAttribute('class'),
            dataTestId: button.getAttribute('data-testid'),
            ariaLabel: button.getAttribute('aria-label'),
          }))
          .filter((button) => button.text);

        return {
          index,
          text: item.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          html: item.outerHTML.slice(0, 3_000),
          anchors,
          buttons: buttons.slice(0, 12),
        };
        }),
      };
    });

    console.log('OVERVIEW_START');
    console.log(JSON.stringify(overview, null, 2));
    console.log('OVERVIEW_END');

    const firstLink = await page.evaluate(() => {
      const item = document.querySelector('sport-event-listitem, [class*="event_item"], [data-type="sport-event"]');
      const anchor = item?.querySelector('a[href]')
        ?? document.querySelector('a.cardEvent[href]')
        ?? document.querySelector('a[href*="-m"][href*="/futebol-sfootball/"]')
        ?? document.querySelector('a[href*="/futebol-sfootball/"]');
      return anchor?.getAttribute('href') ?? null;
    });

    console.log(`FIRST_LINK=${firstLink ?? 'NONE'}`);

    if (firstLink) {
      const detailUrl = new URL(firstLink, page.url()).toString();
      await page.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 45_000 });
      await dismissCookieConsent(page);
      await sleep(2_000);

      const detail = await page.evaluate(() => {
        const marketButtons = Array.from(document.querySelectorAll('button, [role="tab"], [class*="market"]'))
          .map((element) => ({
            text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            className: element.getAttribute('class'),
            dataTestId: element.getAttribute('data-testid'),
          }))
          .filter((item) => item.text.length > 0)
          .slice(0, 60);

        const oddsButtons = Array.from(document.querySelectorAll('oddbutton, button'))
          .map((element) => ({
            text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            className: element.getAttribute('class'),
            dataTestId: element.getAttribute('data-testid'),
            ariaLabel: element.getAttribute('aria-label'),
          }))
          .filter((item) => /\d+[.,]\d+/.test(item.text))
          .slice(0, 80);

        return {
          url: location.href,
          title: document.title,
          bodyText: document.body?.innerText?.slice(0, 5_000) ?? '',
          marketButtons,
          oddsButtons,
        };
      });

      console.log('DETAIL_START');
      console.log(JSON.stringify(detail, null, 2));
      console.log('DETAIL_END');
    }
  } finally {
    await browser.close();
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dismissCookieConsent(page: import('puppeteer-core').Page) {
  const selectors = [
    '#tc_privacy_button_2',
    '#popin_tc_privacy_button_2',
    '#footer_tc_privacy_button_2',
    '#header_tc_privacy_button_2',
    '#onetrust-accept-btn-handler',
  ];

  for (const selector of selectors) {
    const button = await page.$(selector);
    if (button) {
      await button.click();
      return;
    }
  }

  await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll('button, [role="button"], a')).find((element) => {
      const text = element.textContent?.trim().toLowerCase() ?? '';
      return text.includes('aceitar tudo') || text.includes('accept all');
    });

    if (target) {
      (target as HTMLElement).click();
    }
  });
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});