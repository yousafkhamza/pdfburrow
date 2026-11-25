# Custom domain and Google AdSense

pdfburrow runs on `https://yousafkhamza.github.io/pdfburrow/` with no ads. Follow this guide when you buy a domain and want to show ads. You don't need to change any code: it's all GitHub settings, DNS records and repository variables.

> **Why a domain first:** AdSense does not accept `*.github.io` addresses, and `ads.txt` must be served from the root of a domain you own.

## Two ways to set up the domain

| | **A. Subdomain of a shared domain** (recommended to start) | **B. Its own domain** |
|---|---|---|
| Address | `pdf.yourdomain.com`, with gulfcalc on `yourdomain.com` | `pdfburrow.com` or similar |
| Cost | One domain for both sites | A second domain |
| AdSense | Approving `yourdomain.com` covers its subdomains | Needs its own site review |
| `ads.txt` | One file on `yourdomain.com` (published by gulfcalc) covers both | Published by pdfburrow |
| Best for | Getting started, one AdSense account and one approval | A global brand once traffic grows |

You can start with A and move to B later. Step 9 explains how to keep search rankings when you move.

## Settings this repo reads

Repository **variables** (not secrets): *Settings → Secrets and variables → Actions → Variables → New repository variable*. After changing any, redeploy with *Actions → CI and deploy → Run workflow*.

| Variable | Example | What it does |
|---|---|---|
| `SITE_URL` | `https://pdf.yourdomain.com` | Public address. Canonical links, sitemap and asset paths follow it. Default: `https://yousafkhamza.github.io/pdfburrow` |
| `ADSENSE_CLIENT` | `ca-pub-1234567890123456` | Your AdSense publisher ID. With option B, the build also writes `ads.txt`. |
| `ADS_ENABLED` | `true` | Adds the AdSense script to every page. Needs `ADSENSE_CLIENT`. |
| `ADSENSE_SLOT_TOOL` | `1234567890` | Optional fixed ad unit on tool pages, placed below the "How to" steps, well away from the upload and download buttons. |
| `ADSENSE_SLOT_GUIDE` | `1234567890` | Optional fixed ad unit in guides. |
| `ADSENSE_SLOT_HOME` | `1234567890` | Optional fixed ad unit at the bottom of the home page. |
| `GOOGLE_SITE_VERIFICATION` | `abc123…` | Only if you verify Search Console with the HTML-tag method. |

---

## Option A: `pdf.yourdomain.com`

### 1. Buy the domain (if gulfcalc doesn't already have it)
Buy it from any registrar (Cloudflare Registrar and Namecheap are inexpensive), and turn on auto-renew and WHOIS privacy. gulfcalc's `docs/ADSENSE.md` covers setting up the main domain.

### 2. Verify the subdomain with GitHub
Go to *GitHub → your avatar → Settings → Pages → Add a domain* and enter `pdf.yourdomain.com`. Add the TXT record GitHub shows, then click **Verify**. This stops anyone else from claiming the subdomain.

### 3. Add one DNS record

| Type | Name | Value |
|---|---|---|
| CNAME | `pdf` | `yousafkhamza.github.io` |

On Cloudflare, set it to **DNS only** (grey cloud) so GitHub can issue the HTTPS certificate.

```sh
dig pdf.yourdomain.com +short   # should show yousafkhamza.github.io and GitHub's IPs
```

### 4. Connect it to this repo
1. *Repo → Settings → Pages → Custom domain*: enter `pdf.yourdomain.com` and save. When the DNS check passes, tick **Enforce HTTPS**.
2. Set the repository variable `SITE_URL` = `https://pdf.yourdomain.com`.
3. Redeploy.

Check: `https://pdf.yourdomain.com/` loads, the page source has `<link rel="canonical" href="https://pdf.yourdomain.com/…">`, and `https://pdf.yourdomain.com/sitemap.xml` lists the new address. The old github.io address redirects automatically.

### 5. Search Console
If you already have a **Domain** property for `yourdomain.com`, it already covers `pdf.`. Just submit `https://pdf.yourdomain.com/sitemap.xml` under *Sitemaps*. Otherwise, add a Domain property and verify it with a DNS TXT record.

