// Run qpdf (WebAssembly) on one file. A fresh instance per run: qpdf exits after each command.
import { qpdfFactory, qpdfWasmUrl } from '../libs.js';

/**
 * args: qpdf arguments using /in.pdf and /out.pdf.
 * Returns { bytes, errors } — bytes is null when qpdf produced no output.
 */
export async function runQpdf(input, args) {
  const factory = await qpdfFactory();
  const errors = [];
  const qpdf = await factory({
    locateFile: () => qpdfWasmUrl(),
    noInitialRun: true,
    print: () => {},
    printErr: (line) => errors.push(String(line)),
  });
  qpdf.FS.writeFile('/in.pdf', input);
  try {
    qpdf.callMain(args);
  } catch (error) {
    // qpdf calls exit(); Emscripten reports that as an exception. Output decides success.
    if (error && error.name !== 'ExitStatus' && !/exit/i.test(String(error.message ?? error))) errors.push(String(error.message ?? error));
  }
  let bytes = null;
  try {
    bytes = qpdf.FS.readFile('/out.pdf');
  } catch {
    bytes = null;
  }
  return { bytes, errors };
}

export function randomPassword() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
