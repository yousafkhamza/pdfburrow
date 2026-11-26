Every time you "merge PDF online", your passport, payslip or contract is uploaded to someone else's server.

I didn't like that, so I built pdfburrow: free PDF tools that run entirely in your browser. Your files never leave your device.

What you can do:
🔹 Merge, split, organize, crop and resize
🔹 Compress to a target size like 100 KB or 200 KB, for visa and job portals
🔹 JPG and iPhone HEIC photos to PDF, PDF to JPG
🔹 Sign (draw, type or upload), fill forms, page numbers, watermarks
🔹 Protect with AES-256, unlock, and redact so the text is really removed, not just covered
🔹 Remove hidden metadata, PDF to text with OCR, ID card front and back on one page

No sign-up, no daily limits, no watermark, and it works offline. Every tool shows a live counter of file data sent to any server. It stays at 0 bytes.

How it's built:
⚙️ pdf.js, pdf-lib, qpdf and Tesseract running on your device (WebAssembly and Web Workers)
🔒 Self-hosted libraries pinned with checksums, and a strict Content-Security-Policy
🧪 Unit tests, plus browser tests that run every tool and check the downloaded file
♿ Accessibility checks, and a pipeline that fails if any test sends data anywhere
🚀 CI/CD to GitHub Pages: static, fast, and no server to maintain

Try it: https://yousafkhamza.github.io/pdfburrow/

Feedback welcome. Which PDF task do you do most often?

#Privacy #PDF #WebAssembly #OpenSource #DevSecOps #WebDevelopment #Productivity
