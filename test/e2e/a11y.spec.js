// Accessibility: no serious or critical WCAG 2.1 A/AA problems, before and after adding files.
import AxeBuilder from '@axe-core/playwright';
import { addFiles, expect, openTool, test } from './fixtures.js';

async function audit(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
}

for (const path of ['', 'guides/', 'guides/redact-a-pdf-properly/', 'privacy/']) {
  test(`page "/${path}" has no serious accessibility problems`, async ({ page }) => {
    await page.goto(path);
    expect(await audit(page)).toEqual([]);
  });
}

for (const [slug, files] of [
  ['merge-pdf', ['three.pdf', 'five.pdf']],
  ['sign-pdf', ['three.pdf']],
  ['organize-pdf', ['three.pdf']],
  ['redact-pdf', ['three.pdf']],
  ['compress-pdf', ['three.pdf']],
]) {
  test(`${slug} is accessible before and after adding files`, async ({ page }) => {
    await openTool(page, slug);
    expect(await audit(page)).toEqual([]);
    await addFiles(page, files);
    await page.waitForTimeout(500);
    expect(await audit(page)).toEqual([]);
  });
}

test('works with the keyboard alone @smoke', async ({ page }) => {
  await openTool(page, 'merge-pdf');
  // Tab to the file picker: it must be focusable even though it is visually hidden.
  await page.keyboard.press('Tab');
  let found = false;
  for (let i = 0; i < 15 && !found; i += 1) {
    found = await page.evaluate(() => document.activeElement?.id === 'file-input');
    if (!found) await page.keyboard.press('Tab');
  }
  expect(found, 'the file picker can be reached with Tab').toBe(true);
});
