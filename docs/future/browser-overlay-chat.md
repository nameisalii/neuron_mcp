# Browser Overlay Chat

This is an architecture note only. Do not build the overlay until authentication, billing, and source permission rules are finalized.

## Delivery Options

- Embed script: a workspace-scoped script tag loads a small chat launcher on approved domains. Best for owned websites and internal tools.
- Browser extension: captures user-approved page context across arbitrary sites and apps. Best for cross-website workflows.
- Native desktop later: can capture active window metadata when browser APIs are not enough.

## Authentication And Session

- Use short-lived signed session tokens tied to workspaceId, userId, domain, and allowed capabilities.
- Never put API keys or integration credentials in browser storage.
- The embed script should call Neuron APIs through a server-issued session, not through service credentials.
- Extension auth should use the same user identity provider as the dashboard and refresh tokens through a backend exchange.

## Context Capture

- Capture only explicit user-selected text by default.
- Allow page title, canonical URL, and visible URL as low-risk metadata.
- Require opt-in for DOM snippets, screenshots, form values, or file previews.
- Store captured context as ChatConversation.sourceContext and ChatMessage.metadata with sourceUrl when available.

## Privacy And Security

- Domain allowlists are required for embed script installation.
- Extension capture must show visible state when page context is attached.
- Sensitive fields should be redacted client-side where possible and server-side before persistence.
- Workspace isolation must be enforced on every chat, document, and analytics route.
- Audit logs should record context source, user, timestamp, and permissions used.

## User Flow

1. User opens the overlay on a website or extension context.
2. Neuron shows what context will be attached.
3. User asks a question.
4. Query storage creates or appends to a conversation with sourceContext.
5. Answers include source cards and document links behind collapsed controls.
