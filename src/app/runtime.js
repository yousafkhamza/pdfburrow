// Tool page controller: files in, options, run, result out. Each tool only supplies run()
// (and optionally a custom panel); everything people interact with in common lives here.
import { formatBytes, pluralize } from './core/format.js';
import * as engine from './engine.js';
import { describe, inspect, pdfOf, previewUrl } from './files.js';
import { handOff, saveBlob, takeHandOff, zip } from './io.js';
import { renderPage } from './render.js';
import { NEXT, readOptions, SLUGS, TOOLS } from './tools/meta.js';
import { announce, h, nextFrame, toolUrl } from './ui.js';

const ACCEPT_WORD = { pdf: 'a PDF', image: 'an image', 'pdf+image': 'a PDF or image' };

export async function startTool(root) {
  const id = root.dataset.tool;
  const meta = TOOLS[id];
  const impl = (await import(`./tools/${id}.js`)).default;
  const $ = (sel) => root.querySelector(sel);
  const els = {
    drop: $('#drop'),
    input: $('#file-input'),
    workspace: $('#workspace'),
    list: $('#files'),
    total: $('#files-total'),
    custom: $('#custom'),
    form: $('#options'),
    run: $('#run'),
    runHint: $('#run-hint'),
    busy: $('#busy'),
    bar: $('#bar'),
    status: $('#status'),
    cancel: $('#cancel'),
    error: $('#error'),
    done: $('#done'),
  };

  const state = { entries: [], busy: false, cancelled: false, preset: {} };
  try {
    state.preset = JSON.parse(root.dataset.preset || '{}');
  } catch {
    state.preset = {};
  }

  // ---------- options ----------
  function rawOptions() {
    const raw = {};
    for (const f of meta.fields) {
      const el = els.form?.elements.namedItem(f.id);
      if (!el) continue;
      raw[f.id] = f.type === 'checkbox' ? el.checked : el.value;
    }
    return raw;
  }
  function syncFields() {
    for (const wrap of els.form?.querySelectorAll('[data-show-field]') ?? []) {
      const control = els.form.elements.namedItem(wrap.dataset.showField);
      wrap.hidden = !(control && wrap.dataset.showValues.split('|').includes(control.value));
    }
  }
  function setOption(fieldId, value) {
    const el = els.form?.elements.namedItem(fieldId);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!value;
    else el.value = String(value);
    syncFields();
  }
  for (const [key, value] of Object.entries(state.preset)) setOption(key, value);

  // ---------- context passed to tools ----------
  const ctx = {
    meta,
    root,
    get entries() {
      return state.entries;
    },
    get options() {
      return readOptions(meta, rawOptions());
    },
    custom: els.custom,
    engine,
    setOption,
    update: () => update(),
    progress(fraction, text) {
      if (state.cancelled) throw Object.assign(new Error('Cancelled.'), { code: 'cancelled' });
      if (typeof fraction === 'number') {
        els.bar.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
        els.bar.parentElement.classList.remove('indeterminate');
      } else {
        els.bar.parentElement.classList.add('indeterminate');
      }
      if (text) els.status.textContent = text;
    },
    get cancelled() {
      return state.cancelled;
    },
    nextFrame,
  };

  // ---------- files ----------
  function accepts(entry) {
    if (meta.accept === 'pdf') return entry.kind === 'pdf';
    if (meta.accept === 'image') return entry.isImage;
    return entry.kind === 'pdf' || entry.isImage;
  }

  async function addFiles(files) {
    if (state.busy || !files?.length) return;
    hideError();
    const described = await Promise.all([...files].map(describe));
    const ok = described.filter(accepts);
    const rejected = described.filter((e) => !accepts(e));
    const messages = [];
    if (rejected.length) {
      const names = rejected.map((e) => `"${e.name}"`).join(', ');
      messages.push(`${names} ${rejected.length === 1 ? "isn't" : "aren't"} ${ACCEPT_WORD[meta.accept]}.`);
    }
    if (!ok.length) {
      if (messages.length) showError(messages.join(' '));
      return;
    }
    if (meta.multiple) state.entries.push(...ok);
    else {
      if (ok.length > 1) messages.push('This tool works on one file at a time, so only the first was added.');
      for (const old of state.entries) {
        old.pdf?.destroy?.();
        dropThumb(old);
      }
      state.entries = ok.slice(0, 1);
    }
    if (meta.maxFiles && state.entries.length > meta.maxFiles) {
      messages.push(`Only ${meta.maxFiles} files are used here; the extra ones were left out.`);
      state.entries = state.entries.slice(0, meta.maxFiles);
    }
    if (messages.length) showError(messages.join(' '), 'warn');
    els.done.hidden = true;
    els.workspace.hidden = false;
    els.drop.classList.add('compact');
    renderList();
    update();
    announce(`${pluralize(ok.length, 'file')} added.`);
    await Promise.all(ok.map(inspect));
    renderList();
    await impl.onFiles?.(ctx);
    update();
  }

  function removeEntry(entry) {
    entry.pdf?.destroy?.();
    dropThumb(entry);
    state.entries = state.entries.filter((e) => e !== entry);
    if (!state.entries.length) {
      els.workspace.hidden = true;
      els.drop.classList.remove('compact');
      impl.onClear?.(ctx);
    }
    renderList();
    impl.onFiles?.(ctx);
    update();
  }

  function move(entry, delta) {
    const i = state.entries.indexOf(entry);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= state.entries.length) return;
    const list = [...state.entries];
    [list[i], list[j]] = [list[j], list[i]];
    state.entries = list;
    renderList();
    impl.onFiles?.(ctx);
    update();
    els.list.querySelectorAll('.file')[j]?.querySelector(delta < 0 ? '.up' : '.down')?.focus();
  }

  // Thumbnail URL per file: an object URL for images, a small rendered JPEG for PDFs.
  const thumbs = new Map();
  function thumbUrl(entry) {
    if (!thumbs.has(entry.id)) {
      thumbs.set(
        entry.id,
        (async () => {
          if (entry.isImage && entry.kind !== 'heic') return previewUrl(entry);
          if (entry.kind !== 'pdf' || entry.locked || entry.broken) return null;
          try {
            const { canvas } = await renderPage(await pdfOf(entry), 1, { width: 96 });
            return canvas.toDataURL('image/jpeg', 0.8);
          } catch {
            return null;
          }
        })(),
      );
    }
    return thumbs.get(entry.id);
  }
  function dropThumb(entry) {
    const url = thumbs.get(entry.id);
    thumbs.delete(entry.id);
    url?.then((u) => u?.startsWith('blob:') && URL.revokeObjectURL(u));
  }

  function renderList() {
    const many = meta.multiple && state.entries.length > 1;
    els.list.replaceChildren(
      ...state.entries.map((entry, i) => {
        const status = entry.locked && !meta.allowLocked
          ? h('span', { class: 'flag warn', text: 'Password-protected' })
          : entry.broken
            ? h('span', { class: 'flag warn', text: "Can't be read" })
            : null;
        const details = [
          entry.pageCount ? pluralize(entry.pageCount, 'page') : null,
          formatBytes(entry.size),
        ].filter(Boolean).join(' · ');
        const thumbSlot = h('span', { class: 'thumb-slot' }, h('span', { class: 'thumb blank', 'aria-hidden': 'true', text: entry.kind === 'heic' ? 'HEIC' : '' }));
        thumbUrl(entry).then((url) => {
          if (url) thumbSlot.replaceChildren(h('img', { src: url, alt: '', class: 'thumb' }));
        });
        const label = meta.labels?.[i];
        const li = h(
          'li',
          { class: 'file', draggable: many ? 'true' : 'false', dataset: { index: String(i) } },
          many ? h('span', { class: 'grip', 'aria-hidden': 'true' }) : null,
          thumbSlot,
          h(
            'span',
            { class: 'file-text' },
            label ? h('span', { class: 'file-label', text: label }) : null,
            h('span', { class: 'file-name', text: entry.name, title: entry.name }),
            h('span', { class: 'file-meta' }, details, status ? ' ' : '', status),
          ),
          h(
            'span',
            { class: 'file-actions' },
            many
              ? [
                  h('button', { type: 'button', class: 'icon up', 'aria-label': `Move ${entry.name} up`, disabled: i === 0, onclick: () => move(entry, -1), text: '↑' }),
                  h('button', { type: 'button', class: 'icon down', 'aria-label': `Move ${entry.name} down`, disabled: i === state.entries.length - 1, onclick: () => move(entry, 1), text: '↓' }),
                ]
              : null,
            h('button', { type: 'button', class: 'icon remove', 'aria-label': `Remove ${entry.name}`, onclick: () => removeEntry(entry), text: '×' }),
          ),
        );
        return li;
      }),
    );
    const size = state.entries.reduce((a, e) => a + e.size, 0);
    const pages = state.entries.reduce((a, e) => a + (e.pageCount || (e.isImage ? 1 : 0)), 0);
    els.total.textContent = state.entries.length > 1 ? `${pluralize(state.entries.length, 'file')} · ${pages ? `${pluralize(pages, 'page')} · ` : ''}${formatBytes(size)}` : '';
  }

  // Drag to reorder.
  let dragIndex = null;
  els.list.addEventListener('dragstart', (event) => {
    const li = event.target.closest('.file');
    if (!li) return;
    dragIndex = Number(li.dataset.index);
    li.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    try {
      event.dataTransfer.setData('text/plain', li.dataset.index);
    } catch {
      /* some browsers need data to start a drag */
    }
  });
  els.list.addEventListener('dragover', (event) => {
    if (dragIndex === null) return;
    event.preventDefault();
    const over = event.target.closest('.file');
    els.list.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
    if (over) {
      const r = over.getBoundingClientRect();
      over.classList.add(event.clientY - r.top > r.height / 2 ? 'drop-after' : 'drop-before');
    }
  });
  els.list.addEventListener('drop', (event) => {
    if (dragIndex === null) return;
    event.preventDefault();
    event.stopPropagation();
    const over = event.target.closest('.file');
    if (over) {
      const r = over.getBoundingClientRect();
      let to = Number(over.dataset.index) + (event.clientY - r.top > r.height / 2 ? 1 : 0);
      const list = [...state.entries];
      const [moved] = list.splice(dragIndex, 1);
      if (to > dragIndex) to -= 1;
      list.splice(to, 0, moved);
      state.entries = list;
      renderList();
      impl.onFiles?.(ctx);
      update();
    }
    dragIndex = null;
  });
  els.list.addEventListener('dragend', () => {
    dragIndex = null;
    els.list.querySelectorAll('.dragging, .drop-before, .drop-after').forEach((n) => n.classList.remove('dragging', 'drop-before', 'drop-after'));
  });

  // ---------- state of the Run button ----------
  function update() {
    syncFields();
    const count = state.entries.length;
    const min = meta.minFiles ?? 1;
    const locked = state.entries.filter((e) => e.locked && !meta.allowLocked);
    const broken = state.entries.filter((e) => e.broken);
    let hint = '';
    if (count < min) hint = count === 0 ? meta.hint : `Add ${min - count} more file${min - count === 1 ? '' : 's'}.`;
    else if (locked.length) hint = `"${locked[0].name}" is password-protected. Unlock it first, then come back.`;
    else if (broken.length) hint = `"${broken[0].name}" can't be read. It may be damaged; remove it to continue.`;
    else if (meta.allowLocked === true && id === 'unlock' && count && !state.entries[0].locked) hint = "This PDF isn't password-protected, so there's nothing to unlock.";
    const custom = impl.ready ? impl.ready(ctx) : true;
    if (!hint && custom !== true) hint = custom || '';
    const ready = count >= min && !locked.length && !broken.length && custom === true && !state.busy && !(id === 'unlock' && count && !state.entries[0].locked);
    els.run.disabled = !ready;
    els.run.textContent = meta.button(Math.max(count, 1));
    els.runHint.textContent = hint;
    els.runHint.hidden = !hint;
    if (locked.length && id !== 'unlock') {
      els.runHint.append(' ', h('a', { href: toolUrl(SLUGS.unlock), text: 'Open Unlock PDF' }));
    }
    els.input.multiple = !!meta.multiple;
  }

  els.form?.addEventListener('input', () => {
    update();
    impl.onOptions?.(ctx);
  });
  els.form?.addEventListener('change', () => {
    update();
    impl.onOptions?.(ctx);
  });
  els.form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!els.run.disabled) runTool();
  });

  // ---------- run ----------
  function hideError() {
    els.error.hidden = true;
    els.error.replaceChildren();
  }
  function showError(message, tone = 'error', extra = null) {
    els.error.className = `alert ${tone}`;
    els.error.replaceChildren(h('p', { text: message }), extra);
    els.error.hidden = false;
  }

  function friendly(error) {
    switch (error?.code) {
      case 'encrypted':
        return {
          text: 'This PDF is password-protected. Unlock it first, then come back.',
          extra: h('a', { href: toolUrl(SLUGS.unlock), text: 'Open Unlock PDF' }),
        };
      case 'wrong-password':
        return { text: 'That password is not right. Check it and try again.' };
      case 'invalid-pdf':
      case 'invalid-image':
      case 'bad-range':
      case 'crop-too-much':
      case 'input':
      case 'empty':
      case 'no-files':
      case 'load':
      case 'engine':
        return { text: error.message };
      default:
        return { text: `Something went wrong: ${error?.message || 'unknown error'}. Try again, or try a smaller file.` };
    }
  }

  async function runTool() {
    if (state.busy) return;
    hideError();
    els.done.hidden = true;
    state.busy = true;
    state.cancelled = false;
    update();
    els.busy.hidden = false;
    ctx.progress(null, 'Starting…');
    els.busy.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const started = performance.now();
    try {
      await nextFrame();
      const result = await impl.run(ctx);
      showResult(result, (performance.now() - started) / 1000);
    } catch (error) {
      if (error?.code === 'cancelled' || state.cancelled) {
        showError('Cancelled. Your files are still here.', 'warn');
      } else {
        console.error(error);
        const f = friendly(error);
        showError(f.text, 'error', f.extra ?? null);
        announce(f.text);
      }
    } finally {
      state.busy = false;
      els.busy.hidden = true;
      update();
    }
  }

  els.run.addEventListener('click', runTool);
  els.cancel.addEventListener('click', () => {
    state.cancelled = true;
    engine.cancel();
    impl.onCancel?.(ctx);
  });

  // ---------- result ----------
  function showResult(result, seconds) {
    const files = result.files ?? [];
    const title = h('h2', { id: 'done-title', text: result.title ?? 'Done' });
    const summary = result.sizes
      ? h(
          'p',
          { class: 'sizes' },
          h('span', { class: 'from', text: formatBytes(result.sizes.before) }),
          h('span', { class: 'arrow', 'aria-hidden': 'true', text: '→' }),
          h('span', { class: 'to', text: formatBytes(result.sizes.after) }),
          h('span', { class: 'pct', text: result.summary.split('(').pop()?.replace(')', '') ?? '' }),
          h('span', { class: 'sr-only', text: result.summary }),
        )
      : result.summary
        ? h('p', { class: 'done-summary', text: result.summary })
        : null;
    const notes = (result.notes ?? []).map((n) => h('p', { class: `note ${n.tone ?? ''}`, text: n.text ?? n }));
    const timing = h('p', { class: 'done-time', text: `Done in ${seconds < 1 ? 'under a second' : `${seconds.toFixed(1)} seconds`}, on your device.` });

    const downloads = [];
    if (files.length === 1) {
      const f = files[0];
      downloads.push(
        h(
          'div',
          { class: 'out-file' },
          h('span', { class: 'file-text' }, h('span', { class: 'file-name', text: f.name }), h('span', { class: 'file-meta', text: formatBytes(f.blob.size) })),
          h('button', { type: 'button', class: 'btn primary big', id: 'download', onclick: () => saveBlob(f.blob, f.name), text: 'Download' }),
        ),
      );
    } else if (files.length > 1) {
      downloads.push(
        h('button', {
          type: 'button',
          class: 'btn primary big',
          id: 'download-zip',
          text: `Download all (${files.length} files, ZIP)`,
          onclick: async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            button.textContent = 'Preparing ZIP…';
            try {
              saveBlob(await zip(files), result.zipName ?? 'pdfburrow-files.zip');
            } finally {
              button.disabled = false;
              button.textContent = `Download all (${files.length} files, ZIP)`;
            }
          },
        }),
        h(
          'ul',
          { class: 'out-list' },
          files.map((f) =>
            h(
              'li',
              {},
              h('span', { class: 'file-text' }, h('span', { class: 'file-name', text: f.name }), h('span', { class: 'file-meta', text: formatBytes(f.blob.size) })),
              h('button', { type: 'button', class: 'btn', onclick: () => saveBlob(f.blob, f.name), text: 'Download', 'aria-label': `Download ${f.name}` }),
            ),
          ),
        ),
      );
    }

    let textBlock = null;
    if (typeof result.text === 'string') {
      const area = h('textarea', { class: 'out-text', readonly: true, rows: 12, 'aria-label': 'Extracted text' });
      area.value = result.text;
      const copy = h('button', {
        type: 'button',
        class: 'btn',
        text: 'Copy text',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(area.value);
            copy.textContent = 'Copied';
          } catch {
            area.select();
            copy.textContent = 'Press Ctrl+C to copy';
          }
          setTimeout(() => (copy.textContent = 'Copy text'), 2000);
        },
      });
      textBlock = h('div', { class: 'out-text-wrap' }, area, h('div', { class: 'row' }, copy));
    }

    const pdfOut = files.length >= 1 && files.every((f) => f.name.toLowerCase().endsWith('.pdf'));
    const next = pdfOut && (NEXT[id] ?? []).length
      ? h(
          'div',
          { class: 'next' },
          h('p', { class: 'next-title', text: files.length > 1 ? 'Continue with these files:' : 'Continue with this file:' }),
          h(
            'div',
            { class: 'next-links' },
            NEXT[id].map((toolId) =>
              h('button', {
                type: 'button',
                class: 'chip-link',
                text: TOOLS[toolId].name,
                onclick: async () => {
                  await handOff(files.map((f) => ({ blob: f.blob, name: f.name })));
                  window.location.href = toolUrl(SLUGS[toolId], '?from=previous');
                },
              }),
            ),
          ),
        )
      : null;

    els.done.replaceChildren(title, summary, ...notes, ...downloads, textBlock, timing, next);
    els.done.hidden = false;
    els.done.scrollIntoView({ block: 'start', behavior: 'smooth' });
    announce(`${result.title ?? 'Done'}. ${result.summary ?? ''}`);
  }

  // ---------- input ----------
  els.input.addEventListener('change', () => {
    addFiles([...els.input.files]);
    els.input.value = '';
  });
  for (const target of [els.drop, els.workspace]) {
    target.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types?.includes('Files')) return;
      event.preventDefault();
      els.drop.classList.add('over');
    });
    target.addEventListener('dragleave', (event) => {
      if (!target.contains(event.relatedTarget)) els.drop.classList.remove('over');
    });
    target.addEventListener('drop', (event) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      els.drop.classList.remove('over');
      addFiles([...event.dataTransfer.files]);
    });
  }
  document.addEventListener('paste', (event) => {
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length && !event.target.closest?.('input, textarea')) addFiles(files);
  });
  window.addEventListener('beforeunload', (event) => {
    if (state.busy) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  await impl.setup?.(ctx);
  update();

  // Files passed on from another tool or from the home page.
  if (new URLSearchParams(window.location.search).has('from')) {
    const files = await takeHandOff();
    history.replaceState(null, '', window.location.pathname);
    if (files.length) await addFiles(files);
  }
  root.classList.add('ready');
}
