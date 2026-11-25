import { bytesOf } from '../files.js';
import { inputError, outName, pdfFile } from './common.js';
import { runQpdf } from './qpdf.js';

export default {
  ready(ctx) {
    return ctx.options.password ? true : 'Type the PDF’s password.';
  },

  async run(ctx) {
    const entry = ctx.entries[0];
    const { password } = ctx.options;
    if (!password) throw inputError('Type the PDF’s password.');
    ctx.progress(null, 'Unlocking…');
    const { bytes, errors } = await runQpdf(await bytesOf(entry), [`--password=${password}`, '--decrypt', '/in.pdf', '/out.pdf']);
    if (!bytes?.length) {
      const text = errors.join(' ');
      // qpdf doesn't always print a message; with an encrypted input, no output means the password was wrong.
      if (/password/i.test(text) || entry.locked || !text) throw Object.assign(new Error('Wrong password'), { code: 'wrong-password' });
      throw new Error(errors.at(-1) || 'qpdf did not produce a file');
    }
    return {
      title: 'Your PDF is unlocked',
      summary: 'The password is removed. Anyone with this copy can open it.',
      files: [pdfFile(outName(entry, 'unlocked'), bytes)],
    };
  },
};
