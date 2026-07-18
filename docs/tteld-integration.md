# TT ELD integration

TT ELD is a workspace-scoped Truck integration for live GPS lookups and searchable fleet knowledge.

## Capabilities

- Realtime tracking by USDOT
- Tracking by VIN, including speed, heading, and odometer when returned
- Current truck/driver/co-driver assignments
- Active drivers
- Historical route points
- Units active within the last 72 hours

## Credentials and setup

Each workspace supplies its USDOT number, `x-api-key`, and `provider-token` in the TT ELD setup form. Open the TT ELD dashboard, scroll to **More**, open **API Keys**, create or copy the API key, copy the provider token, and find the company USDOT number. Test the connection before saving, then run a sync.

Neuron stores the API key and provider token together in the encrypted `ApiConnector.encryptedCredential` field. USDOT and non-sensitive capability/count information are stored in connector metadata. Credentials are write-only in the browser after save and are never returned by status, sync, fleet, or query endpoints.

## Official endpoints used

- `GET https://read.tteld.com/api/v2/units-by-usdot/:usdot`
- `GET https://read.tteld.com/api/externalservice/tracking-by-vin/:usdot/:vin`
- `GET https://read.tteld.com/api/externalservice/current-units/:usdot`
- `GET https://read.tteld.com/api/externalservice/drivers-list/:usdot`
- `GET https://read.tteld.com/api/externalservice/trackings/:usdot/:vehicleId/`
- `GET https://read.tteld.com/api/externalservice/active-units/:usdot/`

Every request uses server-side `x-api-key` and `provider-token` headers. The client has a fixed base URL, timeout, bounded transient retry, response-size limit, strict JSON validation, bounded pagination, and a 72-hour maximum historical window.

## Sync behavior

Manual sync imports realtime units, current assignments, drivers, and units active during the last 72 hours. Stable external IDs and content hashes make synchronization idempotent. Changed records update in place, unchanged records are skipped, and user-overridden categories are preserved. Historical routes are fetched only for an explicit live route question, not for every truck during normal sync.

## Live queries

Questions mentioning TT ELD, ELD, GPS, VINs, truck/driver locations, moving trucks, stale GPS, or today's route use the live TT ELD API before RAG. Location answers cite **Live TT ELD API**, include coordinates and freshness, and never invent an address. Driver questions map the driver to a current assignment and then look up the assigned VIN.

Example questions:

- Where is truck 554322 right now?
- Where is driver John right now?
- Which trucks are currently moving?
- Which trucks have stale GPS?
- What was truck 554322's route today?
- Which driver is assigned to truck 123?
- Show TT ELD location for VIN X.
- Which trucks were active in the last 72 hours?

## Limitations

- A destination is not available from the documented API. Rotation is presented as heading, not destination.
- The realtime endpoint can return coordinates without a human-readable address.
- Route history requires the TT ELD vehicle ID and a bounded date range.
- Historical active-unit requests support at most 72 hours.
- An exact load amount or other dispatch/business fields are unavailable unless TT ELD documents another official endpoint.
- Fleet-wide moving status requires one VIN tracking lookup per current assignment and is capped to 100 units per live request.

## Security

- All connector reads and writes are filtered by the authenticated workspace ID.
- API credentials are encrypted at rest and never sent back to the browser after save.
- No arbitrary URLs are fetched; the only provider host is `read.tteld.com`.
- Errors are normalized and never include auth headers, credentials, or raw customer payloads.
