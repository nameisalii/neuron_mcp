/* Tutorial: Connect Linear to Neuron */
(() => {
  const LINEAR = `<svg viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#5E6AD2"/><g stroke="#fff" stroke-width="5.5" stroke-linecap="round" opacity=".95"><path d="M20 58 L58 20"/><path d="M28 70 L70 28"/><path d="M38 78 L78 38"/></g></svg>`;
  const CK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
  const CKC = `<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1.2 14.2l-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4z"/></svg>`;
  const tile = (svg) => `<div class="brand-tile">${svg}</div>`;
  const headline = ['Sync ', { hi: 'Linear' }, ' into your brain.'];

  const s1 = `
    <div class="np">
      <div class="np-h" data-reveal>
        <div><div class="np-title">Integrations</div>
        <div class="np-sub">Connect your tools so Neuron can capture your team's knowledge.</div></div>
      </div>
      <div class="card" data-reveal style="margin-top:18px">
        <div class="row">
          ${tile(LINEAR)}
          <div class="grow">
            <div class="itg-name">Linear</div>
            <div class="itg-meta">Sync issues from your Linear workspace</div>
          </div>
          <span class="badge off">Not connected</span>
        </div>
        <div class="desc" data-reveal>Neuron reads Linear issues, comments, projects, and status changes and classifies them for semantic search.</div>
        <div class="divider actions" data-reveal>
          <span></span>
          <button class="btn btn-primary" id="connect">Connect</button>
        </div>
      </div>
    </div>`;

  const s2 = `
    <div class="oauth">
      <div class="oauth-card" data-reveal>
        <div class="oauth-logo" style="background:#5E6AD2">${LINEAR}</div>
        <div class="oauth-h" data-reveal>Authorize Neuron</div>
        <div class="oauth-p" data-reveal>Neuron wants to access your Linear workspace <b>Acme</b>.</div>
        <div class="oauth-perm" data-reveal>
          <div class="pr">${CK}<span>Read issues, comments &amp; sub-issues</span></div>
          <div class="pr">${CK}<span>Read projects, teams &amp; statuses</span></div>
          <div class="pr">${CK}<span>Receive issue update webhooks</span></div>
        </div>
        <div class="oauth-btns" data-reveal>
          <button class="btn btn-ghost">Cancel</button>
          <button class="btn" id="allow" style="background:#5E6AD2;color:#fff">Authorize</button>
        </div>
      </div>
    </div>`;

  const s3 = `
    <div class="np">
      <div class="banner" data-reveal>${CKC} Linear connected successfully.</div>
      <div class="card" data-reveal style="margin-top:16px">
        <div class="row">
          ${tile(LINEAR)}
          <div class="grow">
            <div class="itg-name">Linear</div>
            <div class="itg-meta">Connected — issues synced to knowledge base</div>
          </div>
          <span class="badge on">${CKC} Connected</span>
        </div>
        <div class="tiles" data-reveal>
          <div class="tile"><div class="k">Connected</div><div class="v">Today</div></div>
          <div class="tile"><div class="k">Last synced</div><div class="v">Never</div></div>
        </div>
        <div class="divider actions" data-reveal>
          <span class="link">View Linear knowledge</span>
          <button class="btn btn-accent" id="sync">Sync Now</button>
        </div>
      </div>
    </div>`;

  const s4 = `
    <div class="np">
      <div class="banner" data-reveal>${CKC} Synced 87 issues across 4 teams.</div>
      <div class="card" data-reveal style="margin-top:16px">
        <div class="row">
          ${tile(LINEAR)}
          <div class="grow">
            <div class="itg-name">Linear</div>
            <div class="itg-meta">Connected · last synced just now</div>
          </div>
          <span class="badge on">${CKC} Connected</span>
        </div>
        <div class="tiles" data-reveal>
          <div class="tile"><div class="k">Issues</div><div class="v">87</div></div>
          <div class="tile"><div class="k">Knowledge extracted</div><div class="v">41 items</div></div>
        </div>
        <div class="desc" data-reveal>Decisions and project context from Linear are now searchable — and stay fresh on every update.</div>
      </div>
    </div>`;

  window.NEURON_VIDEO = {
    eyebrow: 'Integrations · Step-by-step',
    scenes: [
      { dur: 3.8, headline, step: 1, steps: 4, stepLabel: 'Open Integrations',
        caption: 'In Neuron, open Integrations and find the Linear card. Click Connect.',
        chrome: { url: 'app.neuron.so/dashboard/integrations' }, body: s1,
        cursor: { to: '#connect', appearAt: 1.4, click: 2.9 } },
      { dur: 3.7, headline, step: 2, steps: 4, stepLabel: 'Authorize in Linear',
        caption: 'Linear opens. Review the access Neuron needs, then click Authorize.',
        chrome: { url: 'linear.app/oauth/authorize' }, body: s2,
        cursor: { to: '#allow', appearAt: 1.5, click: 2.8 } },
      { dur: 3.7, headline, step: 3, steps: 4, stepLabel: 'Back in Neuron',
        caption: 'Back in Neuron and connected. Click Sync Now to import your issues.',
        chrome: { url: 'app.neuron.so/dashboard/integrations?connected=linear' }, body: s3,
        cursor: { to: '#sync', appearAt: 1.6, click: 2.9 } },
      { dur: 3.6, headline, step: 4, steps: 4, stepLabel: 'Done',
        caption: 'Done. Neuron re-syncs automatically as issues change, so context never goes stale.',
        chrome: { url: 'app.neuron.so/dashboard/integrations' }, body: s4 },
    ],
  };
})();
