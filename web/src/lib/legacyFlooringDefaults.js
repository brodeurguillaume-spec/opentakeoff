// Archived starter catalog. NOT seeded in the generic AnvilTrace workflow.
// Kept unchanged for existing imports and a future explicit trade profile.
// See docs/LEGACY_TRADE_BEHAVIORS.md before re-enabling.
import { GROUT_DEFAULTS } from "./coverage.js";

// Flooring-first starter conditions seeded on a fresh workspace — line color +
// hatch chosen to read like the real finish; waste % is a sensible default you
// can change per condition (it's never auto-applied to the live readout, only
// the Report). Delete any you don't need.
// Each default also carries a couple of editable starter materials — quantities
// derive deterministically from measured area/linear ÷ a coverage rate you set
// (off the product data sheet). Delete/edit freely; they're just sensible seeds.
// Per-material-kind coverage presets (adhesive trowel notches, mortar trowels)
// and the grout-from-tile-geometry calculator live in lib/coverage.js —
// vendor-neutral, generic rates; always verify against the product data sheet.
// Expressed in TEMPLATE shape (finish_tag/waste_pct/materials, no fill — it
// defaults from color) so seeding and the Library run the same constructor.
export const FLOORING_DEFAULTS = [
  { finish_tag: "CPT-1", color: "#2f7d54", hatch: "speckle", waste_pct: 5,  materials: [{ name: "Adhesive", kind: "adhesive", per: 250, basis: "area", unit: "gal" }] },                  // Carpet tile
  { finish_tag: "BRD-1", color: "#be185d", hatch: "dots",    waste_pct: 10, materials: [{ name: "Adhesive", kind: "adhesive", per: 120, basis: "area", unit: "gal" }] },                  // Broadloom carpet (roll goods)
  { finish_tag: "LVT-1", color: "#b8860b", hatch: "plank",   waste_pct: 8,  materials: [{ name: "Adhesive", kind: "adhesive", per: 250, basis: "area", unit: "gal" }] },                  // Luxury vinyl plank/tile
  { finish_tag: "WD-1",  color: "#9a3412", hatch: "plank",   waste_pct: 10, materials: [                                                                                                  // Unfinished 2.25″ solid red oak — glue-down + site-finished
    { name: "Adhesive (wood, SMP)",     kind: "adhesive", per: 50,  basis: "area", unit: "gal", note: "1/4″×1/4″ V (wood)" },
    { name: "Sealer (primer coat)",     per: 400, basis: "area", unit: "gal", note: "1 prime coat (~10 m²/L)" },
    { name: "Polyurethane (2K finish)", per: 136, basis: "area", unit: "gal", note: "≈3 coats @ ~408 SF/gal/coat (2K 10:1)" },
  ] },
  { finish_tag: "VCT-1", color: "#2563eb", hatch: "checker", waste_pct: 5,  materials: [{ name: "Adhesive", kind: "adhesive", per: 350, basis: "area", unit: "gal" }] },                  // Vinyl composition tile
  { finish_tag: "SV-1",  color: "#0d9488", hatch: "solid",   waste_pct: 10, materials: [                                                                                                  // Sheet vinyl
    { name: "Adhesive", kind: "adhesive", per: 150, basis: "area", unit: "gal" },
    // Seam welding is figured off the ROLL LAYOUT, never off a share of the
    // perimeter: basis "seam_lf" is the length where two cuts meet on the
    // floor (lib/rollgoods.js seamLfBySrc). It reads 0 until the condition
    // carries a roll setup — which is the honest answer, since nothing has
    // decided yet how the sheet gets cut.
    { name: "Heat-weld rod", per: 1, basis: "seam_lf", unit: "lf", note: "runs the figured seams — set the roll width on this condition" },
  ] },
  { finish_tag: "CT-1",  color: "#9333ea", hatch: "grid",    waste_pct: 10, materials: [                                                                                                  // Ceramic / porcelain tile
    { name: "Thinset mortar", kind: "mortar", per: 65, basis: "area", unit: "bag", note: '1/4″×3/8″×1/4″ sq' },
    { name: "Grout", kind: "grout", per: 512, basis: "area", unit: "bag", grout: { ...GROUT_DEFAULTS }, note: '12×24×3/8″ @ 1/8″ · 25 lb' },
  ] },
  { finish_tag: "RB-1",  color: "#475569", hatch: "horiz",   waste_pct: 5,  materials: [{ name: "Cove base adhesive", kind: "adhesive", per: 40, basis: "linear", unit: "tube" }] },      // Rubber / resilient wall base (linear)
  { finish_tag: "TR-1",  color: "#c96442", hatch: "vert",    waste_pct: 0,  materials: [] },                                                                                              // Transitions / reducers (linear)
];
