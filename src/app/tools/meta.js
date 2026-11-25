// Tool definitions shared by the page builder (renders the options form) and the browser
// (reads the options and runs the tool). Keep this file small: it ships to every tool page.
//
// accept: 'pdf' | 'image' | 'pdf+image'
// fields: options shown under the files. Types: select, number, text, password, checkbox.
//   showIf: { field, in: [values] } shows the field only for some choices.
//   group: 'more' puts the field in a collapsed "More options" section.

const TARGETS = [
  ['100', 'Under 100 KB'],
  ['200', 'Under 200 KB'],
  ['300', 'Under 300 KB'],
  ['500', 'Under 500 KB'],
  ['1024', 'Under 1 MB'],
  ['2048', 'Under 2 MB'],
];

export const TOOLS = {
  merge: {
    name: 'Merge PDF',
    verb: 'Merge',
    accept: 'pdf+image',
    multiple: true,
    minFiles: 2,
    button: (n) => `Merge ${n} files`,
    hint: 'Add 2 or more PDFs. Photos and scans are fine too. Drag to set the order.',
    fields: [
      {
        id: 'imageSize',
        type: 'select',
        label: 'Page size for images',
        default: 'a4',
        group: 'more',
        options: [
          ['a4', 'A4'],
          ['letter', 'US Letter'],
          ['fit', 'Same as the image'],
        ],
      },
    ],
  },
  split: {
    name: 'Split PDF',
    verb: 'Split',
    accept: 'pdf',
    button: () => 'Split PDF',
    hint: 'Add one PDF.',
    fields: [
      {
        id: 'mode',
        type: 'select',
        label: 'How to split',
        default: 'ranges',
        options: [
          ['ranges', 'By page ranges (one file per range)'],
          ['each', 'Every page into its own file'],
          ['every', 'Every few pages'],
          ['extract', 'Pick pages into one new file'],
        ],
      },
      {
        id: 'ranges',
        type: 'text',
        label: 'Pages',
        default: '',
        placeholder: 'e.g. 1-3, 4, 7-end',
        hint: 'Separate with commas. "end" means the last page.',
        showIf: { field: 'mode', in: ['ranges', 'extract'] },
      },
      { id: 'every', type: 'number', label: 'Pages per file', default: 2, min: 1, max: 999, step: 1, showIf: { field: 'mode', in: ['every'] } },
    ],
  },
  compress: {
    name: 'Compress PDF',
    verb: 'Compress',
    accept: 'pdf',
    multiple: true,
    button: (n) => (n > 1 ? `Compress ${n} PDFs` : 'Compress PDF'),
    hint: 'Add one or more PDFs.',
    fields: [
      {
        id: 'level',
        type: 'select',
        label: 'How small?',
        default: 'recommended',
        options: [
          ['recommended', 'Recommended: smaller, still sharp'],
          ['light', 'Light: best quality'],
          ['strong', 'Strong: much smaller'],
          ['smallest', 'Smallest: pages become images'],
          ...TARGETS,
        ],
      },
      {
        id: 'allowPages',
        type: 'checkbox',
        label: 'If needed, turn pages into images to reach the size',
        hint: 'Text will no longer be selectable on those files.',
        default: true,
        showIf: { field: 'level', in: TARGETS.map((t) => t[0]) },
      },
    ],
  },
  organize: {
    name: 'Organize pages',
    verb: 'Organize',
    accept: 'pdf',
    button: () => 'Save PDF',
    hint: 'Add one PDF. Then drag pages, rotate or delete them.',
    custom: true,
    fields: [],
  },
  'images-to-pdf': {
    name: 'Images to PDF',
    verb: 'Convert',
    accept: 'image',
    multiple: true,
    button: (n) => `Convert ${n} image${n === 1 ? '' : 's'} to PDF`,
    hint: 'JPG, PNG, HEIC (iPhone), WebP, GIF. Drag to set the order.',
    fields: [
      {
        id: 'size',
        type: 'select',
        label: 'Page size',
        default: 'a4',
        options: [
          ['a4', 'A4'],
          ['letter', 'US Letter'],
          ['fit', 'Same as each image'],
        ],
      },
      {
        id: 'orientation',
        type: 'select',
        label: 'Orientation',
        default: 'auto',
        showIf: { field: 'size', in: ['a4', 'letter'] },
        options: [
          ['auto', 'Automatic'],
          ['portrait', 'Portrait'],
          ['landscape', 'Landscape'],
        ],
      },
      {
        id: 'margin',
        type: 'select',
        label: 'Margin',
        default: '0',
        group: 'more',
        options: [
          ['0', 'None'],
          ['10', 'Small (10 mm)'],
          ['20', 'Large (20 mm)'],
        ],
      },
    ],
  },
  'pdf-to-images': {
    name: 'PDF to images',
    verb: 'Convert',
    accept: 'pdf',
    button: () => 'Convert to images',
    hint: 'Add one PDF.',
    fields: [
      {
        id: 'format',
        type: 'select',
        label: 'Format',
        default: 'jpg',
        options: [
          ['jpg', 'JPG (smaller files)'],
          ['png', 'PNG (sharpest)'],
        ],
      },
      {
        id: 'dpi',
        type: 'select',
        label: 'Quality',
        default: '150',
        options: [
          ['96', 'Screen (96 dpi)'],
          ['150', 'Standard (150 dpi)'],
          ['300', 'Print (300 dpi)'],
        ],
      },
      { id: 'pages', type: 'text', label: 'Pages', default: 'all', placeholder: 'all, or e.g. 1-3, 5', group: 'more' },
    ],
  },
  sign: {
    name: 'Sign PDF',
    verb: 'Sign',
    accept: 'pdf',
    button: () => 'Sign and save',
    hint: 'Add the PDF you need to sign.',
    custom: true,
    fields: [],
  },
  'page-numbers': {
    name: 'Add page numbers',
    verb: 'Number',
    accept: 'pdf',
    button: () => 'Add page numbers',
    hint: 'Add one PDF.',
    fields: [
      {
        id: 'position',
        type: 'select',
        label: 'Position',
        default: 'bottom-center',
        options: [
          ['bottom-center', 'Bottom centre'],
          ['bottom-right', 'Bottom right'],
          ['bottom-left', 'Bottom left'],
          ['top-center', 'Top centre'],
          ['top-right', 'Top right'],
          ['top-left', 'Top left'],
        ],
      },
      {
        id: 'format',
        type: 'select',
        label: 'Style',
        default: 'n',
        options: [
          ['n', '1'],
          ['page-n', 'Page 1'],
          ['page-n-of-total', 'Page 1 of 10'],
          ['n-of-total', '1 / 10'],
        ],
      },
      { id: 'start', type: 'number', label: 'First number', default: 1, min: 0, max: 99999, step: 1, group: 'more' },
      { id: 'skipFirst', type: 'checkbox', label: "Don't number the first page (cover)", default: false, group: 'more' },
      {
        id: 'fontSize',
        type: 'select',
        label: 'Size',
        default: '11',
        group: 'more',
        options: [
          ['9', 'Small'],
          ['11', 'Medium'],
          ['14', 'Large'],
        ],
      },
    ],
  },
  watermark: {
    name: 'Add watermark',
    verb: 'Watermark',
    accept: 'pdf',
    button: () => 'Add watermark',
    hint: 'Add one PDF.',
    fields: [
      { id: 'text', type: 'text', label: 'Watermark text', default: 'CONFIDENTIAL', maxLength: 60 },
      {
        id: 'mode',
        type: 'select',
        label: 'Layout',
        default: 'center',
        options: [
          ['center', 'Once, in the middle'],
          ['tile', 'Repeated across the page'],
        ],
      },
      {
        id: 'opacity',
        type: 'select',
        label: 'Strength',
        default: '0.25',
        options: [
          ['0.12', 'Faint'],
          ['0.25', 'Medium'],
          ['0.45', 'Strong'],
        ],
      },
      {
        id: 'color',
        type: 'select',
        label: 'Colour',
        default: 'grey',
        group: 'more',
        options: [
          ['grey', 'Grey'],
          ['red', 'Red'],
          ['blue', 'Blue'],
        ],
      },
      {
        id: 'angle',
        type: 'select',
        label: 'Angle',
        default: '45',
        group: 'more',
        options: [
          ['45', 'Diagonal'],
          ['0', 'Straight'],
        ],
      },
      {
        id: 'size',
        type: 'select',
        label: 'Size',
        default: 'large',
        group: 'more',
        options: [
          ['small', 'Small'],
          ['medium', 'Medium'],
          ['large', 'Large'],
        ],
      },
      { id: 'pages', type: 'text', label: 'Pages', default: 'all', placeholder: 'all, or e.g. 1-3', group: 'more' },
    ],
  },
  'fill-form': {
    name: 'Fill PDF form',
    verb: 'Fill',
    accept: 'pdf',
    button: () => 'Save filled PDF',
    hint: 'Add a PDF that has form fields.',
    custom: true,
    fields: [{ id: 'flatten', type: 'checkbox', label: 'Lock the answers so they can’t be edited (flatten)', default: false, group: 'more' }],
  },
  'remove-metadata': {
    name: 'Remove PDF metadata',
    verb: 'Clean',
    accept: 'pdf',
    multiple: true,
    button: (n) => (n > 1 ? `Clean ${n} PDFs` : 'Remove metadata'),
    hint: 'Add one or more PDFs.',
    custom: true,
    fields: [
      {
        id: 'mode',
        type: 'select',
        label: 'What to do',
        default: 'remove',
        options: [
          ['remove', 'Remove all metadata'],
          ['edit', 'Edit title and author'],
        ],
      },
      { id: 'title', type: 'text', label: 'Title', default: '', showIf: { field: 'mode', in: ['edit'] } },
      { id: 'author', type: 'text', label: 'Author', default: '', showIf: { field: 'mode', in: ['edit'] } },
      { id: 'subject', type: 'text', label: 'Subject', default: '', showIf: { field: 'mode', in: ['edit'] } },
      { id: 'keywords', type: 'text', label: 'Keywords', default: '', placeholder: 'comma, separated', showIf: { field: 'mode', in: ['edit'] } },
    ],
  },
  'id-scan': {
    name: 'ID & passport to PDF',
    verb: 'Create',
    accept: 'image',
    multiple: true,
    maxFiles: 2,
    button: () => 'Make PDF',
    hint: 'Add a photo of the front, then the back. Crop the photos close to the card for the best result.',
    labels: ['Front', 'Back'],
    fields: [
      {
        id: 'card',
        type: 'select',
        label: 'Size on the page',
        default: 'fill',
        options: [
          ['fill', 'As large as fits'],
          ['id', 'Real size: ID card or driving licence'],
          ['passport', 'Real size: passport page'],
        ],
      },
      {
        id: 'pageSize',
        type: 'select',
        label: 'Paper',
        default: 'a4',
        group: 'more',
        options: [
          ['a4', 'A4'],
          ['letter', 'US Letter'],
        ],
      },
    ],
  },
  protect: {
    name: 'Protect PDF',
    verb: 'Protect',
    accept: 'pdf',
    button: () => 'Protect PDF',
    hint: 'Add one PDF.',
    fields: [
      { id: 'password', type: 'password', label: 'Password', default: '', autocomplete: 'new-password' },
      { id: 'confirm', type: 'password', label: 'Type it again', default: '', autocomplete: 'new-password' },
      { id: 'allowPrint', type: 'checkbox', label: 'Allow printing', default: true, group: 'more' },
      { id: 'allowCopy', type: 'checkbox', label: 'Allow copying text', default: false, group: 'more' },
      { id: 'allowEdit', type: 'checkbox', label: 'Allow editing', default: false, group: 'more' },
    ],
  },
  unlock: {
    name: 'Unlock PDF',
    verb: 'Unlock',
    accept: 'pdf',
    allowLocked: true,
    button: () => 'Unlock PDF',
    hint: 'Add a password-protected PDF. You need to know the password.',
    fields: [{ id: 'password', type: 'password', label: 'Password', default: '', autocomplete: 'current-password' }],
  },
  'pdf-to-text': {
    name: 'PDF to text (OCR)',
    verb: 'Extract',
    accept: 'pdf',
    button: () => 'Get text',
    hint: 'Add one PDF. Scanned pages are read with OCR (English).',
    fields: [
      {
        id: 'output',
        type: 'select',
        label: 'What do you need?',
        default: 'text',
        options: [
          ['text', 'The text, to copy or save as .txt'],
          ['searchable', 'A searchable PDF (adds a text layer to scans)'],
        ],
      },
      { id: 'ocr', type: 'checkbox', label: 'Read scanned pages with OCR', default: true, showIf: { field: 'output', in: ['text'] } },
    ],
  },
  redact: {
    name: 'Redact PDF',
    verb: 'Redact',
    accept: 'pdf',
    button: () => 'Redact and save',
    hint: 'Add one PDF. Then search for text or draw boxes over what to hide.',
    custom: true,
    fields: [],
  },
  crop: {
    name: 'Crop & resize PDF',
    verb: 'Crop',
    accept: 'pdf',
    button: () => 'Save PDF',
    hint: 'Add one PDF.',
    custom: true,
    fields: [
      {
        id: 'mode',
        type: 'select',
        label: 'What to do',
        default: 'crop',
        options: [
          ['crop', 'Crop margins'],
          ['resize', 'Change paper size'],
        ],
      },
      { id: 'top', type: 'number', label: 'Top (mm)', default: 10, min: 0, max: 500, step: 1, showIf: { field: 'mode', in: ['crop'] } },
      { id: 'bottom', type: 'number', label: 'Bottom (mm)', default: 10, min: 0, max: 500, step: 1, showIf: { field: 'mode', in: ['crop'] } },
      { id: 'left', type: 'number', label: 'Left (mm)', default: 10, min: 0, max: 500, step: 1, showIf: { field: 'mode', in: ['crop'] } },
      { id: 'right', type: 'number', label: 'Right (mm)', default: 10, min: 0, max: 500, step: 1, showIf: { field: 'mode', in: ['crop'] } },
      {
        id: 'size',
        type: 'select',
        label: 'Paper size',
        default: 'a4',
        showIf: { field: 'mode', in: ['resize'] },
        options: [
          ['a4', 'A4'],
          ['letter', 'US Letter'],
          ['legal', 'US Legal'],
          ['a5', 'A5'],
        ],
      },
      { id: 'pages', type: 'text', label: 'Pages', default: 'all', placeholder: 'all, or e.g. 2-5', group: 'more', showIf: { field: 'mode', in: ['crop'] } },
    ],
  },
};

