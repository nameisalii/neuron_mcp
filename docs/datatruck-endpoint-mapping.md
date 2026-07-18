# Datatruck endpoint mapping

Neuron syncs Datatruck through configured OpenAPI paths. Confirmed defaults are safe to call automatically. Other Datatruck modules are shown as not available via the current API until an endpoint is confirmed through official docs or a successful authenticated test.

## Confirmed endpoints

| Module | Endpoint |
| --- | --- |
| Loads | `/orders/` |
| Dispatcher board | `/orders/dispatcher-board/list/` |
| Drivers | `/drivers/list/` |
| Trucks | `/trucks/list/` |
| Trailers | `/trailers/list/` |
| Work orders | `/work-orders/` |

## Not available via current API

These modules need confirmed paths before Neuron can sync them: live loads, my loads, LTL trips, loadboard, planning board, invoices, bills, payroll, dispatchers, vendors, charges, transactions, customers, safety tasks, compliance, inspections, fleet board, inventory, fleet issues, users, reports, fuel, toll, money code, cash advance, scale, and mailbox.

## Discover endpoints with Datatruck docs

1. Open the Datatruck API documentation for the customer account.
2. Find the module resource path.
3. Confirm the path is under the same OpenAPI base, usually `/api/v1/openapi`.
4. Add only the path after the OpenAPI base to Neuron.
5. Test it with `/api/integrations/datatruck/debug-shape?path=/confirmed/path/` in development.

## Discover endpoints with browser DevTools

1. Open the Datatruck page for the module you want to evaluate.
2. Open Chrome DevTools -> Network.
3. Refresh the page.
4. Filter XHR/fetch.
5. Find the API request path.
6. Copy the path after `/api/v1/openapi` if applicable.
7. Add it to Neuron endpoint mapping.
8. Test with `debug-shape`.

Never copy or share the Datatruck API token. Do not paste Authorization headers into tickets, docs, logs, or screenshots.

## Environment variables

Confirmed endpoints can be overridden:

```env
DATATRUCK_LOADS_ENDPOINT=/orders/
DATATRUCK_DRIVERS_ENDPOINT=/drivers/list/
DATATRUCK_TRUCKS_ENDPOINT=/trucks/list/
DATATRUCK_TRAILERS_ENDPOINT=/trailers/list/
DATATRUCK_WORK_ORDERS_ENDPOINT=/work-orders/
DATATRUCK_DISPATCHER_BOARD_ENDPOINT=/orders/dispatcher-board/list/
```

Optional endpoints sync only when configured:

```env
DATATRUCK_INVOICES_ENDPOINT=
DATATRUCK_CUSTOMERS_ENDPOINT=
DATATRUCK_FUEL_ENDPOINT=
```

## UI mapping

Open Datatruck Overview -> Advanced endpoint mapping. Add paths only after they are confirmed in official docs or by a successful authenticated test.

Example format:

```text
/confirmed/path/
```

Mappings are stored in `ApiConnector.metadata.endpointMapping`. Sync priority is:

1. Connector metadata endpoint mapping
2. Environment variables
3. Confirmed defaults

Unknown optional endpoints remain not available via the current API and are not fetched.
