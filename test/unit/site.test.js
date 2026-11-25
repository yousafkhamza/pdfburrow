// The tool definitions, content and wiring are consistent.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';

import { NEXT, readOptions, SLUGS, TOOL_IDS, TOOLS } from '../../src/app/tools/meta.js';
import { GUIDES } from '../../src/content/guides.js';
import { staticPages } from '../../src/content/static.js';
import { CATEGORIES, CONTENT, SIZE_PAGES } from '../../src/content/tools.js';

describe('tool definitions', () => {
  it('every tool has content, a slug, code and a category', () => {
    const inCategories = CATEGORIES.flatMap((c) => c.tools);
    assert.deepEqual([...inCategories].sort(), [...TOOL_IDS].sort(), 'each tool in exactly one category');
    assert.equal(new Set(inCategories).size, inCategories.length);
    for (const id of TOOL_IDS) {
      assert.ok(CONTENT[id], `content for ${id}`);
      assert.ok(SLUGS[id], `slug for ${id}`);
      assert.ok(NEXT[id], `next steps for ${id}`);
      assert.ok(existsSync(new URL(`../../src/app/tools/${id}.js`, import.meta.url)), `code for ${id}`);
    }
  });
  it('slugs are unique, lowercase and URL-safe', () => {
    const slugs = Object.values(SLUGS);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const s of slugs) assert.match(s, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
  it('links between tools point to real tools', () => {
    for (const id of TOOL_IDS) {
      for (const n of NEXT[id]) assert.ok(TOOLS[n], `${id} -> next ${n}`);
      for (const r of CONTENT[id].related) assert.ok(TOOLS[r], `${id} -> related ${r}`);
      assert.ok(!CONTENT[id].related.includes(id), `${id} relates to itself`);
    }
    for (const g of GUIDES) assert.ok(TOOLS[g.tool], `guide ${g.slug} -> ${g.tool}`);
  });
  it('fields are well formed', () => {
    for (const id of TOOL_IDS) {
      const ids = TOOLS[id].fields.map((f) => f.id);
      assert.equal(new Set(ids).size, ids.length, `${id}: duplicate field ids`);
      for (const f of TOOLS[id].fields) {
        assert.ok(['select', 'number', 'text', 'password', 'checkbox'].includes(f.type), `${id}.${f.id} type`);
        assert.ok(f.label, `${id}.${f.id} label`);
        if (f.type === 'select') assert.ok(f.options.some(([v]) => v === f.default), `${id}.${f.id} default is an option`);
        if (f.showIf) assert.ok(ids.includes(f.showIf.field), `${id}.${f.id} showIf field`);
      }
      assert.equal(typeof TOOLS[id].button(2), 'string');
    }
  });
});

describe('reading options', () => {
  const compress = TOOLS.compress;
  it('uses defaults when nothing is set', () => {
    assert.deepEqual(readOptions(compress, {}), { level: 'recommended', allowPages: true });
  });
  it('rejects unknown select values', () => {
    assert.equal(readOptions(compress, { level: '<script>' }).level, 'recommended');
  });
  it('clamps numbers and parses checkboxes', () => {
    const split = readOptions(TOOLS.split, { every: '-4', mode: 'every' });
    assert.equal(split.every, 1);
    assert.equal(readOptions(TOOLS.split, { every: 'abc' }).every, 2);
    assert.equal(readOptions(compress, { allowPages: false }).allowPages, false);
    assert.equal(readOptions(compress, { allowPages: 'on' }).allowPages, true);
  });
  it('limits text length', () => {
    assert.equal(readOptions(TOOLS.watermark, { text: 'x'.repeat(200) }).text.length, 60);
  });
});

describe('content quality', () => {
  it('search titles and descriptions have useful lengths', () => {
    for (const [id, c] of Object.entries(CONTENT)) {
      assert.ok(`${c.metaTitle} | pdfburrow`.length <= 70, `${id} title too long: ${c.metaTitle}`);
      assert.ok(c.description.length >= 80 && c.description.length <= 165, `${id} description is ${c.description.length}`);
      assert.ok(c.steps.length >= 3, `${id} needs at least 3 steps`);
      assert.ok(c.faq.length >= 2, `${id} needs at least 2 FAQs`);
    }
    for (const s of SIZE_PAGES) assert.ok(`${s.metaTitle} | pdfburrow`.length <= 70);
    for (const g of GUIDES) {
      assert.ok(`${g.title} | pdfburrow`.length <= 70, `guide title too long: ${g.title}`);
      assert.ok(g.description.length >= 80 && g.description.length <= 165, `guide ${g.slug} description is ${g.description.length}`);
    }
    for (const p of staticPages({ repoUrl: 'https://example.com/x', updated: '1 January 2026' })) {
      assert.ok(p.description.length >= 50 && p.description.length <= 165, `${p.slug} description is ${p.description.length}`);
    }
  });
  it('no two pages share a title', () => {
    const titles = [...Object.values(CONTENT).map((c) => c.metaTitle), ...SIZE_PAGES.map((s) => s.metaTitle), ...GUIDES.map((g) => g.title)];
    assert.equal(new Set(titles).size, titles.length);
  });
});
