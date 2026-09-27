// Renders the sample evidence images in public/samples/ from HTML templates. The page offers
// these as one-click evidence in 01 / evidence, so they have to be ordinary product screenshots
// (a mail client, a helpdesk, a checkout, an error page), not illustrations: the model is asked to
// read them the way it would read a screenshot a customer sent in.
//
//   node e2e/make-samples.mjs
//
// The PNGs are committed, so this only needs to run when a sample changes. Nothing here is
// inferred or invented at runtime: it is a static render of the markup below.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'samples');

const channel =
  process.platform === 'win32' ? 'chrome' : 'chromium';

const PAGE = (title, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 720px; height: 540px; overflow: hidden; }
  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: #1f2430;
    background: #e9e9ee;
    font-size: 15px;
    line-height: 1.5;
  }
  .win { display: flex; flex-direction: column; width: 720px; height: 540px; background: #fff; }
  .chrome {
    display: flex; align-items: center; gap: 8px;
    height: 36px; padding: 0 12px; background: #dfe1e7; border-bottom: 1px solid #c6c9d2;
  }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #b9bcc7; }
  .url {
    flex: 1; height: 22px; border-radius: 11px; background: #fff; border: 1px solid #c6c9d2;
    font-size: 11.5px; color: #5a6072; display: flex; align-items: center; padding: 0 10px;
  }
  .page { flex: 1; display: flex; min-height: 0; }
  .mono { font-family: 'Cascadia Mono', Consolas, 'Courier New', monospace; }

  /* mail / helpdesk shared */
  .side { width: 168px; background: #f4f5f8; border-right: 1px solid #dfe1e7; padding: 12px 0; }
  .brand { display: flex; align-items: center; gap: 8px; padding: 0 14px 12px; font-weight: 700; font-size: 15px; }
  .brand .mark { width: 20px; height: 20px; border-radius: 6px; background: #3b5bdb; }
  .nav { list-style: none; }
  .nav li {
    display: flex; justify-content: space-between; padding: 6px 14px; font-size: 13.5px; color: #3c4252;
  }
  .nav li b { color: #7a8092; font-weight: 600; font-size: 12px; }
  .nav li.on { background: #e2e6f5; color: #22337e; font-weight: 700; }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .bar {
    height: 46px; border-bottom: 1px solid #dfe1e7; display: flex; align-items: center;
    justify-content: space-between; padding: 0 16px;
  }
  .search {
    flex: 1; max-width: 300px; height: 28px; border: 1px solid #c6c9d2; border-radius: 14px;
    background: #f4f5f8; color: #8a90a2; font-size: 12.5px; display: flex; align-items: center; padding: 0 12px;
  }
  .avatar { width: 28px; height: 28px; border-radius: 50%; background: #c9a227; color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .thread { padding: 16px 20px; overflow: hidden; }
  .subject { font-size: 19px; font-weight: 700; line-height: 1.3; margin-bottom: 10px; }
  .who { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .who .pic { width: 34px; height: 34px; border-radius: 50%; background: #6b7ee0; color: #fff; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .who .from { font-weight: 600; font-size: 13.5px; }
  .who .to { color: #7a8092; font-size: 12px; }
  .who .when { margin-left: auto; color: #8a90a2; font-size: 12px; white-space: nowrap; }
  .body p { margin-bottom: 10px; max-width: 62ch; }
  .quote {
    border-left: 3px solid #c6c9d2; background: #f7f8fa; padding: 10px 12px; margin-bottom: 10px;
    color: #4a5062; font-size: 13.5px;
  }
  .sig { color: #7a8092; font-size: 12.5px; margin-top: 6px; }
  .pill {
    display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 11px;
    font-size: 11.5px; font-weight: 600;
  }
  .pill.red { background: #fbe4e0; color: #a4311c; }
  .pill.amber { background: #fbeed3; color: #8a5b0b; }
  .pill.blue { background: #e2e6f5; color: #2b3f96; }
  .pill.grey { background: #e9eaef; color: #565c6d; }
  .attach {
    display: inline-flex; align-items: center; gap: 8px; border: 1px solid #c6c9d2; border-radius: 8px;
    padding: 6px 10px; font-size: 12px; color: #3c4252; background: #fff;
  }
  .attach .thumb { width: 26px; height: 22px; border-radius: 3px; background: linear-gradient(135deg, #b7c3d8, #7d8ba6); }
  .chiprow { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
</style></head>
<body>${body}</body></html>`;

// ---------------------------------------------------------------------------------------------
// 1. complaint email, billing: a double charge, read in the mail client
// -----------------------------------------------------------------------------
const complaintBilling = PAGE(
  'Charged twice for invoice INV-2291',
  `<div class="win">
    <div class="chrome">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      <div class="url">mail.helm.co/inbox/INV-2291</div>
    </div>
    <div class="page">
      <div class="side">
        <div class="brand"><span class="mark"></span>Helm Mail</div>
        <ul class="nav">
          <li class="on">Inbox <b>12</b></li>
          <li>Starred <b>3</b></li>
          <li>Sent</li>
          <li>Drafts <b>2</b></li>
          <li>Archive</li>
          <li>Spam <b>3</b></li>
          <li>Trash</li>
        </ul>
      </div>
      <div class="main">
        <div class="bar">
          <div class="search">Search mail</div>
          <div class="avatar">PR</div>
        </div>
        <div class="thread">
          <div class="subject">Charged twice for invoice INV-2291</div>
          <div class="who">
            <div class="pic">PR</div>
            <div>
              <div class="from">Priya Raghavan &lt;priya@northwind-labs.io&gt;</div>
              <div class="to">to support@helm.co · Business plan · customer for 4 years</div>
            </div>
            <div class="when">Today, 08:12</div>
          </div>
          <div class="body">
            <p>Hello, our finance team flagged that invoice INV-2291 was charged to our card twice
            on the same day, 14 March. Both charges are for the full amount, $248.00.</p>
            <div class="quote mono">14 Mar · HELM CO *INVOICE 2291 · $248.00 · card 4417<br>
            14 Mar · HELM CO *INVOICE 2291 · $248.00 · card 4417</div>
            <p>We only ever placed one order. Please refund the duplicate today and send a corrected
            receipt, our books close on Friday.</p>
            <p class="sig">Priya Raghavan<br>Operations, Northwind Labs</p>
          </div>
          <div class="chiprow">
            <span class="pill red">Refund requested</span>
            <span class="pill grey">Invoice INV-2291</span>
            <span class="attach"><span class="thumb"></span>statement-march.pdf · 214 KB</span>
          </div>
        </div>
      </div>
    </div>
  </div>`
);

// ---------------------------------------------------------------------------------------------
// 2. complaint email read as a helpdesk ticket: a damaged delivery
// -----------------------------------------------------------------------------
const complaintDelivery = PAGE(
  'Ticket 48213 — order arrived damaged',
  `<div class="win">
    <div class="chrome">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      <div class="url">help.helm.co/tickets/48213</div>
    </div>
    <div class="page">
      <div class="side">
        <div class="brand"><span class="mark"></span>Helm Support</div>
        <ul class="nav">
          <li class="on">My queue <b>12</b></li>
          <li>Unassigned <b>4</b></li>
          <li>Waiting <b>6</b></li>
          <li>All tickets</li>
          <li>Customers</li>
        </ul>
      </div>
      <div class="main">
        <div class="bar">
          <div class="search">Search tickets</div>
          <div class="avatar">MB</div>
        </div>
        <div class="thread">
          <div class="subject">#48213 · Order arrived damaged, replacement needed</div>
          <div class="who">
            <div class="pic">MB</div>
            <div>
              <div class="from">Marcus Bell &lt;m.bell@riverbend-cafe.com&gt;</div>
              <div class="to">email · Business plan · 260 days · 3 previous tickets</div>
            </div>
            <div class="when">Yesterday, 17:40</div>
          </div>
          <div class="body">
            <p>The espresso machine from order 77-1195 arrived with a cracked housing and the portafilter
            missing. The box was open on one side when the courier left it.</p>
            <p>We are opening a second location next week and cannot wait for a repair. We need a
            replacement unit shipped this week, or we will have to cancel the second order.</p>
            <p class="sig">Marcus Bell<br>Riverbend Cafe</p>
          </div>
          <div class="chiprow">
            <span class="pill red">Replacement</span>
            <span class="pill amber">Second location opens Monday</span>
            <span class="attach"><span class="thumb"></span>IMG_2214.jpg · 1.2 MB</span>
          </div>
        </div>
      </div>
    </div>
  </div>`
);

// ---------------------------------------------------------------------------------------------
// 3. complaint email with a screenshot pasted into it: an app that keeps crashing
// -----------------------------------------------------------------------------
const complaintCrash = PAGE(
  'App keeps crashing before our launch',
  `<div class="win">
    <div class="chrome">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      <div class="url">mail.helm.co/compose</div>
    </div>
    <div class="page">
      <div class="side">
        <div class="brand"><span class="mark"></span>Helm Mail</div>
        <ul class="nav">
          <li>Inbox <b>12</b></li>
          <li>Starred <b>3</b></li>
          <li class="on">Drafts <b>2</b></li>
          <li>Archive</li>
          <li>Spam <b>3</b></li>
          <li>Trash</li>
        </ul>
      </div>
      <div class="main">
        <div class="bar">
          <div class="search">Search mail</div>
          <div class="avatar">JO</div>
        </div>
        <div class="thread">
          <div class="subject">App keeps crashing before our launch</div>
          <div class="who">
            <div class="pic">JO</div>
            <div>
              <div class="from">Jelena Ostrovic &lt;jelena@brightpath.dev&gt;</div>
              <div class="to">to support@helm.co · Pro plan</div>
            </div>
            <div class="when">Today, 06:55</div>
          </div>
          <div class="body">
            <p>Since yesterday evening the app crashes every time we open the reports page. This happens
            on two laptops and in Chrome and Edge.</p>
            <p>Our launch is on Friday and the team is blocked. Here is exactly what we see:</p>
            <div class="quote mono">502 · something went wrong<br>ERR-4471 · upstream timed out</div>
            <p>Someone from engineering should look at this today.</p>
            <p class="sig">Jelena Ostrovic<br>Brightpath</p>
          </div>
          <div class="chiprow">
            <span class="pill red">Blocking</span>
            <span class="pill blue">Launch Friday</span>
            <span class="attach"><span class="thumb"></span>crash-report.txt · 8 KB</span>
          </div>
        </div>
      </div>
    </div>
  </div>`
);

// ---------------------------------------------------------------------------------------------
// 4. an error page: what the customer sees when the product breaks
// -----------------------------------------------------------------------------
const errorPage = PAGE(
  '502 Bad Gateway',
  `<div class="win">
    <div class="chrome">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      <div class="url">app.helm.co/reports?range=30d</div>
    </div>
    <div class="page" style="display:block; padding: 34px 40px; background: #fbfbfd;">
      <div style="font-size: 13px; letter-spacing: .12em; color: #a4311c; font-weight: 700;">ERROR 502</div>
      <div style="font-size: 30px; font-weight: 700; margin: 6px 0 10px;">Something went wrong on our side</div>
      <div style="color: #4a5062; max-width: 52ch;">
        The reports service did not answer in time. Your data is safe. Try again in a few minutes,
        or send us the reference below and we will look into it.
      </div>
      <div style="display:flex; gap:10px; margin: 16px 0;">
        <span class="pill red">ERR-4471 · upstream timed out</span>
        <span class="pill grey">request 9f2c-4471-a6</span>
      </div>
      <div class="mono" style="background:#1e2430; color:#c9d4e6; border-radius:8px; padding:12px 14px; font-size:12px; line-height:1.7; max-width: 62ch;">
        at fetchReport (app.helm.co/static/reports.js:214:19)<br>
        at async loadDashboard (app.helm.co/static/reports.js:88:5)<br>
        at async HTMLDivElement.render (app.helm.co/static/main.js:512:7)
      </div>
      <div style="margin-top:16px;">
        <span class="pill blue" style="background:#3b5bdb; color:#fff;">try again</span>
        &nbsp;<span class="pill grey">contact support</span>
      </div>
    </div>
  </div>`
);

// ---------------------------------------------------------------------------------------------
// 5. a checkout with a declined card: money, and a customer who is blocked
// -----------------------------------------------------------------------------
const checkoutDeclined = PAGE(
  'Checkout · payment declined',
  `<div class="win">
    <div class="chrome">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      <div class="url">shop.helm.co/checkout</div>
    </div>
    <div class="page" style="display:block; padding: 22px 28px; background: #fbfbfd;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div style="font-weight:700; font-size:17px;">Helm Supply Co.</div>
        <div style="color:#7a8092; font-size:12.5px;">secure checkout</div>
      </div>
      <div style="background:#fbe4e0; border:1px solid #e3b0a4; border-radius:8px; padding:12px 14px; margin:16px 0;">
        <div style="font-weight:700; color:#a4311c;">Your card was declined.</div>
        <div style="color:#7c3423; font-size:13.5px;">No money was taken. Try another card, or contact your bank and then retry.</div>
      </div>
      <div style="display:flex; gap:22px;">
        <div style="flex:1;">
          <div style="font-size:12.5px; color:#7a8092; margin-bottom:6px;">Card number</div>
          <div class="mono" style="border:1px solid #c6c9d2; border-radius:8px; padding:9px 12px; background:#fff;">4417 0000 0000 0000</div>
          <div style="display:flex; gap:10px; margin-top:10px;">
            <div style="flex:1;">
              <div style="font-size:12.5px; color:#7a8092; margin-bottom:6px;">Expiry</div>
              <div class="mono" style="border:1px solid #c6c9d2; border-radius:8px; padding:9px 12px; background:#fff;">03 / 27</div>
            </div>
            <div style="flex:1;">
              <div style="font-size:12.5px; color:#7a8092; margin-bottom:6px;">CVC</div>
              <div class="mono" style="border:1px solid #c6c9d2; border-radius:8px; padding:9px 12px; background:#fff;">•••</div>
            </div>
          </div>
          <div style="margin-top:14px; background:#3b5bdb; color:#fff; border-radius:8px; padding:11px 0; text-align:center; font-weight:600;">
            Pay $148.00
          </div>
        </div>
        <div style="width:230px; background:#fff; border:1px solid #dfe1e7; border-radius:10px; padding:14px 16px;">
          <div style="font-weight:700; margin-bottom:10px;">Order summary</div>
          <div style="display:flex; justify-content:space-between; font-size:13.5px; margin-bottom:6px;"><span>Espresso machine × 1</span><span>$129.00</span></div>
          <div style="display:flex; justify-content:space-between; font-size:13.5px; margin-bottom:6px;"><span>Portafilter set</span><span>$19.00</span></div>
          <div style="display:flex; justify-content:space-between; font-size:13.5px; margin-bottom:6px;"><span>Shipping</span><span>free</span></div>
          <div style="display:flex; justify-content:space-between; font-weight:700; border-top:1px solid #dfe1e7; padding-top:8px; margin-top:8px;"><span>Total</span><span>$148.00</span></div>
          <div style="color:#7a8092; font-size:11.5px; margin-top:10px;">Attempt 2 of 3 · 09:24</div>
        </div>
      </div>
    </div>
  </div>`
);

// ---------------------------------------------------------------------------------------------
// 6. a sign-in screen with an expired second factor: account, and someone who cannot get in
// -----------------------------------------------------------------------------
const loginExpired = PAGE(
  'Sign in · code expired',
  `<div class="win">
    <div class="chrome">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      <div class="url">app.helm.co/signin/verify</div>
    </div>
    <div class="page" style="align-items:center; justify-content:center; background:#f2f3f7;">
      <div style="width:340px; background:#fff; border:1px solid #dfe1e7; border-radius:12px; padding:26px 28px;">
        <div style="font-weight:700; font-size:19px; margin-bottom:4px;">Two-step verification</div>
        <div style="color:#5a6072; font-size:13.5px; margin-bottom:16px;">
          We sent a 6-digit code to the phone ending 42.
        </div>
        <div style="display:flex; gap:8px; margin-bottom:14px;">
          <div class="mono" style="width:40px; height:48px; border:1px solid #c6c9d2; border-radius:8px; text-align:center; line-height:46px; font-size:19px;">4</div>
          <div class="mono" style="width:40px; height:48px; border:1px solid #c6c9d2; border-radius:8px; text-align:center; line-height:46px; font-size:19px;">1</div>
          <div class="mono" style="width:40px; height:48px; border:1px solid #c6c9d2; border-radius:8px; text-align:center; line-height:46px; font-size:19px;">9</div>
          <div class="mono" style="width:40px; height:48px; border:1px solid #c6c9d2; border-radius:8px; text-align:center; line-height:46px; font-size:19px; background:#f4f5f8; color:#8a90a2;">0</div>
          <div class="mono" style="width:40px; height:48px; border:1px solid #c6c9d2; border-radius:8px; text-align:center; line-height:46px; font-size:19px; background:#f4f5f8; color:#8a90a2;">0</div>
          <div class="mono" style="width:40px; height:48px; border:1px solid #c6c9d2; border-radius:8px; text-align:center; line-height:46px; font-size:19px; background:#f4f5f8; color:#8a90a2;">0</div>
        </div>
        <div style="background:#fbeed3; border:1px solid #e3c98c; border-radius:8px; padding:10px 12px; color:#8a5b0b; font-size:13px; margin-bottom:16px;">
          That code has expired. Request a new code and enter it within 10 minutes.
        </div>
        <div style="background:#3b5bdb; color:#fff; border-radius:8px; padding:11px 0; text-align:center; font-weight:600;">
          send a new code
        </div>
        <div style="text-align:center; color:#3b5bdb; font-size:12.5px; margin-top:12px;">use a recovery code instead</div>
      </div>
    </div>
  </div>`
);

const SAMPLES = [
  ['complaint-billing.png', complaintBilling],
  ['complaint-delivery.png', complaintDelivery],
  ['complaint-crash.png', complaintCrash],
  ['error-502.png', errorPage],
  ['checkout-declined.png', checkoutDeclined],
  ['login-expired.png', loginExpired],
];

const browser = await chromium.launch({ channel });
try {
  await mkdir(OUT, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 720, height: 540 } });
  for (const [name, html] of SAMPLES) {
    await page.setContent(html, { waitUntil: 'load' });
    const file = path.join(OUT, name);
    await page.screenshot({ path: file });
    console.log('wrote', path.relative(ROOT, file));
  }
} finally {
  await browser.close();
}
