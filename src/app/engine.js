// Talks to the PDF engine worker. One worker, created on first use; cancel() terminates it.

let worker = null;
let seq = 0;
const pending = new Map();

function failAll(code, message) {
  for (const p of pending.values()) p.reject(Object.assign(new Error(message), { code }));
  pending.clear();
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module', name: 'pdf-engine' });
  worker.onmessage = (event) => {
    const { id, result, error } = event.data ?? {};
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error) p.reject(Object.assign(new Error(error.message), { code: error.code }));
    else p.resolve(result);
  };
  worker.onerror = (event) => {
    event.preventDefault?.();
    worker?.terminate();
    worker = null;
    failAll('engine', 'The PDF engine stopped unexpectedly. The file may be too large for this device.');
  };
  return worker;
}

/**
 * Run an operation in the worker. Pass copies of buffers you still need: anything in
 * `transfer` is moved to the worker and becomes unusable here.
 */
export function run(op, args, transfer = []) {
  return new Promise((resolve, reject) => {
    seq += 1;
    pending.set(seq, { resolve, reject });
    try {
      getWorker().postMessage({ id: seq, op, args }, transfer);
    } catch (error) {
      pending.delete(seq);
      reject(Object.assign(new Error('Could not start the PDF engine.'), { code: 'engine', cause: error }));
    }
  });
}

export function cancel() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  failAll('cancelled', 'Cancelled.');
}
