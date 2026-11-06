# Validation

Verified on Windows with a Zebra ZP 505 identifying itself as ZTC ZP 500 (ZPL).

## Physical printing

The user confirmed these outputs:

1. Native ZPL text-only diagnostic.
2. Small application-rendered label containing text and a solid black rectangle.
3. Full 4 × 6 graphics label, including border, barcode, and QR code.

The first graphics attempt produced no observed output. Its cause was not established; the three later tests passed. Barcode/QR scan decoding was not independently tested.

Readback confirmed responsive ZPL status, model/firmware information and configuration, with no pause, media-out, head-open or ribbon error. No firmware was changed.

## Software checks

- Six core tests: template bounds, invalid design/path rejection, raster packing/padding/alpha, ZPL graphic byte counts and offsets, literal variable substitution, deterministic dithering.
- Isolated UI tests: editing, undo/redo, duplication, saves, library, connection screen, PNG export, PDF import and worker rendering, CSV quoting and row mapping, print dialog. Physical print calls were mocked in these UI tests.
- Live app service: authenticated RPC, saved designs, PNG previews, PDF import, ZPL output and connected printer discovery.
- Packaged stdio MCP: initialization, discovery, save, variable substitution, preview image responses and errors.
- Final Windows desktop runtime launched successfully.
- Dependency audit reported zero known vulnerabilities at build time with Electron 45.2.3. This is a point-in-time audit, not a permanent guarantee.

Run the repository core checks with `npm test` from `source/`. Hardware validation requires a connected printer, suitable media and inspection of the physical output.
