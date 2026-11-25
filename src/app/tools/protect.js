import { bytesOf } from '../files.js';
import { inputError, outName, pdfFile } from './common.js';
import { randomPassword, runQpdf } from './qpdf.js';

export default {
  ready(ctx) {
    const { password, confirm } = ctx.options;
    if (!password) return 'Choose a password.';
    if (password.length < 4) return 'Use at least 4 characters. Longer is safer.';
    if (password !== confirm) return 'Type the same password twice.';
    return true;
  },

  async run(ctx) {
    const entry = ctx.entries[0];
    const o = ctx.options;
    if (!o.password || o.password !== o.confirm) throw inputError('Type the same password twice.');
    ctx.progress(null, 'Encrypting with AES-256…');
    // A separate random owner password makes the permission settings actually apply.
    const { bytes, errors } = await runQpdf(await bytesOf(entry), [
      '/in.pdf',
      '--encrypt',
      o.password,
      randomPassword(),
      '256',
      `--print=${o.allowPrint ? 'full' : 'none'}`,
      `--modify=${o.allowEdit ? 'all' : 'none'}`,
      `--extract=${o.allowCopy ? 'y' : 'n'}`,
      '--',
      '/out.pdf',
    ]);
    if (!bytes?.length) throw new Error(errors.at(-1) || 'qpdf did not produce a file');
    return {
      title: 'Your PDF is protected',
      summary: 'It now needs the password to open (AES-256 encryption).',
      notes: [{ tone: 'info', text: 'Keep the password somewhere safe. It cannot be recovered if you forget it.' }],
      files: [pdfFile(outName(entry, 'protected'), bytes)],
    };
  },
};
