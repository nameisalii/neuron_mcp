/* Tutorial: Connect Gmail to Neuron (privacy-first wizard) */
(() => {
  const GMAIL = `<svg viewBox="0 0 52 40"><path fill="#4285F4" d="M3 37h8V19L0 11v23a3 3 0 003 3z"/><path fill="#34A853" d="M41 37h8a3 3 0 003-3V11l-11 8z"/><path fill="#FBBC04" d="M41 6v13l11-8V8a4 4 0 00-6.4-3.2z"/><path fill="#EA4335" d="M11 19V6l15 11L41 6v13L26 30z"/><path fill="#C5221F" d="M0 8v3l11 8V6L6.4 4.8A4 4 0 000 8z"/></svg>`;
  const GOOGLE = `<svg viewBox="0 0 48 48"><path fill="#4285F4" d="M45 24c0-1.6-.1-3.1-.4-4.6H24v9h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1C42.7 36.7 45 30.9 45 24z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.2-2.9.7-4.2v-5.7H4.5C3 17 2 20.4 2 24s1 7 2.5 9.9z"/><path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"/></svg>`;
  const CK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
  const CKC = `<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1.2 14.2l-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4z"/></svg>`;
  const CKW = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
  const tile = (svg) => `<div class="brand-tile">${svg}</div>`;
  const headline = ['Bring ', { hi: 'Gmail' }, ' in — privately.'];

  const pips = (active) => {
    const labels = ['Connect', 'Labels', 'Filters', 'Review'];
    return `<div class="pips">${labels.map((l, i) => `
      <div class="pip ${i <= active ? 'on' : ''}"><span class="b">${i + 1}</span>${l}</div>
      ${i < 3 ? '<span class="arrow">›</span>' : ''}`).join('')}</div>`;
  };
  const mhead = `<div class="mhead">${tile(GMAIL)}<div><div class="mt">Gmail setup</div>
    <div class="ms">Gmail is personal by default. Your emails stay private.</div></div></div>`;

  // 1 — integrations page
  const s1 = `
    <div class="np">
      <div class="np-h" data-reveal><div><div class="np-title">Integrations</div>
        <div class="np-sub">Connect your tools so Neuron can capture your team's knowledge.</div></div></div>
      <div class="card" data-reveal style="margin-top:18px">
        <div class="row">${tile(GMAIL)}
          <div class="grow"><div class="itg-name">Gmail</div>
            <div class="itg-meta">Turn important emails into private, searchable memory</div></div>
          <span class="badge off">Not connected</span></div>
        <div class="desc" data-reveal>Personal by default. Neuron only requests read-only access to the labels you choose.</div>
        <div class="divider actions" data-reveal><span></span>
          <button class="btn btn-primary" id="setup">Set up</button></div>
      </div>
    </div>`;

  // 2 — modal: connect step
  const s2 = `
    <div class="np">
      ${mhead}
      ${pips(0)}
      <div data-reveal style="font-size:13px;color:var(--muted);line-height:1.6;margin-top:2px">
        Neuron reads selected Gmail labels and turns important emails into private, searchable memory.
      </div>
      <div data-reveal style="font-size:13px;color:var(--muted);margin-top:10px">
        Connect Gmail to continue. Neuron only requests <b style="color:var(--ink)">read-only</b> access.
      </div>
      <div class="divider actions" data-reveal>
        <span class="link" style="color:var(--muted)">Not now</span>
        <button class="btn btn-red" id="connect">Connect Gmail</button>
      </div>
    </div>`;

  // 3 — Google consent
  const s3 = `
    <div class="oauth">
      <div class="oauth-card" data-reveal>
        <div class="oauth-logo" style="background:#fff">${GOOGLE}</div>
        <div class="oauth-h" data-reveal>Neuron wants to access<br/>your Google Account</div>
        <div class="oauth-acct" data-reveal style="margin-top:10px"><span class="av" style="background:#ea4335">M</span> you@gmail.com</div>
        <div class="oauth-perm" data-reveal>
          <div class="pr">${CK}<span>Read, compose &amp; access your email <b>(read-only)</b></span></div>
          <div class="pr">${CK}<span>View your email labels</span></div>
        </div>
        <div class="oauth-p" data-reveal style="font-size:11.5px">Neuron never sends email and never stores messages you didn't select.</div>
        <div class="oauth-btns" data-reveal>
          <button class="btn btn-ghost">Cancel</button>
          <button class="btn btn-accent" id="allow">Allow</button>
        </div>
      </div>
    </div>`;

  // 4 — labels
  const opt = (name, meta, sel) => `<div class="opt ${sel ? 'sel' : ''}"><div><div class="on">${name}</div>
    <div class="om">${meta}</div></div><span class="ck">${sel ? CKW : ''}</span></div>`;
  const s4 = `
    <div class="np">
      ${mhead}
      ${pips(1)}
      <div data-reveal style="font-size:14px;font-weight:700;color:var(--ink)">Choose labels</div>
      <div data-reveal style="font-size:12px;color:var(--muted);margin:4px 0 10px">Inbox and Sent are selected by default. Important and custom labels are optional.</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div data-reveal>${opt('Inbox', 'system · 1,284 messages', true)}</div>
        <div data-reveal>${opt('Sent', 'system · 412 messages', true)}</div>
        <div data-reveal>${opt('Important', 'system · 196 messages', true)}</div>
        <div data-reveal>${opt('Promotions', 'system · excluded', false)}</div>
      </div>
      <div class="divider actions" data-reveal><span class="link" style="color:var(--muted)">Back</span>
        <button class="btn btn-accent" id="next">Next</button></div>
    </div>`;

  // 5 — filters
  const s5 = `
    <div class="np">
      ${mhead}
      ${pips(2)}
      <div data-reveal style="font-size:14px;font-weight:700;color:var(--ink)">Filters</div>
      <div class="field" data-reveal><div class="fl">Sync from date</div><div class="fi">2025-01-01</div></div>
      <div class="field" data-reveal><div class="fl">Senders or domains to include</div><div class="fi">@acme.com, boss@acme.com</div></div>
      <div class="field" data-reveal><div class="fl">Max messages to sync</div><div class="fi">200</div></div>
      <div class="divider actions" data-reveal><span class="link" style="color:var(--muted)">Back</span>
        <button class="btn btn-accent" id="review">Review</button></div>
    </div>`;

  // 6 — review
  const s6 = `
    <div class="np">
      ${mhead}
      ${pips(3)}
      <div data-reveal style="font-size:14px;font-weight:700;color:var(--ink)">Review</div>
      <div class="tiles" data-reveal style="grid-template-columns:1fr 1fr">
        <div class="tile"><div class="k">Selected labels</div><div class="v">Inbox, Sent, Important</div></div>
        <div class="tile"><div class="k">Privacy</div><div class="v">Personal only</div></div>
        <div class="tile"><div class="k">From</div><div class="v">Jan 1, 2025</div></div>
        <div class="tile"><div class="k">Estimated messages</div><div class="v">184</div></div>
      </div>
      <div class="divider actions" data-reveal><span class="link" style="color:var(--muted)">Back</span>
        <button class="btn btn-accent" id="start">Start Gmail Sync</button></div>
    </div>`;

  // 7 — done
  const s7 = `
    <div class="np">
      <div class="banner" data-reveal>${CKC} Synced 184 emails into private memory.</div>
      <div class="card" data-reveal style="margin-top:16px">
        <div class="row">${tile(GMAIL)}
          <div class="grow"><div class="itg-name">Gmail</div>
            <div class="itg-meta">Personal · read-only · last synced just now</div></div>
          <span class="badge on">${CKC} Connected</span></div>
        <div class="chips" data-reveal><span class="chip">Inbox</span><span class="chip">Sent</span><span class="chip">Important</span></div>
        <div class="desc" data-reveal>Your selected emails are now private, searchable memory — never shared with your team or agents unless you allow it.</div>
      </div>
    </div>`;

  window.NEURON_VIDEO = {
    eyebrow: 'Integrations · Step-by-step',
    scenes: [
      { dur: 3.6, headline, step: 1, steps: 4, stepLabel: 'Open Gmail setup',
        caption: 'Open Integrations and click Set up on the Gmail card.',
        chrome: { url: 'app.neuron.so/dashboard/integrations' }, body: s1,
        cursor: { to: '#setup', appearAt: 1.4, click: 2.7 } },
      { dur: 3.5, headline, step: 1, steps: 4, stepLabel: 'Read-only access',
        caption: 'Gmail is personal by default. Click Connect Gmail — Neuron asks for read-only access.',
        chrome: { url: 'app.neuron.so/dashboard/integrations' }, body: s2,
        cursor: { to: '#connect', appearAt: 1.5, click: 2.7 } },
      { dur: 3.6, headline, step: 1, steps: 4, stepLabel: 'Sign in with Google',
        caption: 'Pick your Google account and click Allow. Neuron never sends email.',
        chrome: { url: 'accounts.google.com/o/oauth2' }, body: s3,
        cursor: { to: '#allow', appearAt: 1.5, click: 2.8 } },
      { dur: 3.7, headline, step: 2, steps: 4, stepLabel: 'Choose labels',
        caption: 'Choose which labels Neuron may read. Inbox and Sent are on by default.',
        chrome: { url: 'app.neuron.so/dashboard/integrations?connected=gmail' }, body: s4,
        cursor: { to: '#next', appearAt: 2.0, click: 3.0 } },
      { dur: 3.4, headline, step: 3, steps: 4, stepLabel: 'Set filters',
        caption: 'Narrow it down — set a start date, sender filters, and a message cap.',
        chrome: { url: 'app.neuron.so/dashboard/integrations' }, body: s5,
        cursor: { to: '#review', appearAt: 1.8, click: 2.8 } },
      { dur: 3.6, headline, step: 4, steps: 4, stepLabel: 'Review & sync',
        caption: 'Review your choices, then click Start Gmail Sync.',
        chrome: { url: 'app.neuron.so/dashboard/integrations' }, body: s6,
        cursor: { to: '#start', appearAt: 1.8, click: 2.9 } },
      { dur: 3.6, headline, step: 4, steps: 4, stepLabel: 'Done',
        caption: 'Done. Your emails become private memory — yours alone, never shared by default.',
        chrome: { url: 'app.neuron.so/dashboard/integrations' }, body: s7 },
    ],
  };
})();
