import { bytesOf } from '../files.js';
import { h } from '../ui.js';
import { copyBytes, outName, pdfFile } from './common.js';

let fields = [];

/** "applicant_full-name" -> "Applicant full name" */
function pretty(name) {
  const last = String(name).split('.').pop();
  const words = last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : name;
}

function control(field, i) {
  const id = `ff-${i}`;
  const common = { id, name: field.name, disabled: field.readOnly };
  let input;
  if (field.type === 'checkbox') {
    input = h('input', { ...common, type: 'checkbox', checked: !!field.value });
    return h('div', { class: 'field check' }, input, h('label', { for: id, text: pretty(field.name) }));
  }
  if (field.type === 'dropdown' || field.type === 'list' || field.type === 'radio') {
    input = h(
      'select',
      common,
      h('option', { value: '', text: '— Choose —' }),
      field.options.map((o) => h('option', { value: o, text: o, selected: o === field.value })),
    );
  } else if (field.multiline) {
    input = h('textarea', { ...common, rows: 3, maxlength: field.maxLength ?? null });
    input.value = field.value ?? '';
  } else {
    input = h('input', { ...common, type: 'text', value: field.value ?? '', maxlength: field.maxLength ?? null, autocomplete: 'off' });
  }
  return h('div', { class: 'field' }, h('label', { for: id, text: pretty(field.name) }), input, field.readOnly ? h('span', { class: 'hint', text: 'Read-only in this PDF' }) : null);
}

export default {
  setup(ctx) {
    ctx.custom.hidden = true;
  },

  async onFiles(ctx) {
    const entry = ctx.entries[0];
    fields = [];
    if (!entry || entry.locked || entry.broken) {
      ctx.custom.hidden = true;
      return;
    }
    ctx.custom.replaceChildren(h('p', { class: 'hint', text: 'Reading the form…' }));
    ctx.custom.hidden = false;
    const bytes = (await bytesOf(entry)).slice();
    try {
      fields = (await ctx.engine.run('readForm', { bytes }, [bytes.buffer])).filter((f) => f.type !== 'other');
    } catch (error) {
      ctx.custom.replaceChildren(h('p', { class: 'alert error', text: error.message }));
      return;
    }
    if (!fields.length) {
      ctx.custom.replaceChildren(
        h('p', { class: 'alert warn', text: 'This PDF has no fillable form fields. To write on it anyway, print it and scan it, or use Sign PDF to add your signature.' }),
      );
    } else {
      ctx.custom.replaceChildren(h('h3', { class: 'panel-title', text: `${fields.length} field${fields.length === 1 ? '' : 's'} to fill` }), h('div', { class: 'form-grid' }, fields.map(control)));
    }
    ctx.update();
  },

  onClear(ctx) {
    fields = [];
    ctx.custom.hidden = true;
  },

  ready() {
    return fields.length ? true : 'This PDF has no fillable fields.';
  },

  async run(ctx) {
    const entry = ctx.entries[0];
    const values = {};
    fields.forEach((f, i) => {
      const el = ctx.custom.querySelector(`#ff-${i}`);
      if (!el || f.readOnly) return;
      values[f.name] = f.type === 'checkbox' ? el.checked : el.value;
    });
    ctx.progress(0.4, 'Filling in the form…');
    const bytes = await copyBytes(entry);
    const out = await ctx.engine.run('fillForm', { bytes, values, options: { flatten: ctx.options.flatten } }, [bytes.buffer]);
    const filled = Object.values(values).filter((v) => v === true || (typeof v === 'string' && v.trim())).length;
    return {
      title: 'Your filled PDF is ready',
      summary: `${filled} of ${fields.length} fields filled${ctx.options.flatten ? ' and locked' : ''}.`,
      files: [pdfFile(outName(entry, 'filled'), out)],
    };
  },
};
