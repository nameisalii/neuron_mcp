/* Tutorial: Connect Slack to Neuron */
(() => {
  const SLACK = `<svg viewBox="0 0 122.8 122.8"><path d="M25.8 77.6a12.9 12.9 0 11-12.9-12.9h12.9z" fill="#E01E5A"/><path d="M32.3 77.6a12.9 12.9 0 1125.8 0v32.3a12.9 12.9 0 11-25.8 0z" fill="#E01E5A"/><path d="M45.2 25.8a12.9 12.9 0 1112.9-12.9v12.9z" fill="#36C5F0"/><path d="M45.2 32.3a12.9 12.9 0 110 25.8H12.9a12.9 12.9 0 110-25.8z" fill="#36C5F0"/><path d="M97 45.2a12.9 12.9 0 1112.9 12.9H97z" fill="#2EB67D"/><path d="M90.5 45.2a12.9 12.9 0 11-25.8 0V12.9a12.9 12.9 0 1125.8 0z" fill="#2EB67D"/><path d="M77.6 97a12.9 12.9 0 11-12.9 12.9V97z" fill="#ECB22E"/><path d="M77.6 90.5a12.9 12.9 0 110-25.8h32.3a12.9 12.9 0 110 25.8z" fill="#ECB22E"/></svg>`;
  const CK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
  const CKC = `<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1.2 14.2l-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4z"/></svg>`;
  const tile = (svg) => `<div class="brand-tile">${svg}</div>`;

  const headline = ['Connect ', { hi: 'Slack' }, ' in one click.'];

  // Scene 1 — Neuron integrations page, Slack not connected
  const s1 = `
    <div class="np">
      <div class="np-h" data-reveal>
        <div><div class="np-title">Integrations</div>
        <div class="np-sub">Connect your tools so Neuron can capture your team's knowledge.</div></div>
      </div>
      <div class="card" data-reveal style="margin-top:18px">
        <div class="row">
          ${tile(SLACK)}
          <div class="grow">
            <div class="itg-name">Slack</div>
            <div class="itg-meta">Connect your Slack workspace</div>
          </div>
          <span class="badge off">Not connected</span>
        </div>
        <div class="desc" data-reveal>Neuron reads your Slack messages and extracts rules, decisions, processes, and ideas automatically.</div>
        <div class="divider actions" data-reveal>
          <span></span>
          <button class="btn btn-primary" id="connect">Connect</button>
        </div>
      </div>
    </div>`;

  // Scene 2 — Slack OAuth consent
  const s2 = `
    <div class="oauth">
      <div class="oauth-card dark" data-reveal>
        <div class="oauth-logo" style="background:#fff">${SLACK}</div>
        <div class="oauth-h" data-reveal>Neuron is requesting permission<br/>to access the Acme workspace</div>
        <div class="oauth-acct" data-reveal style="margin-top:12px;color:#a9aebc">
          <span class="av" style="background:#611f69">A</span> Acme HQ · slack.com
        </div>
        <div class="oauth-perm" data-reveal>
          <div class="pr">${CK}<span>View messages &amp; content in channels Neuron is added to</span></div>
          <div class="pr">${CK}<span>View basic information about channels</span></div>
          <div class="pr">${CK}<span>View people in the workspace</span></div>
        </div>
        <div class="oauth-btns" data-reveal>
          <button class="btn btn-ghost" style="background:transparent;color:#a9aebc;border-color:#3a3e4c">Cancel</button>
          <button class="btn" id="allow" style="background:#611f69;color:#fff">Allow</button>
        </div>
      </div>
    </div>`;

  // Scene 3 — back in Neuron, connected, ready to sync
  const s3 = `
    <div class="np">
      <div class="banner" data-reveal>${CKC} Slack connected successfully.</div>
      <div class="card" data-reveal style="margin-top:16px">
        <div class="row">
          ${tile(SLACK)}
          <div class="grow">
            <div class="itg-name">Slack</div>
            <div class="itg-meta">Connected to Acme HQ</div>
          </div>
          <span class="badge on">${CKC} Connected</span>
        </div>
        <div class="chips" data-reveal>
          <span class="chip">#general</span><span class="chip">#engineering</span>
          <span class="chip">#product</span><span class="chip">#design</span><span class="chip">#ops</span>
        </div>
        <div class="divider actions" data-reveal>
          <span class="link">View Slack knowledge</span>
          <button class="btn btn-accent" id="sync">Sync Now</button>
        </div>
      </div>
    </div>`;

  // Scene 4 — synced result
  const s4 = `
    <div class="np">
      <div class="banner" data-reveal>${CKC} Synced 142 messages from 5 channels.</div>
      <div class="card" data-reveal style="margin-top:16px">
        <div class="row">
          ${tile(SLACK)}
          <div class="grow">
            <div class="itg-name">Slack</div>
            <div class="itg-meta">Connected to Acme HQ · last synced just now</div>
          </div>
          <span class="badge on">${CKC} Connected</span>
        </div>
        <div class="tiles" data-reveal>
          <div class="tile"><div class="k">Messages</div><div class="v">142</div></div>
          <div class="tile"><div class="k">Knowledge extracted</div><div class="v">23 items</div></div>
        </div>
        <div class="desc" data-reveal>Decisions, processes, and ideas are now searchable across Neuron and your agents.</div>
      </div>
    </div>`;

  window.NEURON_VIDEO = {
    eyebrow: 'Integrations · Step-by-step',
    scenes: [
      { dur: 3.8, headline, step: 1, steps: 4, stepLabel: 'Open Integrations',
        caption: 'In Neuron, open Integrations and find the Slack card. Click Connect.',
        chrome: { url: 'app.neuron.so/dashboard/integrations' }, body: s1,
        cursor: { to: '#connect', appearAt: 1.4, click: 2.9 } },
      { dur: 3.7, headline, step: 2, steps: 4, stepLabel: 'Authorize in Slack',
        caption: 'Slack opens. Review what Neuron can read, then click Allow.',
        chrome: { url: 'slack.com/oauth/authorize' }, body: s2,
        cursor: { to: '#allow', appearAt: 1.5, click: 2.8 } },
      { dur: 3.7, headline, step: 3, steps: 4, stepLabel: 'Back in Neuron',
        caption: 'You are back in Neuron and connected. Click Sync Now to import messages.',
        chrome: { url: 'app.neuron.so/dashboard/integrations?success=slack' }, body: s3,
        cursor: { to: '#sync', appearAt: 1.6, click: 2.9 } },
      { dur: 3.6, headline, step: 4, steps: 4, stepLabel: 'Done',
        caption: 'That’s it. Neuron keeps Slack in sync and feeds verified context to your agents.',
        chrome: { url: 'app.neuron.so/dashboard/integrations' }, body: s4 },
    ],
  };
})();
