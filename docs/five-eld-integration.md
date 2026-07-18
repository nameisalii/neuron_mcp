# Five ELD integration

Five ELD is a workspace-scoped Truck integration for live GPS, drivers, unit assignments, VIN lookup, active units, stale-GPS detection, and bounded route history. The upstream read service is the official TT ELD API at `https://read.tteld.com`.

## Credentials and setup

Each customer enters their own Company ID, USDOT number, API key, and—only when their account requires it—provider token in **Integrations → Truck → Five ELD**. In the Five ELD dashboard at `https://dash.fiveeld.com`, open **More → API Keys**, add a key named `Neuron`, copy it, then copy the Company ID shown under the company name and enter the fleet USDOT number. Test the connection before saving.

Company ID and USDOT are stored in connector metadata. The API key and optional provider token are encrypted together using Neuron's existing credential encryption and scoped to the workspace. Saved secrets are never returned to the browser or written to logs. Local-only fallback variables are documented in `.env.example`; production customers should use the UI.

## API and sync behavior

Neuron uses the fixed read host and these documented endpoints:

- `GET /api/v2/units-by-usdot/:usdot`
- `GET /api/externalservice/tracking-by-vin/:usdot/:vin`
- `GET /api/externalservice/current-units/:usdot`
- `GET /api/externalservice/drivers-list/:usdot`
- `GET /api/externalservice/trackings/:usdot/:vehicleId`
- `GET /api/externalservice/active-units/:usdot`

Requests have bounded retries, timeout and response-size limits, shape validation, capped pagination, and no retry for 401/403. The `x-api-key` header is always server-side; `provider-token` is sent only when supplied.

Sync imports live units, drivers, current assignments, and units active during the last 72 hours. Knowledge items use stable `fiveeld:*` external IDs, content hashes, and upserts so repeated syncs skip unchanged records. A partial endpoint failure does not discard successful modules.

## Live questions

Five ELD, TT ELD, ELD, truck GPS/location, driver location, and fleet location aliases route current-location questions to the live API before RAG. Driver questions map a current assignment to a VIN. Answers include available truck, driver, VIN, coordinates, speed, heading, odometer, timestamp, and a stale warning after 30 minutes. They cite **Live Five ELD API** and do not invent an address, fuel level, destination, or other unavailable fields.

Example questions:

- Where is driver John right now?
- Where is truck 554322?
- Where is VIN 4V4NC9EJ0PN613787?
- Which trucks are moving?
- Which trucks have stale GPS?
- What was truck 554322's route today?

## Limitations

- Live coordinates may not include a street address.
- Rotation describes direction of movement, not the final destination.
- Fuel level and destination are unavailable unless the official API adds them.
- Route history requires the vehicle ID and a bounded date range.
- Historical active-unit requests support at most 72 hours.
