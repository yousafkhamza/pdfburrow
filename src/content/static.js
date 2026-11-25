// About, privacy, terms and contact.

export function staticPages({ repoUrl, updated }) {
  return [
    {
      slug: 'about',
      title: 'About pdfburrow',
      description: 'pdfburrow is a free set of PDF tools that run in your browser. Files are never uploaded, there are no limits and no watermarks.',
      sections: [
        ['Why pdfburrow exists', [
          'Most free PDF websites upload your files to their servers, add watermarks, or stop you after a couple of tasks a day. That is a poor deal when the files are passports, payslips, contracts and medical letters.',
          'pdfburrow does the work inside your browser instead. Your files are read and changed on your own device and saved straight back to it. There is nothing to sign up for and nothing to pay.',
        ]],
        ['How it works', [
          'Modern browsers can run the same kind of PDF software that desktop programs use. pdfburrow uses well-known open-source libraries (pdf-lib, Mozilla’s pdf.js, qpdf and Tesseract) running on your device. Every tool page shows a live count of file data sent to any server. It stays at zero.',
          'After the first visit, pdfburrow also works offline. You can test this: load a tool, turn off Wi-Fi, and use it.',
        ]],
        ['Open source', [`The code is public at ${repoUrl}, so anyone can check what it does.`]],
      ],
    },
    {
      slug: 'privacy',
      title: 'Privacy policy',
      description: 'pdfburrow processes files on your device and never uploads them. What data the site stores, and how advertising works.',
      sections: [
        ['Your files', [
          'Files you add to pdfburrow are processed in your browser and are never sent to us or anyone else. We cannot see them. When you close the tab, they are gone from memory.',
          'When you pass a result to another tool, it is kept briefly in your browser’s own storage (IndexedDB) on your device, and deleted when the next tool opens it or after 10 minutes.',
        ]],
        ['What is stored on your device', ['Your colour theme choice (local storage), offline copies of the site’s pages and code (service worker cache), and the OCR language file after you first use OCR. You can clear all of these in your browser settings.']],
        ['Hosting and fonts', ['The site is hosted on GitHub Pages, which may keep logs of IP addresses for security. Fonts are loaded from Google Fonts. See the GitHub and Google privacy policies.']],
        ['Advertising', [
          'This site may show ads from Google AdSense to cover its costs. Google and its partners use cookies to show ads based on your visits to this and other websites. You can turn off personalised ads at adssettings.google.com. Visitors in the EEA, the UK and Switzerland are asked for consent first. More: policies.google.com/technologies/ads.',
          'Ads never receive your files. The "file data sent" counter on each tool page would show it if any page code tried to send file data.',
        ]],
        ['Changes', [`Last updated ${updated}.`]],
      ],
    },
    {
      slug: 'terms',
      title: 'Terms of use',
      description: 'The terms for using pdfburrow’s free PDF tools, including limits of responsibility and acceptable use.',
      sections: [
        ['Use', ['pdfburrow is free for personal and business use. Only use it on files you have the right to change. The Unlock tool is for files whose password you know.']],
        ['No warranty', ['The tools are provided as they are. We work hard on quality and test every tool, but keep your original files and check results before relying on them, especially for redaction and legal documents.']],
        ['Signatures', ['Sign PDF places an image of your signature. It is not a certificate-based digital signature, and whether it is accepted depends on who receives it.']],
        ['Open source', ['The code is available under the MIT licence.']],
      ],
    },
    {
      slug: 'contact',
      title: 'Contact',
      description: 'Report a problem or suggest a new tool for pdfburrow. Please never send documents: pdfburrow never needs your files.',
      sections: [
        ['Report a problem or suggest a tool', [`Open an issue at ${repoUrl}/issues. Say which tool, your browser and device, and what happened. Please never attach your documents; describe the problem instead.`]],
      ],
    },
  ];
}
