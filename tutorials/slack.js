/* Tutorial: Connect Slack to Neuron — incl. adding Neuron to channels with
   /invite @Neuron, then syncing. */
(() => {
  const SLACK = `<svg viewBox="0 0 122.8 122.8"><path d="M25.8 77.6a12.9 12.9 0 11-12.9-12.9h12.9z" fill="#E01E5A"/><path d="M32.3 77.6a12.9 12.9 0 1125.8 0v32.3a12.9 12.9 0 11-25.8 0z" fill="#E01E5A"/><path d="M45.2 25.8a12.9 12.9 0 1112.9-12.9v12.9z" fill="#36C5F0"/><path d="M45.2 32.3a12.9 12.9 0 110 25.8H12.9a12.9 12.9 0 110-25.8z" fill="#36C5F0"/><path d="M97 45.2a12.9 12.9 0 1112.9 12.9H97z" fill="#2EB67D"/><path d="M90.5 45.2a12.9 12.9 0 11-25.8 0V12.9a12.9 12.9 0 1125.8 0z" fill="#2EB67D"/><path d="M77.6 97a12.9 12.9 0 11-12.9 12.9V97z" fill="#ECB22E"/><path d="M77.6 90.5a12.9 12.9 0 110-25.8h32.3a12.9 12.9 0 110 25.8z" fill="#ECB22E"/></svg>`;
  const CK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
  const CKC = `<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1.2 14.2l-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4z"/></svg>`;
  const tile = (svg) => `<div class="brand-tile">${svg}</div>`;
  const headline = ['Bring ', { hi: 'Slack' }, ' into Neuron.'];
  const STEPS = 5;

  // ---- Slack workspace mock -------------------------------------------------
  const chRow = (name, active, id) =>
    `<div class="sk-ch ${active ? 'active' : ''}"${id ? ` id="${id}"` : ''}><span class="hsh">#</span>${name}</div>`;
  const sidebar = (activeGeneral) => `<div class="sk-side">
    <div class="sk-wsname">Acme HQ ▾</div>
    <div class="sk-sec">Channels</div>
    ${chRow('general', activeGeneral, 'ch-general')}
    ${chRow('engineering', !activeGeneral)}
    ${chRow('product', false)}
    ${chRow('design', false)}
    ${chRow('ops', false)}
  </div>`;
  const msg = (color, name, time, text) => `<div class="sk-msg" data-reveal>
    <div class="sk-av" style="background:${color}"></div>
    <div class="sk-mb"><div class="nm">${name}<span>${time}</span></div><div class="tx">${text}</div></div></div>`;
  const GENERAL_MSGS = `
    ${msg('#e8912d', 'Marie', '10:02 AM', 'Shipping the new pricing page today 🚀')}
    ${msg('#5b8def', 'Diego', '10:05 AM', 'Reminder: our refund window is 14 days, no questions asked.')}`;
  const composer = (inner) => `<div class="sk-compose">${inner}</div>`;
  const slackUi = (activeGeneral, title, msgsHtml, footHtml) => `<div class="slackui">
    ${sidebar(activeGeneral)}
    <div class="sk-main">
      <div class="sk-top" data-reveal><span class="hsh">#</span>${title}</div>
      <div class="sk-msgs">${msgsHtml}</div>
      ${footHtml}
    </div></div>`;

  // ---- Scenes ---------------------------------------------------------------
  // 1 — Neuron integrations page
  const s1 = `<div class="np">
    <div class="np-h" data-reveal><div><div class="np-title">Integrations</div>
      <div class="np-sub">Connect your tools so Neuron can capture your team's knowledge.</div></div></div>
    <div class="card" data-reveal style="margin-top:18px">
      <div class="row">${tile(SLACK)}<div class="grow"><div class="itg-name">Slack</div>
        <div class="itg-meta">Connect your Slack workspace</div></div>
        <span class="badge off">Not connected</span></div>
      <div class="desc" data-reveal>Neuron reads messages in the channels you choose and extracts rules, decisions, and ideas automatically.</div>
      <div class="divider actions" data-reveal><span></span>
        <button class="btn btn-primary" id="connect">Connect</button></div>
    </div></div>`;

  // 2 — Slack OAuth consent
  const s2 = `<div class="oauth">
    <div class="oauth-card dark" data-reveal>
      <div class="oauth-logo" style="background:#fff">${SLACK}</div>
      <div class="oauth-h" data-reveal>Neuron is requesting permission<br/>to access the Acme HQ workspace</div>
      <div class="oauth-acct" data-reveal style="margin-top:12px;color:#a9aebc">
        <span class="av" style="background:#611f69">A</span> Acme HQ · slack.com</div>
      <div class="oauth-perm" data-reveal>
        <div class="pr">${CK}<span>View messages &amp; content in channels Neuron is added to</span></div>
        <div class="pr">${CK}<span>View basic information about channels</span></div>
        <div class="pr">${CK}<span>View people in the workspace</span></div></div>
      <div class="oauth-btns" data-reveal>
        <button class="btn btn-ghost" style="background:transparent;color:#a9aebc;border-color:#3a3e4c">Cancel</button>
        <button class="btn" id="allow" style="background:#611f69;color:#fff">Allow</button></div>
    </div></div>`;

  // 3 — connected; explains the next step (add Neuron to channels)
  const s3 = `<div class="np">
    <div class="banner" data-reveal>${CKC} Slack connected to Acme HQ.</div>
    <div class="card" data-reveal style="margin-top:14px">
      <div class="row">${tile(SLACK)}<div class="grow"><div class="itg-name">Slack</div>
        <div class="itg-meta">One step left — add Neuron to your channels</div></div>
        <span class="badge on">${CKC} Connected</span></div>
      <div class="desc" data-reveal>Neuron only reads channels it has been added to. Open Slack and invite Neuron to each channel you want it to read 👇</div>
    </div></div>`;

  // 4 — Open Slack
  const s4 = slackUi(false, 'engineering', GENERAL_MSGS.replace('Marie', 'Priya').replace('Diego', 'Sam'),
    composer(`<span class="ph">Message #engineering</span>`));

  // 5 — go to the channel you want Neuron to read (#general)
  const s5 = slackUi(true, 'general', GENERAL_MSGS, composer(`<span class="ph">Message #general</span>`));

  // 6 — type /invite @Neuron
  const slashPopover = `<div class="sk-slash" data-reveal><div class="hd">SLACK COMMANDS</div>
    <div class="it hot"><span class="cmd">/invite</span><span class="ds">Add someone to this channel</span></div></div>`;
  const s6 = slackUi(true, 'general', GENERAL_MSGS,
    `${slashPopover}${composer(`<span class="cmd">/invite </span><span class="mention">@Neuron</span><span class="caret"></span>`)}`);

  // 7 — Neuron joined the channel
  const s7 = slackUi(true, 'general',
    `${GENERAL_MSGS}<div class="sk-sys" data-reveal>${CKC} Neuron was added to #general by you.</div>`,
    composer(`<span class="ph">Message #general</span>`));

  // 8 — back in Neuron, Sync Now
  const s8 = `<div class="np">
    <div class="banner" data-reveal>${CKC} Neuron added to 5 channels.</div>
    <div class="card" data-reveal style="margin-top:14px">
      <div class="row">${tile(SLACK)}<div class="grow"><div class="itg-name">Slack</div>
        <div class="itg-meta">Connected to Acme HQ</div></div>
        <span class="badge on">${CKC} Connected</span></div>
      <div class="chips" data-reveal>
        <span class="chip">#general</span><span class="chip">#engineering</span>
        <span class="chip">#product</span><span class="chip">#design</span><span class="chip">#ops</span></div>
      <div class="divider actions" data-reveal><span class="link">View Slack knowledge</span>
        <button class="btn btn-accent" id="sync">Sync Now</button></div>
    </div></div>`;

  // 9 — synced result
  const s9 = `<div class="np">
    <div class="banner" data-reveal>${CKC} Synced 142 messages from 5 channels.</div>
    <div class="card" data-reveal style="margin-top:14px">
      <div class="row">${tile(SLACK)}<div class="grow"><div class="itg-name">Slack</div>
        <div class="itg-meta">Connected to Acme HQ · last synced just now</div></div>
        <span class="badge on">${CKC} Connected</span></div>
      <div class="tiles" data-reveal>
        <div class="tile"><div class="k">Messages</div><div class="v">142</div></div>
        <div class="tile"><div class="k">Knowledge extracted</div><div class="v">23 items</div></div></div>
      <div class="desc" data-reveal>Decisions, processes, and ideas are now searchable across Neuron and your agents.</div>
    </div></div>`;

  const sc = (dur, step, stepLabel, caption, url, body, cursor) =>
    ({ dur, headline, step, steps: STEPS, stepLabel, caption, chrome: { url }, body, cursor });

  window.NEURON_VIDEO = {
    eyebrow: 'Integrations · Step-by-step',
    scenes: [
      sc(4.4, 1, 'Open Integrations', 'In Neuron, open Integrations, find the Slack card, and click Connect.',
        'app.neuron.so/dashboard/integrations', s1, { to: '#connect', appearAt: 1.9, click: 3.3 }),
      sc(4.6, 2, 'Authorize in Slack', 'Slack opens. Review what Neuron can read, then click Allow.',
        'slack.com/oauth/authorize', s2, { to: '#allow', appearAt: 2.1, click: 3.5 }),
      sc(4.2, 3, 'Add Neuron in Slack', 'You are connected. Neuron only reads channels it is added to — here is how.',
        'app.neuron.so/dashboard/integrations?success=slack', s3),
      sc(3.8, 3, 'Open Slack', 'Open Slack.',
        'app.slack.com/client/acme', s4),
      sc(4.2, 3, 'Go to the channel', '1. Go to the channel you want Neuron to read.',
        'app.slack.com/client/acme/general', s5, { to: '#ch-general', appearAt: 1.7, click: 3.1 }),
      sc(5.2, 3, 'Type /invite @Neuron', '2. In the message box, type  /invite @Neuron  and press Enter.',
        'app.slack.com/client/acme/general', s6),
      sc(4.2, 3, 'Neuron joins', 'Neuron joins the channel. Repeat for any channel you want it to read.',
        'app.slack.com/client/acme/general', s7),
      sc(4.4, 4, 'Back in Neuron', 'Back in Neuron, click Sync Now to import messages from those channels.',
        'app.neuron.so/dashboard/integrations', s8, { to: '#sync', appearAt: 1.9, click: 3.3 }),
      sc(4.4, 5, 'Done', 'That’s it. Neuron keeps Slack in sync and feeds verified context to your agents.',
        'app.neuron.so/dashboard/integrations', s9),
    ],
  };
})();
