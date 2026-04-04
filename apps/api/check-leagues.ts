import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());

async function main() {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    userDataDir: '.scraper-profiles/betclic-diag',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('https://www.betclic.pt/futebol-s1', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));

  const samples = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('a.cardEvent[href*="/futebol-"]'));
    const results: Array<{ href: string; league: string; teams: string }> = [];
    for (const card of cards) {
      const href = card.getAttribute('href') || '';
      if (!href.toLowerCase().includes('alemanha') && !href.toLowerCase().includes('bundesliga')) continue;
      const teamEls = card.querySelectorAll('[class*="scoreboard_contestantLabel"]');
      const teams = Array.from(teamEls).map(e => e.textContent?.trim()).join(' vs ');
      let leagueText = '';
      let node: Element | null = card;
      while (node) {
        const title = node.querySelector('[class*="competition_title"], [class*="competition-name"]');
        if (title || (node !== card && node.matches?.('[class*="competition"]'))) {
          leagueText = (title || node).textContent?.trim() || '';
          break;
        }
        node = node.parentElement;
      }
      results.push({ href, league: leagueText, teams });
    }
    return results.slice(0, 30);
  });

  console.log('=== German event samples from Betclic DOM ===');
  for (const s of samples) {
    const slugMatch = s.href.match(/\/futebol-sfootball\/([^/]+)\//);
    const slug = slugMatch?.[1] || '?';
    console.log(`  slug: ${slug} | DOM league: "${s.league}" | ${s.teams}`);
  }
  await browser.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
