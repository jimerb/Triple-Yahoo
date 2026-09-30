// Optional development check: requires Playwright and its Chromium browser.
// Run while the isolated trial server is listening on 127.0.0.1:4318.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.TRIAL_BROWSER || 'chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const errors = []; context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  const phone = await context.newPage(); const base = process.env.TRIAL_URL || 'http://127.0.0.1:4318';
  const output = process.env.TRIAL_SCREENSHOTS || path.join(__dirname, 'screenshots'); await fs.mkdir(output, { recursive: true });
  try {
    await phone.goto(base); await phone.locator('#names').fill('Jim, Terry'); await phone.locator('#create button').click();
    await phone.locator('#board h2').waitFor();
    assert.equal(await phone.locator('#cast').isDisabled(), true, 'No fake app ID or claim of available casting');
    assert.match(await phone.locator('#cast-status').innerText(), /Google registration/);
    await phone.locator('#roll').click(); await phone.waitForFunction(() => document.querySelector('.roll-info').textContent.includes('Roll 1'));
    const values = await phone.locator('[data-die]').evaluateAll(d => d.map(x => x.getAttribute('aria-label')));
    const href = await phone.locator('#preview').getAttribute('href');
    const tv = await context.newPage(); await tv.setViewportSize({ width: 1280, height: 720 }); await tv.goto(base + href);
    await tv.locator('#board h2').waitFor();
    assert.deepEqual(await tv.locator('[data-die]').evaluateAll(d => d.map(x => x.getAttribute('aria-label'))), values, 'Late display gets current dice');
    if (await tv.locator('#enable-sound').isVisible()) await tv.locator('#enable-sound').click();
    // A browser preview needs its own tap if autoplay is blocked. Never silently declare readiness.
    await tv.waitForFunction(() => document.querySelector('#audio-status').textContent.includes('Room sound plays here') || !document.querySelector('#enable-sound').hidden);
    if (await tv.locator('#enable-sound').isVisible()) await tv.locator('#enable-sound').click();
    await phone.waitForFunction(() => document.querySelector('#sound-status').textContent.includes('this phone is quiet'));
    const watcher = await context.newPage(); await watcher.goto(base + await phone.locator('#watch').getAttribute('href'));
    await watcher.locator('#separate').click(); await watcher.waitForFunction(() => document.querySelector('#sound-choice').hidden);
    assert.equal(await watcher.locator('[data-die]').first().isDisabled(), true, 'Viewer cannot roll');
    await phone.waitForFunction(() => !document.querySelector('[data-row="12"][data-column="0"]').disabled);
    await phone.locator('[data-row="12"][data-column="0"]').click();
    await tv.waitForFunction(() => document.querySelector('#board h2').textContent === "Terry's turn");
    assert.equal(await watcher.locator('#board h2').innerText(), "Terry's turn");
    assert.match(await tv.locator('.standings').innerText(), /Jim\s*\d+/);
    await phone.screenshot({ path: path.join(output,'phone.png'), fullPage:true });
    await tv.screenshot({ path:path.join(output,'tv.png'), fullPage:true });
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth); assert.equal(overflow,false);
    assert.equal(await tv.evaluate(() => document.documentElement.scrollHeight > innerHeight),false,'TV board fits 720p');
    await phone.reload(); await phone.locator('#board h2').waitFor(); assert.equal(await phone.locator('#board h2').innerText(), "Terry's turn");
    await phone.locator('#sound').click(); await phone.waitForFunction(() => document.querySelector('#sound-status').textContent==='Room sound: this phone');
    await tv.waitForFunction(() => document.querySelector('#audio-status').textContent.includes('moved to a phone'));
    await phone.waitForTimeout(4000); assert.equal(await phone.locator('#sound-status').innerText(),'Room sound: this phone','TV does not reclaim transferred sound');
    await phone.close(); assert.equal(await tv.locator('#board h2').innerText(),"Terry's turn",'Board survives controller closure');
    const sixContext = await browser.newContext({viewport:{width:1280,height:720}});
    const sixPhone = await sixContext.newPage(); await sixPhone.goto(base);
    await sixPhone.locator('#names').fill(Array.from({length:6},(_,i)=>`Player${i+1}-abcdefghijklmnop`).join(','));
    await sixPhone.locator('#create button').click(); await sixPhone.locator('#board h2').waitFor();
    const sixTV = await sixContext.newPage(); await sixTV.goto(base+await sixPhone.locator('#preview').getAttribute('href'));
    await sixTV.locator('#board h2').waitFor();
    assert.equal(await sixTV.locator('.standing').count(),6);
    assert.equal(await sixTV.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Six-player TV width');
    assert.equal(await sixTV.evaluate(()=>document.documentElement.scrollHeight>innerHeight),false,'Six-player TV height');
    await sixTV.screenshot({path:path.join(output,'tv-six.png'),fullPage:true});await sixContext.close();
    assert.deepEqual(errors,[]); console.log('PASS: independent board, phone controls, shared turn, separate viewer, late attach, refresh, audio handoff, controller closure, 390px phone and 720p TV. This is not physical casting proof.');
  } finally { await context.close(); await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
