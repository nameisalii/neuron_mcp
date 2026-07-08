# Agent Architecture

This is a foundation note only. The current platform should keep routing through existing query and sync paths until the agent registry is implemented.

## Agent Registry

The registry maps an agent key to capabilities, allowed sources, required permissions, and audit behavior.

- `text2rag`: turns source text into searchable RAG memory and KnowledgeItem records.
- `text2image_file_image`: processes files, images, PDFs, screenshots, and extracted text into DocumentAttachment records and searchable memory.
- `calculation`: extracts structured numbers and calculates metrics such as revenue per employee, load profitability, invoice totals, and margin.

## Tool Routing

- Route by intent, source permissions, and required output type.
- Prefer deterministic tools for retrieval, parsing, and calculations.
- Use model calls for classification, summarization, and ambiguous extraction only after source data is selected.
- Agents should return structured outputs with source references, document references, and confidence metadata.

## Source Permissions

- Every tool call receives workspaceId and userId.
- Personal sources such as Gmail must remain private unless explicitly shared.
- Agents cannot read documents, conversations, or integrations outside the active workspace.
- Connector credentials remain server-side and are never returned to agent-visible client payloads.

## Audit Logs

- Record agent key, userId, workspaceId, conversationId, source IDs, document IDs, and tool names.
- Store safe metadata only. Never log raw API keys, OAuth tokens, or document contents beyond approved snippets.
- Activity events should link to conversation, document, source, load, or integration when available.

## Calculation Accuracy

- Calculation answers must show formula, source data, and units.
- The calculation agent should separate extraction from math so source values can be reviewed.
- Use decimal-safe arithmetic for currency, percentages, invoices, and load profitability.
- If required values are missing or contradictory, return the gap instead of guessing.
