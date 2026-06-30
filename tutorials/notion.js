/* Tutorial: Connect Notion to Neuron — full step-by-step, incl. adding the
   Neuron connection inside Notion. */
(() => {
  const NOTION = `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#fff" stroke="#e7e2d9"/><path fill="#000" d="M7 6.6l8.2-.6c.5 0 .7.1 1 .4l1.4 1.1c.3.2.4.3.4.7v8.6c0 .5-.2.8-.9.8l-8.6.5c-.4 0-.6-.1-.9-.4l-1.2-1.6c-.2-.3-.3-.5-.3-.9V7.5c0-.5.3-.8.9-.9z"/><path fill="#fff" d="M15.4 8.1c.1.4 0 .8-.4.8l-.4.1v5.8c-.3.2-.6.3-.9.3-.4 0-.5-.1-.8-.4l-2.6-4.1v4l.8.2s0 .5-.6.5l-1.7.1c0-.1 0-.5.3-.6l.5-.1V9.6l-.6-.1c-.1-.4.2-.9.8-1l1.8-.1 2.7 4.1V8.9l-.7-.1c-.1-.5.3-.8.7-.8z"/></svg>`;
  const NTILE = `<div class="brand-tile" style="background:#fff">${NOTION}</div>`;
  const NSMALL = `<div style="width:26px;height:26px;border-radius:7px;overflow:hidden;flex:0 0 26px">${NOTION}</div>`;
  const CK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
  const CKC = `<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1.2 14.2l-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4z"/></svg>`;
  const CKW = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
  const SHIELD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:#2e7d5b"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`;
  const PLUG = `<svg viewBox="0 0 24 24" fill="none" stroke="#37352f" stroke-width="2"><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 01-10 0V7zM12 16v5"/></svg>`;
  const headline = ['Add ', { hi: 'Neuron' }, ' to your Notion.'];
  const STEPS = 5;
  const npHead = `<div class="np-h" data-reveal><div><div class="np-title">Integrations</div>
    <div class="np-sub">Connect your tools so Neuron can capture your team's knowledge.</div></div></div>`;

  // 1 — integrations page
  const s1 = `<div class="np">${npHead}
    <div class="card" data-reveal style="margin-top:18px">
      <div class="row">${NTILE}<div class="grow"><div class="itg-name">Notion</div>
        <div class="itg-meta">Sync the pages you choose into Neuron</div></div>
        <span class="badge off">Not connected</span></div>
      <div class="desc" data-reveal>Neuron only reads pages you explicitly allow in Notion. You stay in control of what it can access.</div>
      <div class="divider actions" data-reveal><span></span>
        <button class="btn btn-primary" id="setup">Set up Notion</button></div>
    </div></div>`;

  // 2 — Notion setup explainer modal
  const step = (n, t, p) => `<div class="steprow" data-reveal><span class="num">${n}</span>
    <div><div class="st">${t}</div><div class="sp">${p}</div></div></div>`;
  const s2 = `<div class="np">
    <div class="mhead">${NTILE}<div><div class="mt">Set up Notion</div>
      <div class="ms">Choose exactly what Neuron can read.</div></div></div>
    <div class="steplist">
      ${step(1, 'Connect your Notion workspace', 'Neuron asks Notion for permission to read the pages you choose.')}
      ${step(2, 'Choose pages', 'When Notion opens, select the workspace and pages to sync.')}
      ${step(3, 'Share pages with Neuron', 'On any page, open Connections and add the Neuron integration.')}
      ${step(4, 'Sync and ask questions', 'Return to Neuron and click Sync Now.')}
    </div>
    <div data-reveal style="display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--muted);margin-top:9px">
      ${SHIELD} Neuron only reads pages you explicitly allow in Notion.</div>
    <div class="divider actions" data-reveal><span class="link" style="color:var(--muted)">Cancel</span>
      <button class="btn btn-primary" id="continue">Continue to Notion</button></div>
  </div>`;

  // 3 — Notion OAuth: choose workspace
  const wsRow = (name, sel) => `<div class="opt ${sel ? 'sel' : ''}" style="padding:9px 11px">
    <div class="on" style="display:flex;align-items:center;gap:9px">
      <span style="width:24px;height:24px;border-radius:6px;background:#37352f;color:#fff;display:grid;place-items:center;font-weight:700;font-size:12px">${name[0]}</span>${name}</div>
    <span class="ck">${sel ? CKW : ''}</span></div>`;
  const s3 = `<div class="oauth"><div class="oauth-card" data-reveal style="width:400px">
    <div class="oauth-logo" style="background:#fff;border:1px solid #eee">${NOTION}</div>
    <div class="oauth-h" data-reveal>Select a workspace</div>
    <div class="oauth-p" data-reveal><b>Neuron</b> will connect to the workspace you choose.</div>
    <div data-reveal style="display:flex;flex-direction:column;gap:7px;margin:14px 0;text-align:left">
      ${wsRow('Acme HQ', true)}${wsRow('Personal', false)}</div>
    <div class="oauth-btns" data-reveal>
      <button class="btn btn-ghost">Cancel</button>
      <button class="btn" id="wsnext" style="background:#111;color:#fff">Continue</button></div>
  </div></div>`;

  // 4 — Notion OAuth: select pages
  const pageOpt = (name, sel) => `<div class="opt ${sel ? 'sel' : ''}" style="padding:8px 11px">
    <div class="on" style="display:flex;align-items:center;gap:8px"><span style="font-size:14px">📄</span>${name}</div>
    <span class="ck">${sel ? CKW : ''}</span></div>`;
  const s4 = `<div class="oauth"><div class="oauth-card" data-reveal style="width:400px">
    <div class="oauth-logo" style="background:#fff;border:1px solid #eee">${NOTION}</div>
    <div class="oauth-h" data-reveal>Select pages</div>
    <div class="oauth-p" data-reveal>Choose the pages Neuron can use. You can change this anytime.</div>
    <div data-reveal style="display:flex;flex-direction:column;gap:7px;margin:14px 0;text-align:left">
      ${pageOpt('Engineering', true)}${pageOpt('Product Specs', true)}${pageOpt('Company Wiki', true)}</div>
    <div class="oauth-btns" data-reveal>
      <button class="btn btn-ghost">Cancel</button>
      <button class="btn" id="allow" style="background:#111;color:#fff">Allow access</button></div>
  </div></div>`;

  // 5 — back in Neuron, connected; reminder to share remaining pages
  const s5 = `<div class="np">
    <div class="banner" data-reveal>${CKC} Notion connected to Acme HQ.</div>
    <div class="card" data-reveal style="margin-top:14px">
      <div class="row">${NTILE}<div class="grow"><div class="itg-name">Notion</div>
        <div class="itg-meta">3 pages shared · more can be added in Notion</div></div>
        <span class="badge on">${CKC} Connected</span></div>
      <div class="desc" data-reveal>Want a page Neuron can't see yet? Open it in Notion and add the Neuron connection. Here's how 👇</div>
    </div></div>`;

  // 6 — inside Notion: a page, cursor heads to the ••• menu
  const npageBase = `<div class="npage">
    <div class="ph" data-reveal>📋 Q3 Planning</div>
    <div class="pl" data-reveal style="width:62%"></div>
    <div class="pl" data-reveal style="width:48%"></div>
    <div class="pl" data-reveal style="width:55%"></div>
    <div class="ndots" id="dots"><i></i><i></i><i></i></div>`;
  const s6 = `${npageBase}</div>`;

  // 7 — ••• menu open, Connections item highlighted
  const mi = (icon, label, hot, right) => `<div class="mi ${hot ? 'hot' : ''}"${hot ? ' id="conn"' : ''}>
    <span class="mic">${icon}</span>${label}${right ? `<span class="mr">${right}</span>` : ''}</div>`;
  const PG = `<svg viewBox="0 0 24 24" fill="none" stroke="#37352f" stroke-width="2"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/></svg>`;
  const CP = `<svg viewBox="0 0 24 24" fill="none" stroke="#37352f" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>`;
  const s7 = `${npageBase}
    <div class="nmenu" data-reveal style="top:44px;right:18px;width:236px">
      ${mi(CP, 'Copy link', false)}
      ${mi(PG, 'Duplicate', false)}
      ${mi(PLUG, 'Connections', true, '›')}
      ${mi(PG, 'Move to', false)}
    </div></div>`;

  // 8 — add connections search, typed "Neuron", result appears
  const s8 = `${npageBase}
    <div class="ndlg" data-reveal style="top:44px;right:18px;width:286px;padding:12px">
      <div style="font-size:12px;font-weight:700;color:#111;margin-bottom:9px">Add connections</div>
      <div class="searchbox" data-reveal>🔍 Neuron<span class="caret"></span></div>
      <div class="opt sel" id="neuronrow" data-reveal style="margin-top:9px;padding:8px;border:none;background:#eceffc">
        ${NSMALL}
        <div style="flex:1;text-align:left"><div class="on">Neuron</div><div class="om">Company brain · MCP</div></div>
        <span class="mr" style="font-size:11px;color:#70757e">↵</span>
      </div>
    </div></div>`;

  // 9 — confirm access dialog
  const s9 = `${npageBase}
    <div class="ndlg" data-reveal style="top:60px;right:30px;width:300px;text-align:center">
      <div style="width:40px;height:40px;margin:0 auto 10px;border-radius:10px;overflow:hidden">${NOTION}</div>
      <div data-reveal style="font-size:14px;font-weight:700;color:#111">Connect Neuron to this page?</div>
      <div data-reveal style="font-size:12px;color:#70757e;margin-top:7px;line-height:1.5">Neuron will be able to read <b>Q3 Planning</b> and all of its sub-pages.</div>
      <div class="oauth-btns" data-reveal style="margin-top:14px">
        <button class="btn btn-ghost">Cancel</button>
        <button class="btn" id="confirm" style="background:#111;color:#fff">Confirm</button></div>
    </div></div>`;

  // 10 — connection added, shown on the page
  const s10 = `${npageBase}
    <div data-reveal style="position:absolute;left:30px;top:120px;display:flex;align-items:center;gap:9px;background:#eef6f1;border:1px solid rgba(46,125,91,.25);border-radius:10px;padding:9px 12px">
      ${NSMALL}<div><div style="font-size:12.5px;font-weight:700;color:#1a1a1a">Neuron</div>
        <div style="font-size:11px;color:#2e7d5b;font-weight:600">${CK ? '' : ''}Has access to this page</div></div>
      <span class="badge on" style="margin-left:6px;font-size:10px">${CKC} Connected</span>
    </div></div>`;

  // 11 — back in Neuron, Sync Now
  const s11 = `<div class="np">
    <div class="banner" data-reveal>${CKC} All set. Choose Sync Now when you're ready to import pages.</div>
    <div class="card" data-reveal style="margin-top:14px">
      <div class="row">${NTILE}<div class="grow"><div class="itg-name">Notion</div>
        <div class="itg-meta">Connected to Acme HQ</div></div>
        <span class="badge on">${CKC} Connected</span></div>
      <div class="tiles" data-reveal><div class="tile"><div class="k">Pages</div><div class="v">0 synced</div></div>
        <div class="tile"><div class="k">Last synced</div><div class="v">Never</div></div></div>
      <div class="divider actions" data-reveal><span class="link">View Notion projects</span>
        <button class="btn btn-accent" id="sync">Sync Now</button></div>
    </div></div>`;

  // 12 — syncing progress
  const s12 = `<div class="np">${npHead}
    <div class="card" data-reveal style="margin-top:18px">
      <div class="row">${NTILE}<div class="grow"><div class="itg-name">Notion</div>
        <div class="itg-meta">Importing pages…</div></div>
        <span class="badge on">${CKC} Connected</span></div>
      <div data-reveal style="margin-top:16px"><div class="bar"><span style="width:72%"></span></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:8px">
          <span>Reading pages &amp; building searchable chunks</span><span>24 / 34</span></div></div>
      <div class="desc" data-reveal>Neuron reads each page, extracts knowledge, and indexes it for semantic search.</div>
    </div></div>`;

  // 13 — done, projects synced
  const proj = (name, meta) => `<div data-reveal style="display:flex;align-items:flex-start;gap:11px;border:1px solid var(--warm);border-radius:11px;padding:11px 13px;background:#fff">
    <div style="width:30px;height:30px;border-radius:8px;background:#f0ece4;display:grid;place-items:center;flex:0 0 30px">📄</div>
    <div><div style="font-size:13px;font-weight:700;color:var(--ink)">${name}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${meta}</div></div></div>`;
  const s13 = `<div class="np">
    <div class="banner" data-reveal>${CKC} Synced 34 pages from 3 projects.</div>
    <div data-reveal style="font-size:13px;font-weight:700;color:var(--ink);margin:14px 0 9px">All Notion projects</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${proj('Engineering', '18 knowledge items · 96 chunks')}
      ${proj('Product Specs', '11 knowledge items · 54 chunks')}
      ${proj('Company Wiki', '5 knowledge items · 22 chunks')}
      ${proj('+ more', 'Synced &amp; searchable')}</div>
  </div>`;

  // 14 — payoff: ask a question, answer cites the Notion page
  const s14 = `<div class="np">${npHead}
    <div class="qbox" data-reveal style="margin-top:18px">
      <span style="color:#9a9486">🔍</span> What did we decide about Q3 pricing?<span class="caret"></span></div>
    <div class="card" data-reveal style="margin-top:12px">
      <div style="font-size:13.5px;color:var(--ink);line-height:1.55" data-reveal>
        Q3 pricing moves to three tiers, with the Pro plan at $29/mo. Annual billing gets two months free.</div>
      <div data-reveal style="display:flex;align-items:center;gap:8px;margin-top:12px">
        <span class="ansrc">${NSMALL ? '📄' : ''} Notion · Q3 Planning</span>
        <span class="ansrc" style="background:var(--positive-soft);color:var(--positive)">${CKC} Verified</span></div>
    </div></div>`;

  const sc = (dur, step, stepLabel, caption, url, body, cursor) => ({ dur, headline, step, steps: STEPS, stepLabel, caption, chrome: { url }, body, cursor });

  window.NEURON_VIDEO = {
    eyebrow: 'Integrations · Step-by-step',
    scenes: [
      sc(3.6, 1, 'Open Notion setup', 'In Neuron, open Integrations and click Set up Notion.',
        'app.neuron.so/dashboard/integrations', s1, { to: '#setup', appearAt: 1.4, click: 2.8 }),
      sc(4.6, 1, 'Review the steps', 'Neuron explains what happens next — then click Continue to Notion.',
        'app.neuron.so/dashboard/integrations', s2, { to: '#continue', appearAt: 2.9, click: 3.8 }),
      sc(3.7, 2, 'Choose workspace', 'Notion opens. Pick the workspace you want to connect.',
        'notion.so/install-integration', s3, { to: '#wsnext', appearAt: 1.7, click: 2.9 }),
      sc(3.8, 2, 'Select pages', 'Choose the pages to share, then click Allow access.',
        'notion.so/install-integration', s4, { to: '#allow', appearAt: 1.8, click: 3.0 }),
      sc(3.6, 2, 'Connected', 'You are connected. Some pages may still need to be shared — here is how.',
        'app.neuron.so/dashboard/integrations?connected=notion', s5),
      sc(3.4, 3, 'Open the page in Notion', 'In Notion, open the page you want Neuron to read and click the ••• menu.',
        'notion.so/Q3-Planning', s6, { to: '#dots', appearAt: 1.3, click: 2.6 }),
      sc(3.6, 3, 'Open Connections', 'In the menu, choose Connections.',
        'notion.so/Q3-Planning', s7, { to: '#conn', appearAt: 1.3, click: 2.7 }),
      sc(3.7, 3, 'Search for Neuron', 'Type “Neuron” and select it from the list.',
        'notion.so/Q3-Planning', s8, { to: '#neuronrow', appearAt: 1.9, click: 3.0 }),
      sc(3.5, 3, 'Confirm access', 'Confirm — Neuron can now read this page and its sub-pages.',
        'notion.so/Q3-Planning', s9, { to: '#confirm', appearAt: 1.7, click: 2.9 }),
      sc(3.0, 3, 'Neuron added', 'Done in Notion. The Neuron connection now has access to the page.',
        'notion.so/Q3-Planning', s10),
      sc(3.5, 4, 'Back in Neuron', 'Back in Neuron, click Sync Now to import your pages.',
        'app.neuron.so/dashboard/integrations', s11, { to: '#sync', appearAt: 1.8, click: 2.9 }),
      sc(3.2, 4, 'Syncing', 'Neuron reads each page and builds searchable, verified knowledge.',
        'app.neuron.so/dashboard/integrations', s12),
      sc(3.6, 4, 'Synced', 'Every shared page is now imported and organised by project.',
        'app.neuron.so/dashboard/integrations/notion', s13),
      sc(4.4, 5, 'Ask anything', 'Now ask Neuron — answers come back with the exact Notion page as the source.',
        'app.neuron.so/dashboard', s14),
    ],
  };
})();