### 6. AdSense
- If `yourdomain.com` is **already approved**, AdSense allows ads on its subdomains. Set `ADSENSE_CLIENT` and `ADS_ENABLED=true`, then redeploy. The `ads.txt` on `yourdomain.com` (from gulfcalc) already covers `pdf.`. You don't need one here.
- If it **isn't approved yet**, follow steps 6 to 8 of gulfcalc's guide for the main domain first. Approval of the main domain covers this site too.

---

## Option B: its own domain

### 1. Buy and verify
Buy `yournewdomain.com`, then verify it under *GitHub → Settings → Pages → Add a domain* with the TXT record GitHub gives you.

### 2. DNS

| Type | Name | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `yousafkhamza.github.io` |

### 3. Connect, then Search Console
Set the repo's custom domain, enforce HTTPS, set `SITE_URL`, and redeploy (as in Option A, step 4). Then add a Domain property in Search Console and submit the sitemap.

### 4. Wait for traffic
Wait 2 to 6 weeks until most pages are indexed and visitors arrive from search. Applying with a brand-new, empty site is the most common reason AdSense rejects one.

### 5. Apply to AdSense
1. In AdSense, go to *Sites → Add site* and enter `yournewdomain.com`.
2. Set `ADSENSE_CLIENT` and `ADS_ENABLED=true`, then redeploy. This adds the AdSense script to every page and publishes `https://yournewdomain.com/ads.txt`. Open it to check it shows `google.com, pub-…, DIRECT, f08c47fec0942fa0`.
3. Click **Request review**.

### 6. Consent message
Go to AdSense → *Privacy & messaging → European regulations* → create a message, link it to `/privacy/`, and publish it. Google requires this for visitors from the EEA, the UK and Switzerland.

---

## 7. After approval (both options)

**Auto ads** is the simplest option: *Ads → By site → Auto ads: on*. Under *Ad settings*, turn off **Vignette ads** and **Anchor ads**. On a tool site they cover the buttons people need, which annoys visitors and can lead to accidental clicks, which AdSense penalises.

**Fixed units (optional):** create responsive display units and put their slot numbers in `ADSENSE_SLOT_TOOL`, `ADSENSE_SLOT_GUIDE` and `ADSENSE_SLOT_HOME`. Slots without an ID are not rendered, so there are never empty boxes.

Why the slots are placed where they are:
- Never inside the tool card. Ads stay away from Choose files, Download and every other button.
- Never shown while a file is processing.
- Ads never see your visitors' files: the page has no upload code, and the "file data sent" counter on every tool would show it if any script tried.

> **Security note:** while ads are off, every page has a strict Content-Security-Policy. AdSense loads code and frames from many Google domains, so the build drops the policy when ads are on. Files are still processed only in the browser.

## 8. Getting paid

Add your tax details under *Payments*. At USD 10 Google posts a PIN to your address; enter it in AdSense. Payment is made monthly once your balance reaches USD 100.

## 9. Moving from option A to option B later

1. Set up the new domain (option B, steps 1 to 3) on this repo.
2. GitHub Pages serves one custom domain per repo, so redirect `pdf.yourdomain.com` to `yournewdomain.com` at your DNS provider. Cloudflare's redirect rules can send a permanent 301 for every path.
3. In Search Console, use **Change of address** on the old property.
4. Add the new domain in AdSense.

Permanent redirects pass on search rankings, so traffic recovers within a few weeks.

## If the application is rejected

| Reason Google gives | What to do |
|---|---|
| Low value content | Add more guides (`src/content/guides.js`) and longer tool help (`src/content/tools.js`), wait for indexing, then apply again. |
| Site down or unavailable | Check the domain loads over HTTPS and `ads.txt` is reachable. |
| Navigation problems | Run `npm run check`: it fails on any broken link. |
| Policy violation | Read the email, fix the page it names, then request review again. |

You can apply again as soon as you've fixed the problem.

## Turning ads off

Set `ADS_ENABLED` to `false` and redeploy. The AdSense script and slots disappear and the strict security policy comes back.
