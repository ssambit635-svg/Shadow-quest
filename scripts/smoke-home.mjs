/** Optional Playwright regression: see docs/mizu-guide.md for setup. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.env.HOME_TEST_URL ?? "http://localhost:5173";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const errors = [];
const screenshots = process.env.HOME_TEST_SCREENSHOTS;
if (screenshots) await mkdir(screenshots, { recursive: true });

async function makePage(options = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  // External font availability must not be required for the headline to exist.
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
  return page;
}
async function load(page) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('.mizu__launcher', { timeout: 15000 });
  assert.equal(await page.locator('.boot').count(), 0, 'loader should finish');
  assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '', 'scroll unlocks');
}
async function headline(page) {
  const state = await page.locator('[data-hero-title]').evaluate((el) => {
    const css = getComputedStyle(el);
    return { text: el.textContent, opacity: css.opacity, visibility: css.visibility,
      transform: css.transform, splits: el.querySelectorAll('.st-char, .st-line').length };
  });
  assert.match(state.text, /Real action\.[\s\S]*Real growth\./);
  assert.equal(state.opacity, '1');
  assert.equal(state.visibility, 'visible');
  assert.equal(state.transform, 'none');
  assert.equal(state.splits, 0, 'headline must never be split into animated glyphs');
}
async function scrollCheck(page) {
  for (const y of [1100, 3000, 0]) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
    await page.waitForTimeout(650);
    await headline(page);
  }
}
async function shot(page, name) {
  if (screenshots) await page.screenshot({ path: `${screenshots}/${name}.png` });
}

try {
  const page = await makePage({ viewport: { width: 1440, height: 1000 } });
  await load(page);
  await headline(page);
  assert.equal(await page.locator('.mizu__panel').count(), 1);
  assert.equal(await page.locator('audio').evaluate((audio) => audio.paused), true, 'no autoplay');
  await shot(page, 'home-desktop');
  await page.getByRole('button', { name: 'Hear my welcome' }).click();
  await page.waitForFunction(() => {
    const audio = document.querySelector('audio');
    return audio && !audio.paused && audio.currentTime > 0;
  });
  // Verify actual decode/playback, then seek to the end instead of waiting the full clip.
  await page.locator('audio').evaluate((audio) => { audio.currentTime = audio.duration - 0.15; });
  await page.waitForSelector('.mizu__panel', { state: 'detached', timeout: 5000 });
  await page.getByRole('button', { name: 'Chat with Mizu' }).click();
  await page.waitForFunction(() => document.activeElement?.id === 'mizu-message');
  await page.getByRole('button', { name: 'Find my focus' }).click();
  assert.match(await page.locator('.mizu__message').innerText(), /Deep Work/);
  await page.getByRole('button', { name: 'Voice on', exact: true }).click();
  await page.getByRole('button', { name: 'Build a streak' }).click();
  assert.equal(await page.locator('audio').evaluate((audio) => audio.paused), true);
  await page.locator('#mizu-message').fill('namaste');
  await page.getByRole('button', { name: 'Send message to Mizu' }).click();
  assert.match(await page.locator('.mizu__message').innerText(), /Konnichiwa, friend/);
  await page.locator('#mizu-message').fill('<script>alert(1)</script> quantum mechanics');
  await page.getByRole('button', { name: 'Send message to Mizu' }).click();
  assert.match(await page.locator('.mizu__message').innerText(), /beyond my little guidebook/);
  assert.equal(await page.locator('.mizu__question script').count(), 0);
  await page.locator('#mizu-message').press('Escape');
  assert.equal(await page.locator('.mizu__panel').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Chat with Mizu' }).evaluate(el => el === document.activeElement), true);
  await scrollCheck(page);
  await page.setViewportSize({ width: 1050, height: 800 });
  await page.waitForTimeout(700);
  await headline(page);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await headline(page);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.waitForTimeout(31000);
  await headline(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.mizu__launcher');
  assert.equal(await page.locator('.mizu__panel').count(), 0, 'dismissal survives refresh');
  await headline(page);
  await page.evaluate(() => { location.hash = '#/login'; });
  await page.waitForSelector('.home', { state: 'detached' });
  assert.equal(await page.locator('.mizu').count(), 0);
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForSelector('.mizu__launcher');
  await headline(page);
  await page.getByRole('button', { name: 'Chat with Mizu' }).click();
  await page.route('**/audio/*.mp3', route => route.abort());
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await page.waitForSelector('.mizu__error');
  assert.match(await page.locator('.mizu__message').innerText(), /Konnichiwa/);
  await page.context().close();
  console.log('ok desktop: static headline, idle, scroll, resize, theme, route return, refresh, voice, mute, chat, audio failure');

  const mobile = await makePage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await load(mobile);
  await headline(mobile);
  await shot(mobile, 'home-mobile');
  for (const width of [390, 320]) {
    await mobile.setViewportSize({ width, height: 844 });
    const box = await mobile.locator('.mizu__panel').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width, 'panel stays within mobile viewport');
    assert.ok(box.y >= 0 && box.y + box.height <= 844, 'panel stays vertically reachable');
  }
  await mobile.waitForTimeout(31000);
  assert.equal(await mobile.locator('.mizu__panel').count(), 0, 'silent welcome auto-docks');
  await scrollCheck(mobile);
  await mobile.context().close();
  console.log('ok mobile: narrow layout, silent intro auto-dock, persistent headline');

  const reduced = await makePage({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
  await reduced.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key) {
      if (this === sessionStorage) throw new DOMException('Storage blocked', 'SecurityError');
      return original.call(this, key);
    };
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (this === sessionStorage) throw new DOMException('Storage blocked', 'SecurityError');
      return write.call(this, key, value);
    };
  });
  await load(reduced);
  await headline(reduced);
  assert.equal(await reduced.locator('.mizu__panel').evaluate(el => getComputedStyle(el).animationName), 'none');
  await reduced.getByRole('button', { name: 'Minimize Mizu', exact: true }).click();
  await reduced.getByRole('button', { name: 'Chat with Mizu' }).click();
  await headline(reduced);
  await reduced.context().close();
  console.log('ok reduced motion and blocked session storage');
  assert.deepEqual(errors, [], 'no browser page errors');
  console.log('HOME SMOKE PASS');
} finally {
  await browser.close();
}
