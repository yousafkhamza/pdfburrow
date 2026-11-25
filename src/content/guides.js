// How-to guides. Each answers one real question and links to the tool that does it.
// sections: [heading, [paragraphs]] ; steps: numbered list when the order matters.

export const GUIDES = [
  {
    slug: 'reduce-pdf-size-for-online-forms',
    title: 'How to get a PDF under an upload limit like 200 KB',
    description: 'Online forms often reject PDFs over 100 KB to 1 MB. Here is how to shrink a PDF to fit without making it unreadable.',
    tool: 'compress',
    intro: 'Visa portals, job sites, university and government forms often cap uploads at a few hundred kilobytes. A phone scan of a single page can easily be 3 MB. This is how to get under the limit and keep the document readable.',
    steps: [
      'Open Compress PDF and add your file.',
      'Under "How small?", pick the limit the form shows, for example "Under 200 KB".',
      'Press Compress. pdfburrow tries the best quality first and stops as soon as the file fits.',
      'Check the result opens and is readable, then upload it.',
    ],
    sections: [
      ['Why scans are so big', ['A phone photo of a page is stored at a very high resolution, often 12 megapixels. A form needs a fraction of that to be readable. Reducing the resolution of the images inside the PDF is what saves the most space.']],
      ['When the target is very small', ['For 100 KB with several scanned pages, pdfburrow may need to turn the pages into compact images. The text is still readable but can no longer be selected. If it still won’t fit, split the PDF and upload the parts separately, if the form allows it, or scan in black and white.']],
      ['Tips for better scans', ['Scan in good light on a flat surface. Crop to the page edges. Use your phone’s document scanner mode rather than the camera, because it flattens and cleans the page, which also makes files smaller.']],
    ],
  },
  {
    slug: 'combine-passport-and-visa-into-one-pdf',
    title: 'How to combine your passport, visa and photo into one PDF',
    description: 'Many applications ask for all documents in a single PDF. Combine passport pages, visa, photo and certificates in the right order.',
    tool: 'merge',
    intro: 'Embassies, employers and banks often want every document in one PDF, in a set order. You can do it in a minute, on your phone or laptop, without uploading your passport anywhere.',
    steps: [
      'Open Merge PDF.',
      'Add your passport scan, visa page, photo and any certificates. Photos from your phone are fine.',
      'Drag them into the order the application asks for.',
      'Press Merge, then use "Compress" on the result if there is a size limit.',
    ],
    sections: [
      ['Keep it private', ['Passport copies are valuable to fraudsters. pdfburrow processes the files in your browser, so they never reach a server. You can also add a watermark like "For employment visa application only" with Add watermark.']],
      ['Common order', ['When no order is given, a sensible one is: application form, passport bio page, visa or residence page, photo, then supporting documents like degree certificates.']],
    ],
  },
  {
    slug: 'sign-a-pdf-without-printing',
    title: 'How to sign a PDF without printing it',
    description: 'Sign an offer letter, tenancy contract or form on your phone or computer, without printing and scanning.',
    tool: 'sign',
    intro: 'Printing, signing and scanning takes time and makes a worse-looking copy. You can add your signature to a PDF directly.',
    steps: [
      'Open Sign PDF and add the document.',
      'Draw your signature with your finger, mouse or pen, or type your name and pick a handwriting style.',
      'Click where it goes on the page. Add it to every page that needs it.',
      'Tick "Add today’s date" if needed, then press Sign and save.',
    ],
    sections: [
      ['Is it legally valid?', ['For many everyday documents, such as offer letters, tenancy forms and internal approvals, an image of your signature is accepted the same way a scanned signed page is. Some contracts and government services require a certificate-based digital signature from an approved provider. If in doubt, ask the person who sent the document.']],
      ['Make it look natural', ['Draw your signature a little larger than you would on paper; it is scaled down when placed. Blue ink looks closer to a wet signature on a printed copy.']],
    ],
  },
  {
    slug: 'remove-hidden-data-from-pdf',
    title: 'What hidden data is in your PDF, and how to remove it',
    description: 'PDFs can reveal your name, your company, the software you used and when you made the file. See it and remove it before sharing.',
    tool: 'remove-metadata',
    intro: 'Every PDF has a hidden properties section. It often contains the author’s full name (from your computer account), the program used, and the exact time it was created and edited.',
    steps: ['Open Remove PDF metadata and add the file.', 'Read what it reveals.', 'Press Remove metadata. The result is checked and confirmed for you.'],
    sections: [
      ['Why it matters', ['A CV sent to a new employer that still says "Author: Old Company Ltd", or a "final" contract with a creation date from months ago, can say more than you meant. Journalists and lawyers clean metadata as a routine step.']],
      ['What it doesn’t remove', ['Metadata is separate from what you see on the pages. To remove visible information, such as an account number, use Redact PDF.']],
    ],
  },
  {
    slug: 'redact-a-pdf-properly',
    title: 'How to redact a PDF properly (why black boxes fail)',
    description: 'Drawing a black box in a PDF editor usually leaves the text underneath. Here is how to remove sensitive information for good.',
    tool: 'redact',
    intro: 'Many leaks happen because someone covered text with a black shape. The text is still in the file, and anyone can copy it out. Real redaction removes it.',
    steps: [
      'Open Redact PDF and add the document.',
      'Type a name or number and press "Find and mark" to mark every match, or drag boxes over what to hide.',
      'Press Redact and save. pdfburrow checks that the hidden text is gone from the file.',
    ],
    sections: [
      ['How pdfburrow does it', ['Each page with a redaction is redrawn as an image with the black areas burned in, so the original text on that page no longer exists. Links, bookmarks, form fields and metadata are removed too, because they can point to or reveal hidden content.']],
      ['Check scanned pages', ['On scanned pages, the words are pixels, not text, so search can’t find them. Draw boxes over them by hand.']],
    ],
  },
  {
    slug: 'convert-iphone-photos-to-pdf',
    title: 'How to turn iPhone photos (HEIC) into a PDF',
    description: 'iPhone photos are saved as HEIC, which many websites reject. Convert them to one PDF on your phone or computer.',
    tool: 'images-to-pdf',
    intro: 'iPhones save photos as HEIC to save space, but many upload forms only accept PDF or JPG. You can turn HEIC photos into one PDF directly.',
    steps: ['Open JPG to PDF and add your photos, including HEIC files.', 'Put them in order and choose A4 or Letter.', 'Press Convert and download the PDF.'],
    sections: [
      ['If a photo won’t convert', ['Some HEIC variants can’t be decoded in every browser. On the iPhone, go to Settings > Camera > Formats and choose "Most Compatible" so new photos are JPG, or share the photo and choose JPEG.']],
      ['Sideways photos', ['Phones store rotation separately from the image. pdfburrow applies it, so photos come out the right way up.']],
    ],
  },
  {
    slug: 'make-a-scanned-pdf-searchable',
    title: 'How to make a scanned PDF searchable',
    description: 'Scanned PDFs are just pictures, so you can’t search or copy their text. Add a text layer with OCR, in your browser.',
    tool: 'pdf-to-text',
    intro: 'A scanned contract or old letter is stored as images, so Ctrl+F finds nothing. OCR reads the words and adds an invisible text layer, while the pages look the same.',
    steps: ['Open PDF to text (OCR) and add the scanned PDF.', 'Choose "A searchable PDF".', 'Press Get text and download the searchable copy.'],
    sections: [
      ['How accurate is OCR?', ['Clear, straight scans of printed English text are read very accurately. Handwriting, stamps and very small or faint text are harder. Always check names and numbers.']],
      ['Privacy', ['OCR runs on your device. The first time it loads a 12 MB language file, which is then cached.']],
    ],
  },
  {
    slug: 'password-protect-a-pdf',
    title: 'How to password-protect a PDF before emailing it',
    description: 'Add a password to payslips, statements and ID copies before sending them. Free, with AES-256 encryption.',
    tool: 'protect',
    intro: 'Email is not private: messages are stored on several servers and can be forwarded. Adding a password to a sensitive PDF means only someone who has the password can open it.',
    steps: ['Open Protect PDF and add the file.', 'Choose a strong password and type it twice.', 'Download the protected PDF and send it.', 'Send the password a different way, such as by text message or a phone call.'],
    sections: [
      ['Choose a good password', ['Use at least 10 characters, ideally a few random words. Avoid dates of birth and names; they are the first things people try.']],
      ['Never send the password in the same email', ['If the email is intercepted or forwarded, the password goes with it. Use a different channel.']],
    ],
  },
];
