/* Neuron — full product demo (~2 min). Landing (tryneuron.net) -> Try Neuron Now
   -> sign up -> onboarding (intent, workspace, connect, sync, ready) ->
   dashboard -> Ask your Brain -> agents/MCP -> close. */
(() => {
  const MARK = `<svg viewBox="0 0 32 32" fill="none"><g stroke="#5b7bff" stroke-width="1.5" opacity=".75"><path d="M16 16 6.5 8.5M16 16 25.5 9M16 16 7 25M16 16 25 24"/></g><circle cx="16" cy="16" r="6" fill="#5b7bff"/><circle cx="6.5" cy="8.5" r="2.5" fill="#8ea2ff"/><circle cx="25.5" cy="9" r="2.5" fill="#8ea2ff"/><circle cx="7" cy="25" r="2.5" fill="#8ea2ff"/><circle cx="25" cy="24" r="2.5" fill="#8ea2ff"/></svg>`;
  const SLACK = `<svg viewBox="0 0 122.8 122.8"><path d="M25.8 77.6a12.9 12.9 0 11-12.9-12.9h12.9z" fill="#E01E5A"/><path d="M32.3 77.6a12.9 12.9 0 1125.8 0v32.3a12.9 12.9 0 11-25.8 0z" fill="#E01E5A"/><path d="M45.2 25.8a12.9 12.9 0 1112.9-12.9v12.9z" fill="#36C5F0"/><path d="M45.2 32.3a12.9 12.9 0 110 25.8H12.9a12.9 12.9 0 110-25.8z" fill="#36C5F0"/><path d="M97 45.2a12.9 12.9 0 1112.9 12.9H97z" fill="#2EB67D"/><path d="M90.5 45.2a12.9 12.9 0 11-25.8 0V12.9a12.9 12.9 0 1125.8 0z" fill="#2EB67D"/><path d="M77.6 97a12.9 12.9 0 11-12.9 12.9V97z" fill="#ECB22E"/><path d="M77.6 90.5a12.9 12.9 0 110-25.8h32.3a12.9 12.9 0 110 25.8z" fill="#ECB22E"/></svg>`;
  const NOTION = `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#fff" stroke="#e7e2d9"/><path fill="#000" d="M7 6.6l8.2-.6c.5 0 .7.1 1 .4l1.4 1.1c.3.2.4.3.4.7v8.6c0 .5-.2.8-.9.8l-8.6.5c-.4 0-.6-.1-.9-.4l-1.2-1.6c-.2-.3-.3-.5-.3-.9V7.5c0-.5.3-.8.9-.9z"/><path fill="#fff" d="M15.4 8.1c.1.4 0 .8-.4.8l-.4.1v5.8c-.3.2-.6.3-.9.3-.4 0-.5-.1-.8-.4l-2.6-4.1v4l.8.2s0 .5-.6.5l-1.7.1c0-.1 0-.5.3-.6l.5-.1V9.6l-.6-.1c-.1-.4.2-.9.8-1l1.8-.1 2.7 4.1V8.9l-.7-.1c-.1-.5.3-.8.7-.8z"/></svg>`;
  const G = `<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 01-2.3 3.5v2.9h3.7C21.8 18.9 23 15.9 23 12.3z"/><path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.8H1.8v3C3.7 21.4 7.5 24 12 24z"/><path fill="#FBBC05" d="M5.6 14.6a7.2 7.2 0 010-4.6v-3H1.8a12 12 0 000 10.6z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.2 15.1 0 12 0 7.5 0 3.7 2.6 1.8 6.4l3.8 3c.9-2.8 3.4-4.6 6.4-4.6z"/></svg>`;
  const CKC = `<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1.2 14.2l-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4z"/></svg>`;
  const tile = (svg) => `<div class="brand-tile" style="background:#fff">${svg}</div>`;
  const nav = (label, on) => `<div class="nav-item ${on ? 'on' : ''}"><span class="nd"></span>${label}</div>`;
  const appShell = (active, content, contentId) => `<div class="appui">
    <div class="app-side">
      <div class="app-brand">${MARK}<span>Neuron</span></div>
      ${nav('Overview', active === 'overview')}${nav('Ask your Brain', active === 'ask')}
      ${nav('Integrations', active === 'integrations')}${nav('Knowledge', active === 'knowledge')}
      ${nav('Settings', active === 'settings')}
    </div>
    <div class="app-main"${contentId ? ` id="${contentId}"` : ''}>${content}</div></div>`;
  const tealHead = (parts) => parts; // headlines use the engine's {hi} format

  // ---------------------------------------------------------------- scenes ---
  // 0 — title
  const s0 = `<div class="hero"><div class="hero-body">
    <div data-reveal style="display:flex;align-items:center;gap:12px">
      <div style="width:46px;height:46px">${MARK}</div>
      <span style="color:#fff;font:800 30px Georgia,serif">Neuron</span></div>
    <div class="hero-sub" data-reveal style="margin-top:16px">A product demo — from sign-up to answers in two minutes.</div>
  </div></div>`;

  // 1 — landing hero, Try Neuron Now
  const s1 = `<div class="hero">
    <div class="hero-nav" data-reveal>
      <div class="hero-brand">${MARK}<span>Neuron</span></div>
      <div class="hero-links"><span>Product</span><span>Pricing</span><span>Docs</span>
        <span style="color:#fff;border:1px solid #2c3766;padding:5px 12px;border-radius:8px">Sign in</span></div>
    </div>
    <div class="hero-body">
      <div class="hero-eyebrow" data-reveal>tryneuron.net</div>
      <div class="hero-h1" data-reveal>The company brain your agents can&nbsp;<span class="hl">actually trust.</span></div>
      <div class="hero-sub" data-reveal>Connect Slack, Notion, Gmail and Linear. Neuron captures every decision and answers with verified sources.</div>
      <div class="hero-cta" id="cta" data-reveal>Try Neuron Now →</div>
    </div></div>`;

  // 2 — sign up (app.tryneuron.net)
  const s2 = `<div class="signup"><div class="signup-card" data-reveal>
    <div class="lg">${MARK}</div>
    <h2 data-reveal>Create your account</h2>
    <div class="sub" data-reveal>Start your company brain — free.</div>
    <div class="oauth-google" data-reveal>${G ? `<span style="width:16px;height:16px;display:inline-block">${G}</span>` : ''} Continue with Google</div>
    <div class="signup-or" data-reveal>or</div>
    <div class="signup-field" data-reveal style="color:#9aa0ad">you@company.com</div>
    <div class="btn btn-primary" id="signup" data-reveal style="width:100%;justify-content:center;margin-top:12px">Continue</div>
  </div></div>`;

  // 3 — onboarding welcome
  const s3 = `<div class="signup"><div class="signup-card" data-reveal style="text-align:left">
    <p style="font-size:11px;font-weight:700;letter-spacing:.15em;color:#9aa0ad;text-transform:uppercase" data-reveal>Neuron Setup</p>
    <h2 data-reveal style="margin-top:8px">Welcome to Neuron</h2>
    <div class="sub" data-reveal>Let's create your workspace — it takes a minute.</div>
    <div class="btn btn-primary" id="welcome" data-reveal style="width:100%;justify-content:center;margin-top:18px">Get started</div>
  </div></div>`;

  // 4 — how will you use Neuron
  const opt2 = (ico, t, d, sel, id) => `<div class="opt2 ${sel ? 'sel' : ''}"${id ? ` id="${id}"` : ''}>
    <div class="ico">${ico}</div><div class="t">${t}</div><div class="d">${d}</div></div>`;
  const s4 = `<div class="signup"><div class="signup-card" data-reveal style="width:380px;text-align:left">
    <h2 data-reveal>How will you use Neuron?</h2>
    <div class="sub" data-reveal>You can always invite your team later.</div>
    <div class="choice" data-reveal style="margin-top:16px">
      ${opt2('👤', 'Just me', 'A personal brain', false)}
      ${opt2('👥', 'With my team', 'Shared company brain', true, 'team')}
    </div></div></div>`;

  // 5 — name workspace
  const s5 = `<div class="signup"><div class="signup-card" data-reveal style="width:380px;text-align:left">
    <h2 data-reveal>Name your workspace</h2>
    <div class="sub" data-reveal>This is what your team will see.</div>
    <div class="signup-field" data-reveal style="margin-top:16px;color:#15171f">Acme Inc.<span class="caret"></span></div>
    <div class="btn btn-primary" id="wsnext" data-reveal style="width:100%;justify-content:center;margin-top:14px">Continue</div>
  </div></div>`;

  // 6 — connect your tools
  const connRow = (svg, name, desc, btnId, btnLabel, done) => `<div class="row" data-reveal style="border:1px solid var(--warm);border-radius:12px;padding:12px;margin-top:10px">
    ${tile(svg)}<div class="grow"><div class="itg-name">${name}</div><div class="itg-meta">${desc}</div></div>
    ${done ? `<span class="badge on">${CKC} Connected</span>` : `<button class="btn btn-primary"${btnId ? ` id="${btnId}"` : ''}>${btnLabel}</button>`}</div>`;
  const s6 = `<div class="signup"><div class="signup-card" data-reveal style="width:420px;text-align:left">
    <h2 data-reveal>Connect your tools</h2>
    <div class="sub" data-reveal>Sync your Notion pages and Slack conversations.</div>
    ${connRow(NOTION, 'Notion', 'Sync all pages your integration can access', null, 'Connect', true)}
    ${connRow(SLACK, 'Slack', 'Connect via OAuth to sync channels', 'connslack', 'Connect', false)}
  </div></div>`;

  // 7 — Slack OAuth
  const s7 = `<div class="oauth"><div class="oauth-card dark" data-reveal>
    <div class="oauth-logo" style="background:#fff">${SLACK}</div>
    <div class="oauth-h" data-reveal>Neuron is requesting permission<br/>to access the Acme HQ workspace</div>
    <div class="oauth-perm" data-reveal>
      <div class="pr"><span>✓</span><span>View messages in channels Neuron is added to</span></div>
      <div class="pr"><span>✓</span><span>View basic channel &amp; people info</span></div></div>
    <div class="oauth-btns" data-reveal>
      <button class="btn btn-ghost" style="background:transparent;color:#a9aebc;border-color:#3a3e4c">Cancel</button>
      <button class="btn" id="allow" style="background:#611f69;color:#fff">Allow</button></div>
  </div></div>`;

  // 8 — syncing
  const s8 = `<div class="signup"><div class="signup-card" data-reveal style="width:420px;text-align:left">
    <h2 data-reveal>Syncing your workspace…</h2>
    <div class="sub" data-reveal>Reading pages &amp; messages, extracting knowledge.</div>
    <div data-reveal style="margin-top:18px"><div class="bar"><span style="width:74%"></span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:8px">
        <span>Building searchable, verified knowledge</span><span>208 / 280</span></div></div>
    <div class="chips" data-reveal style="margin-top:14px">
      <span class="chip">${tile ? '' : ''}Notion · 34 pages</span><span class="chip">Slack · 5 channels</span></div>
  </div></div>`;

  // 9 — brain ready, ask first question
  const s9 = `<div class="signup"><div class="signup-card" data-reveal style="width:440px;text-align:left">
    <div class="banner" data-reveal style="margin:0 0 12px">${CKC} Your brain is ready.</div>
    <h2 data-reveal>Ask anything</h2>
    <div class="qbox" data-reveal style="margin-top:12px">🔍 What are our current priorities?<span class="caret"></span></div>
    <div data-reveal style="font-size:13px;color:var(--ink);line-height:1.5;margin-top:12px">
      Ship the new pricing page, keep refunds at 14 days, and finalize Q3 planning.</div>
    <div data-reveal style="margin-top:10px"><span class="ansrc">📄 Notion · Q3 Planning</span></div>
  </div></div>`;

  // 10 — dashboard overview
  const statCard = (k, v) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const s10 = appShell('overview', `
    <div data-reveal><div class="app-h">Overview</div><div class="app-sub">Your company brain at a glance.</div></div>
    <div class="tiles" data-reveal style="margin-top:16px;grid-template-columns:1fr 1fr 1fr">
      ${statCard('Knowledge items', '264')}${statCard('Sources', '4 connected')}${statCard('Synced', 'just now')}</div>
    <div class="card" data-reveal style="margin-top:14px">
      <div style="font-size:13px;font-weight:700;color:var(--ink)">Recent decisions</div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:8px;line-height:1.7">
        ✓ Refund window stays at 14 days — <b>#ops</b><br/>
        ✓ Pro plan priced at \$29/mo — <b>Notion · Q3 Planning</b><br/>
        ✓ Launch pricing page Friday — <b>Linear · ENG-241</b></div></div>`);

  // 11 — integrations page
  const intgCard = (svg, name, meta) => `<div data-reveal style="display:flex;align-items:center;gap:11px;border:1px solid var(--warm);border-radius:12px;padding:12px;background:#fff">
    ${tile(svg)}<div class="grow"><div class="itg-name">${name}</div><div class="itg-meta">${meta}</div></div>
    <span class="badge on">${CKC} Connected</span></div>`;
  const s11 = appShell('integrations', `
    <div data-reveal><div class="app-h">Integrations</div><div class="app-sub">Everything Neuron reads, in one place.</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
      ${intgCard(SLACK, 'Slack', '5 channels · 142 messages')}
      ${intgCard(NOTION, 'Notion', '34 pages · 3 projects')}
      ${intgCard(G, 'Gmail', 'Inbox, Sent · read-only')}
      ${intgCard('<div style="width:18px;height:18px;background:#5E6AD2;border-radius:5px"></div>', 'Linear', '87 issues · 4 teams')}</div>`);

  // 12 — Ask your Brain (query)
  const s12 = appShell('ask', `
    <div data-reveal><div class="app-h">Ask your Brain</div><div class="app-sub">Answers with verified sources — never a guess.</div></div>
    <div class="qbox" data-reveal style="margin-top:16px">🔍 What's our refund policy?<span class="caret"></span></div>
    <div class="card" data-reveal style="margin-top:12px">
      <div style="font-size:13.5px;color:var(--ink);line-height:1.55">Refunds are available within <b>14 days</b>, no questions asked. This applies to all paid plans.</div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <span class="ansrc">${CKC} Verified</span>
        <span class="ansrc" style="background:var(--accent-soft);color:var(--navy)">Slack · #ops</span>
        <span class="ansrc" style="background:var(--accent-soft);color:var(--navy)">Notion · Policies</span></div></div>`);

  // 13 — agents / MCP (Claude)
  const s13 = `<div class="term-wrap">
    <div class="termcard" data-reveal>
      <div class="term-top">CLAUDE DESKTOP · NEURON MCP</div>
      <div class="term-line" data-reveal><span class="tprompt">›</span>query_company_brain("what's our refund policy?")</div>
      <div class="term-ok" data-reveal>✓ verified · confidence 0.98</div>
      <div class="term-strong" data-reveal>14 days, no questions asked.</div>
      <div class="term-sources" data-reveal>sources:<br/>· slack/#ops · verified by @marie<br/>· notion/policies · 4d ago</div>
    </div></div>`;

  // 14 — closing
  const s14 = `<div class="hero"><div class="hero-body">
    <div data-reveal style="width:46px;height:46px">${MARK}</div>
    <div class="hero-h1" data-reveal style="font-size:34px;margin-top:14px">One brain. <span class="hl">Every tool.</span></div>
    <div class="hero-sub" data-reveal>Start free and connect your stack in minutes.</div>
    <div class="hero-cta" data-reveal style="margin-top:22px">tryneuron.net</div>
  </div></div>`;

  const HL = ['Meet ', { hi: 'Neuron' }, '.'];
  const sc = (dur, headline, caption, url, body, cursor) =>
    ({ dur, headline, caption, chrome: url ? { url } : undefined, body, cursor });

  window.NEURON_VIDEO = {
    eyebrow: 'Product demo',
    fps: 30,
    scenes: [
      sc(4.5, HL, 'A quick tour — from sign-up to verified answers.', null, s0),
      sc(8.0, ['Start at ', { hi: 'tryneuron.net' }, '.'], 'On the landing page, click “Try Neuron Now”.',
        'tryneuron.net', s1, { to: '#cta', appearAt: 3.4, click: 5.6 }),
      sc(7.0, ['Create your ', { hi: 'account' }, '.'], 'Sign up with Google or email — it’s free to start.',
        'app.tryneuron.net/sign-up', s2, { to: '#signup', appearAt: 3.4, click: 5.2 }),
      sc(5.5, ['Set up your ', { hi: 'workspace' }, '.'], 'Neuron walks you through a one-minute setup.',
        'app.tryneuron.net/setup', s3, { to: '#welcome', appearAt: 2.6, click: 4.0 }),
      sc(6.5, ['Solo or with your ', { hi: 'team' }, '?'], 'Choose how you’ll use Neuron.',
        'app.tryneuron.net/setup', s4, { to: '#team', appearAt: 2.8, click: 4.6 }),
      sc(6.0, ['Name your ', { hi: 'workspace' }, '.'], 'Give your company brain a name.',
        'app.tryneuron.net/setup', s5, { to: '#wsnext', appearAt: 2.9, click: 4.4 }),
      sc(7.0, ['Connect your ', { hi: 'tools' }, '.'], 'Connect Notion and Slack so Neuron can read them.',
        'app.tryneuron.net/setup', s6, { to: '#connslack', appearAt: 3.2, click: 5.2 }),
      sc(6.0, ['Authorize in ', { hi: 'Slack' }, '.'], 'Review what Neuron can read, then click Allow.',
        'slack.com/oauth/authorize', s7, { to: '#allow', appearAt: 2.8, click: 4.4 }),
      sc(6.0, ['Neuron builds your ', { hi: 'brain' }, '.'], 'It reads your pages and messages and extracts knowledge.',
        'app.tryneuron.net/setup', s8),
      sc(7.5, ['Ask your first ', { hi: 'question' }, '.'], 'Your brain is ready — ask anything and get a sourced answer.',
        'app.tryneuron.net/setup', s9),
      sc(7.0, ['Your ', { hi: 'dashboard' }, '.'], 'See knowledge, decisions, and sources at a glance.',
        'app.tryneuron.net/dashboard/overview', s10),
      sc(6.5, ['Every tool, ', { hi: 'connected' }, '.'], 'Slack, Notion, Gmail and Linear feed one brain.',
        'app.tryneuron.net/dashboard/integrations', s11),
      sc(8.0, ['Ask your ', { hi: 'Brain' }, '.'], 'Every answer comes back verified, with its exact sources.',
        'app.tryneuron.net/dashboard/query', s12, { to: '.qbox', appearAt: 2.6, click: 4.2 }),
      sc(7.0, ['MCP-native for your ', { hi: 'agents' }, '.'], 'Your agents query the same brain — and can trust it.',
        'claude desktop · neuron mcp', s13),
      sc(6.0, ['One brain. ', { hi: 'Every tool.' }], 'Start free at tryneuron.net.',
        'tryneuron.net', s14),
    ],
  };
})();
