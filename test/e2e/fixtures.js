// Shared test setup. Every test automatically checks two promises the site makes:
//   1. no JavaScript errors on the page
//   2. no file data leaves the browser: only GET requests to the site itself (and Google Fonts)
import { readFile } from 'node:fs/promises';
import { test as base, expect } from '@playwright/test';

import { fixture } from './paths.js';

export { expect };

export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const errors = [];
    const leaks = [];
    const site = new URL(baseURL).origin;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol === 'blob:' || url.protocol === 'data:') return;
      if (request.method() !== 'GET' || request.postData()) leaks.push(`${request.method()} ${request.url()}`);
      else if (url.origin !== site && !/^fonts\.(googleapis|gstatic)\.com$/.test(url.host)) leaks.push(`external GET ${request.url()}`);
    });
    await use(page);
    expect(errors, 'the page threw JavaScript errors').toEqual([]);
    expect(leaks, 'the page sent data or contacted another server').toEqual([]);
  },
});

/** Open a tool page and wait until it is ready to use. */
export async function openTool(page, slug) {
  await page.goto(`${slug}/`);
  await expect(page.locator('#tool.ready')).toBeAttached();
}

export async function addFiles(page, names) {
  await page.setInputFiles('#file-input', names.map((n) => (typeof n === 'string' ? fixture(n) : n)));
  await expect(page.locator('#workspace')).toBeVisible();
}

/** Click a button that starts a download and return the downloaded file. */
export async function download(page, locator) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(locator).first().click()]);
  return { name: dl.suggestedFilename(), bytes: new Uint8Array(await readFile(await dl.path())) };
}

/** Press the tool's main button, wait for the result, and download the single output. */
export async function runAndDownload(page) {
  await page.locator('#run').click();
  await expect(page.locator('#done')).toBeVisible({ timeout: 80_000 });
  return download(page, '#download');
}

export async function runOnly(page) {
  await page.locator('#run').click();
  await expect(page.locator('#done, #error:not([hidden])').first()).toBeVisible({ timeout: 80_000 });
}