export const TOOL_IDS = Object.keys(TOOLS);

/** URL slug of each tool page (the words people search for). */
export const SLUGS = {
  merge: 'merge-pdf',
  split: 'split-pdf',
  compress: 'compress-pdf',
  organize: 'organize-pdf',
  'images-to-pdf': 'jpg-to-pdf',
  'pdf-to-images': 'pdf-to-jpg',
  sign: 'sign-pdf',
  'page-numbers': 'add-page-numbers-to-pdf',
  watermark: 'add-watermark-to-pdf',
  'fill-form': 'fill-pdf-form',
  'remove-metadata': 'remove-pdf-metadata',
  'id-scan': 'id-card-to-pdf',
  protect: 'protect-pdf',
  unlock: 'unlock-pdf',
  'pdf-to-text': 'pdf-to-text',
  redact: 'redact-pdf',
  crop: 'crop-pdf',
};

/** Suggested next tools after a result, so a file can move on without downloading it first. */
export const NEXT = {
  merge: ['compress', 'page-numbers', 'sign'],
  split: ['merge', 'compress'],
  compress: ['merge', 'protect'],
  organize: ['compress', 'page-numbers', 'sign'],
  'images-to-pdf': ['compress', 'merge', 'page-numbers'],
  'pdf-to-images': [],
  sign: ['compress', 'protect'],
  'page-numbers': ['compress', 'sign'],
  watermark: ['protect', 'compress'],
  'fill-form': ['sign', 'compress'],
  'remove-metadata': ['protect', 'compress'],
  'id-scan': ['compress', 'merge'],
  protect: [],
  unlock: ['compress', 'remove-metadata', 'organize'],
  'pdf-to-text': ['compress'],
  redact: ['compress', 'protect'],
  crop: ['compress', 'page-numbers'],
};

/** Read typed option values from a plain object of raw strings/booleans. Pure, unit tested. */
export function readOptions(tool, raw) {
  const values = {};
  for (const f of tool.fields) {
    const input = raw[f.id];
    if (f.type === 'checkbox') values[f.id] = input === undefined ? !!f.default : input === true || input === 'true' || input === 'on';
    else if (f.type === 'number') {
      let n = parseFloat(String(input ?? f.default));
      if (!Number.isFinite(n)) n = Number(f.default) || 0;
      if (f.min !== undefined) n = Math.max(f.min, n);
      if (f.max !== undefined) n = Math.min(f.max, n);
      values[f.id] = n;
    } else if (f.type === 'select') {
      const allowed = f.options.map((o) => o[0]);
      values[f.id] = allowed.includes(String(input)) ? String(input) : String(f.default);
    } else {
      const text = String(input ?? f.default ?? '');
      values[f.id] = f.maxLength ? text.slice(0, f.maxLength) : text;
    }
  }
  return values;
}
