# Capabilities and limits

## Designer

| Feature | What is implemented |
| --- | --- |
| Elements | Text, rectangles, ellipses, horizontal lines, images, Code 128 barcodes, QR codes |
| Layout | Drag to move, corner to resize, numerical X/Y and dimensions, rotation, layer order |
| Text | Font family and size, bold, italic, left/center/right alignment, line breaks, automatic word wrapping |
| Shapes | Fill and stroke controls |
| Images | PNG, JPEG, WebP; embedded in designs; contain/cover/stretch; source crop percentages |
| PDFs | Select one page, render locally, choose fit mode, then adjust image crop/placement |
| Templates | Product, 4 × 6 shipping layout, compact address, inventory with QR |
| Custom dimensions | Width 10–104 mm; height 10–991 mm, subject to the raster pixel limit |
| Thermal preview | Black threshold and optional dithering |
| Editing | Undo, redo, duplicate, delete, keyboard movement, grid background, zoom |
| Shortcuts | Ctrl+S save, Ctrl+Z undo, Ctrl+Y redo, Ctrl+D duplicate, Delete/Backspace remove, arrow keys move, Shift+Arrow larger move |

Colors in artwork are converted to monochrome for printing. This is a direct thermal label printer, not a color printer.

## Storage and exports

- Local autosave and manually triggered saves.
- Saved label library with open/copy/delete.
- PNG preview export, printer-ready ZPL export, and editable JSON export/import.
- Print history with job name, printer, copies, timestamp, submission result, and errors.
- User data lives outside the packaged runtime in `data/` and is ignored by Git.

## Printing and batches

- Direct USB discovery for Zebra vendor `0A5F`, using Microsoft's Windows USB printer class driver.
- Optional RAW printing through an installed Windows printer queue.
- Graphics rasterization at 203 dpi, with byte-packed monochrome images encoded as ZPL.
- All label text is rendered as pixels; embedded text cannot become executable ZPL commands.
- Up to 100 copies per print job.
- `{{name}}`-style variables in text, barcode, and QR fields.
- CSV batch printing: header names map to variables, one label per row, up to 100 rows. Expanded labels are checked before submissions begin.
- Printer diagnostics: IEEE 1284 identity, USB port status, `~HS` status, `~HI` firmware/model information, and `^HH` configuration readback. An explicit native-test option sends one fixed text-only diagnostic label.

USB success means bytes were delivered; spooler success means Windows accepted a job. Neither is an optical confirmation of printing. A timed-out or failed operation can partially print, so check before retrying.

## MCP tools

| Tool | Capability |
| --- | --- |
| `studio_status` | App version, selected printer, local storage and driver state |
| `list_printers` | Installed queues and connected Zebra USB interfaces |
| `printer_diagnostics` | Read hardware/ZPL status and configuration; optionally print one native test |
| `list_templates` | Return editable starter designs |
| `list_designs` | List saved labels |
| `get_design` | Read full editable JSON |
| `save_design` | Create or update a design |
| `open_design` | Show a design in the desktop editor |
| `import_image` | Read a local PNG/JPEG/WebP as an embedded data URL |
| `import_pdf` | Render one local PDF page into an image element |
| `preview_label` | Return a monochrome PNG plus dimensions and layout warnings |
| `export_zpl` | Generate printer-ready commands without printing |
| `print_label` | Submit a saved or supplied design to the physical printer |
| `print_history` | Read recent submissions and errors |

`preview_label`, `export_zpl`, and `print_label` accept either a saved `id` or an inline `design`, plus optional `variables`, threshold, and dithering settings. Printing also accepts a bounded copy count and printer name. The assistant should print only when the user requests printing.

The server supports legacy MCP initialization with protocol revisions through `2025-11-25`. It does not implement a public remote MCP endpoint, cloud hosting, OAuth, or the newer sessionless MCP discovery model. Use a local client supporting stdio and the advertised protocol.

### Example editable design

```json
{
  "name": "Product label",
  "widthMm": 101.6,
  "heightMm": 76.2,
  "objects": [
    {"id":"title","type":"text","x":6,"y":6,"w":88,"h":12,"fontSize":6,"bold":true,"text":"{{product}}"},
    {"id":"sku","type":"barcode","x":6,"y":28,"w":65,"h":22,"text":"123456789012","showText":true},
    {"id":"qr","type":"qrcode","x":73,"y":28,"w":22,"h":22,"text":"https://example.com/product"}
  ]
}
```

## Current limits

| Limit | Current behavior |
| --- | --- |
| Platform | Windows desktop and Windows print APIs |
| Resolution | Fixed 203 dpi |
| Printable width | Maximum 104 mm |
| Raster work | Maximum 8 million pixels per design |
| Elements | Maximum 200 per design |
| Raster image inputs | Embedded PNG/JPEG/WebP; approximately 15 MB per image; decoded images limited to 25 megapixels |
| PDF via MCP | Maximum 20 MB; one page per import |
| File picker | Maximum 40 MB input file; downstream format limits still apply |
| Text | Up to 10,000 characters per text element |
| Barcode/QR content | Up to 2,000 characters; Code 128 input limited to printable ASCII; physical scan readability imposes practical size limits |
| Copies/batches | 100 copies per job; 100 CSV rows per batch |
| Printer support | ZP 505 physically tested; other Zebra USB devices can be discovered but were not validated |

Not implemented: general printing from every Windows application's print dialog, paid shipping/postage, carrier tracking/rates, firmware replacement, automatic PDF label detection/cropping, multi-page PDF batch import, an in-app AI chat/model, SVG import, remote/cloud MCP service, or automatic optical confirmation of a printed label.
