/* Tutorial: Connect Notion to Neuron (incl. adding the Neuron connection in Notion) */
(() => {
  const NOTION = `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#fff" stroke="#e7e2d9"/><path fill="#000" d="M7 6.6l8.2-.6c.5 0 .7.1 1 .4l1.4 1.1c.3.2.4.3.4.7v8.6c0 .5-.2.8-.9.8l-8.6.5c-.4 0-.6-.1-.9-.4l-1.2-1.6c-.2-.3-.3-.5-.3-.9V7.5c0-.5.3-.8.9-.9z"/><path fill="#fff" d="M15.4 8.1c.1.4 0 .8-.4.8l-.4.1v5.8c-.3.2-.6.3-.9.3-.4 0-.5-.1-.8-.4l-2.6-4.1v4l.8.2s0 .5-.6.5l-1.7.1c0-.1 0-.5.3-.6l.5-.1V9.6l-.6-.1c-.1-.4.2-.9.8-1l1.8-.1 2.7 4.1V8.9l-.7-.1c-.1-.5.3-.8.7-.8z"/></svg>`;
  const NTILE = `<div class="brand-tile" style="background:#fff">${NOTION}</div>`;
  const CK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
  const CKC = `<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1.2 14.2l-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4z"/></svg>`;
  const CKW = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
  const SHIELD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:#2e7d5b"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`;
  const headline = ['Add ', { hi: 'Neuron' }, ' to your Notion.'];

  // 1 — integrations page
  const s1 = `
    <div class="np">
      <div class="np-h" data-reveal><div><div class="np-title">Integrations</div>
        <div class="np-sub">Connect your tools so Neuron can capture your team's knowledge.</div></div></div>
      <div class="card" data-reveal style="margin-top:18px">
        <div class="row">${NTILE}
          <div class="grow"><div class="itg-name">Notion</div>
            <div class="itg-meta">Sync the pages you choose into Neuron</div></div>
          <span class="badge off">Not connected</span></div>
        <div class="desc" data-reveal>Neuron only reads pages you explicitly allow in Notion. You stay in control of what it can access.</div>
        <div class="divider actions" data-reveal><span></span>
          <button class="btn btn-primary" id="setup">Set up Notion</button></div>
      </div>
    </div>`;

  // 2 — Notion setup modal (the 4-step explainer)
  const step = (n, t, p) => `<div class="steprow" data-reveal><span class="num">${n}</span>
    <div><div class="st">${t}</div><div class="sp">${p}</div></div></div>`;
  const s2 = `
    <div class="np">
      <div class="mhead">${NTILE}<div><div class="mt">Set up Notion</div>
        <div class="ms">Choose exactly what Neuron can read.</div></div></div>
      <div class="steplist">
        ${step(1, 'Connect your Notion workspace', 'Neuron asks Notion for permission to read the pages you choose.')}
        ${step(2, 'Choose pages', 'When Notion opens, select the workspace and pages to sync.')}
        ${step(3, 'Share pages with Neuron', 'On any page, open Connections and add the Neuron integration.')}
        ${step(4, 'Sync and ask questions', 'Return to Neuron and click Sync Now.')}
      </div>
      <div data-reveal style="display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--muted);margin-top:10px">
        ${SHIELD} Neuron only reads pages you explicitly allow in Notion.</div>
      <div class="divider actions" data-reveal><span class="link" style="color:var(--muted)">Cancel</span>
        <button class="btn btn-primary" id="continue">Continue to Notion</button></div>
    </div>`;

  // 3 — Notion OAuth: select pages
  const pageOpt = (name, sel) => `<div class="opt ${sel ? 'sel' : ''}" style="padding:8px 11px">
    <div class="on" style="display:flex;align-items:center;gap:8px"><span style="font-size:14px">📄</span>${name}</div>
    <span class="ck">${sel ? CKW : ''}</span></div>`;
  const s3 = `
    <div class="oauth">
      <div class="oauth-card" data-reveal style="width:400px">
        <div class="oauth-logo" style="background:#fff;border:1px solid #eee">${NOTION}</div>
        <div class="oauth-h" data-reveal>Select pages</div>
        <div class="oauth-p" data-reveal><b>Neuron</b> wants access to your <b>Acme</b> workspace. Choose the pages it can use.</div>
        <div data-reveal style="display:flex;flex-direction:column;gap:7px;margin:14px 0;text-align:left">
          ${pageOpt('Engineering', true)}
          ${pageOpt('Product Specs', true)}
          ${pageOpt('Company Wiki', true)}
        </div>
        <div class="oauth-btns" data-reveal>
          <button class="btn btn-ghost">Cancel</button>
          <button class="btn" id="allow" style="background:#111;color:#fff">Allow access</button>
        </div>
      </div>
    </div>`;

  // 4 — Inside Notion: add the Neuron connection on a page
  const s4 = `
    <div style="height:100%;background:#fff;position:relative;padding:26px 30px">
      <div data-reveal style="font:800 22px Georgia,serif;color:#111">📋 Q3 Planning</div>
      <div data-reveal style="height:9px;width:62%;background:#f0ece4;border-radius:5px;margin-top:14px"></div>
      <div data-reveal style="height:9px;width:48%;background:#f3efe9;border-radius:5px;margin-top:9px"></div>
      <div data-reveal style="height:9px;width:54%;background:#f3efe9;border-radius:5px;margin-top:9px"></div>
      <!-- connections popover -->
      <div data-reveal style="position:absolute;right:30px;top:64px;width:300px;background:#fff;border:1px solid #e9e4db;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.18);padding:12px">
        <div style="font-size:12px;font-weight:700;color:#111;margin-bottom:9px">Add connections</div>
        <div style="height:30px;border:1px solid #e7e2d9;border-radius:8px;display:flex;align-items:center;gap:7px;padding:0 10px;font-size:13px;color:#111">
          <span style="color:#9a9486">🔍</span> Neuron<span style="width:1px;height:14px;background:#111;margin-left:1px;animation:none"></span>
        </div>
        <div data-reveal style="display:flex;align-items:center;gap:9px;margin-top:9px;padding:8px;border-radius:8px;background:#eceffc">
          <div style="width:26px;height:26px;border-radius:7px;overflow:hidden;flex:0 0 26px">${NOTION}</div>
          <div style="flex:1"><div style="font-size:13px;font-weight:700;color:#111">Neuron</div>
            <div style="font-size:11px;color:#70757e">Company brain · MCP</div></div>
          <span class="badge on" style="font-size:10px">${CKC} Added</span>
        </div>
        <div style="font-size:10.5px;color:#70757e;margin-top:9px;line-height:1.45">Neuron can now read this page and its sub-pages.</div>
      </div>
    </div>`;

  // 5 — back in Neuron, ready to sync
  const s5 = `
    <div class="np">
      <div class="banner" data-reveal>${CKC} Notion connected. Choose Sync Now when you're ready to import pages.</div>
      <div class="card" data-reveal style="margin-top:16px">
        <div class="row">${NTILE}
          <div class="grow"><div class="itg-name">Notion</div>
            <div class="itg-meta">Connected to Acme workspace</div></div>
          <span class="badge on">${CKC} Connected</span></div>
        <div class="tiles" data-reveal><div class="tile"><div class="k">Pages</div><div class="v">0 synced</div></div>
          <div class="tile"><div class="k">Last synced</div><div class="v">Never</div></div></div>
        <div class="divider actions" data-reveal><span class="link">View Notion projects</span>
          <button class="btn btn-accent" id="sync">Sync Now</button></div>
      </div>
    </div>`;

  // 6 — done
  const proj = (name, meta) => `<div data-reveal style="display:flex;align-items:flex-start;gap:11px;border:1px solid var(--warm);border-radius:11px;padding:11px 13px;background:#fff">
    <div style="width:30px;height:30px;border-radius:8px;background:#f0ece4;display:grid;place-items:center;flex:0 0 30px">📄</div>
    <div><div style="font-size:13px;font-weight:700;color:var(--ink)">${name}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${meta}</div></div></div>`;
  const s6 = `
    <div class="np">
      <div class="banner" data-reveal>${CKC} Synced 34 pages from 3 projects.</div>
      <div data-reveal style="font-size:13px;font-weight:700;color:var(--ink);margin:16px 0 9px">All Notion projects</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${proj('Engineering', '18 knowledge items · 96 chunks')}
        ${proj('Product Specs', '11 knowledge items · 54 chunks')}
        ${proj('Company Wiki', '5 knowledge items · 22 chunks')}
        ${proj('+ more', 'Synced & searchable')}
      </div>
    </div>`;

  window.NEURON_VIDEO = {
    eyebrow: 'Integrations · Step-by-step',
    scenes: [
      { dur: 3.6, headline, step: 1, steps: 4, stepLabel: 'Open Notion setup',
        caption: 'In Neuron, open Integrations and click Set up Notion.',
        chrome: { url: 'app.neuron.so/dashboard/integrations' }, body: s1,
        cursor: { to: '#setup', appearAt: 1.4, click: 2.8 } },
      { dur: 4.0, headline, step: 1, steps: 4, stepLabel: 'Review the steps',
        caption: 'Neuron explains what happens next. Click Continue to Notion.',
        chrome: { url: 'app.neuron.so/dashboard/integrations' }, body: s2,
        cursor: { to: '#continue', appearAt: 2.4, click: 3.3 } },
      { dur: 3.7, headline, step: 2, steps: 4, stepLabel: 'Choose pages',
        caption: 'Notion opens. Pick the workspace and pages to share, then click Allow access.',
        chrome: { url: 'notion.so/install-integration' }, body: s3,
        cursor: { to: '#allow', appearAt: 1.7, click: 2.9 } },
      { dur: 4.2, headline, step: 3, steps: 4, stepLabel: 'Add Neuron in Notion',
        caption: 'On any page in Notion, open the ••• menu → Connections, search Neuron, and add it.',
        chrome: { url: 'notion.so/Q3-Planning' }, body: s4 },
      { dur: 3.7, headline, step: 4, steps: 4, stepLabel: 'Back in Neuron',
        caption: 'Back in Neuron, you are connected. Click Sync Now to import your pages.',
        chrome: { url: 'app.neuron.so/dashboard/integrations?connected=notion' }, body: s5,
        cursor: { to: '#sync', appearAt: 1.9, click: 3.0 } },
      { dur: 3.8, headline, step: 4, steps: 4, stepLabel: 'Done',
        caption: 'Done. If a page is missing later, just add the Neuron connection to it in Notion.',
        chrome: { url: 'app.neuron.so/dashboard/integrations/notion' }, body: s6 },
    ],
  };
})();
