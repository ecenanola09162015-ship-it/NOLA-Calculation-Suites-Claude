/**
 * DXF (AutoCAD 2007, AC1021) writer for the column section drawing.
 * Units mm (INSUNITS 4), LTSCALE / DIMSCALE 20, Arial text style, layers by
 * the office standard, colours ByLayer (ACI), lineweights left to the .ctb.
 * Dimensions are real DIMENSION entities with their geometry block written
 * here (filled arrows), so they display without regeneration.
 */
import {
  DxfWriter,
  HatchBoundaryPaths,
  HatchPolylineBoundary,
  HatchPredefinedPatterns,
  LWPolylineFlags,
  TextHorizontalAlignment,
  TextVerticalAlignment,
  Units,
  pattern,
  point2d,
  point3d,
  vertex,
} from "@tarikjabiri/dxf";
import {
  LAYERS,
  SCALE,
  dimGeometry,
  dimTextPoint,
  type Layer,
  type SectionDrawing,
} from "./column-section-drawing";

const STYLE = "NOLA-ARIAL";
/**
 * DXF text is kept ASCII: AutoCAD control codes for symbols (%%c Ø,
 * %%d °, %%p ±), plain substitutes for the rest.
 */
export function dxfText(s: string) {
  return s
    .replaceAll("Ø", "%%c")
    .replaceAll("°", "%%d")
    .replaceAll("±", "%%p")
    .replace(/[·•]/g, "-")
    .replace(/[–—]/g, "-")
    .replaceAll("×", "x")
    .replaceAll("′", "'")
    .replace(/[^\x20-\x7e]/g, "?");
}
const DIMSTYLE = "NOLA-1-20";

export function sectionDrawingToDxf(drawing: SectionDrawing): string {
  const dxf = new DxfWriter();
  dxf.setUnits(Units.Millimeters);
  dxf.setVariable("$MEASUREMENT", { 70: 1 });
  dxf.setVariable("$LTSCALE", { 40: SCALE });
  dxf.setVariable("$DIMSCALE", { 40: SCALE });
  dxf.setVariable("$TEXTSTYLE", { 7: STYLE });
  const [x0, y0, x1, y1] = drawing.bounds;
  dxf.setVariable("$EXTMIN", { 10: x0, 20: y0, 30: 0 });
  dxf.setVariable("$EXTMAX", { 10: x1, 20: y1, 30: 0 });
  // acadiso.lin definitions (mm).
  if (!dxf.tables.ltypeTable.exist("DASHED"))
    dxf.addLType("DASHED", "__ __ __ __", [12.7, -6.35]);
  if (!dxf.tables.ltypeTable.exist("CENTER"))
    dxf.addLType("CENTER", "____ _ ____ _", [31.75, -6.35, 6.35, -6.35]);
  for (const [name, l] of Object.entries(LAYERS))
    dxf.addLayer(
      name,
      l.color,
      l.lineType === "CONTINUOUS" ? "Continuous" : l.lineType,
    );
  const style = dxf.tables.addStyle(STYLE);
  style.fontFileName = "arial.ttf";
  const ds = dxf.addDimStyle(DIMSTYLE);
  Object.assign(ds, {
    DIMSCALE: SCALE,
    DIMTXT: 2.5,
    DIMASZ: 2.5,
    DIMEXO: 0.625,
    DIMEXE: 1.25,
    DIMGAP: 0.625,
    DIMTAD: 1,
    DIMTIH: 0,
    DIMTOH: 0,
    DIMDEC: 0,
    DIMZIN: 8,
  });

  const opt = (layer: Layer) => ({ layerName: layer });
  let dimCount = 0;
  for (const p of drawing.prims) {
    switch (p.t) {
      case "poly":
        dxf.addLWPolyline(
          p.v.map((v) => ({ point: point2d(...v.p), bulge: v.bulge ?? 0 })),
          {
            ...opt(p.layer),
            flags: p.closed ? LWPolylineFlags.Closed : LWPolylineFlags.None,
          },
        );
        break;
      case "line":
        dxf.addLine(point3d(...p.a), point3d(...p.b), opt(p.layer));
        break;
      case "disc": {
        // Circle boundary as two semicircles (bulge 1) — a polyline path.
        const paths = new HatchBoundaryPaths();
        paths.addPolylineBoundary(
          new HatchPolylineBoundary([
            vertex(p.c[0] - p.r, p.c[1], 1),
            vertex(p.c[0] + p.r, p.c[1], 1),
          ]),
        );
        dxf.addHatch(
          paths,
          pattern({ name: HatchPredefinedPatterns.SOLID }),
          opt(p.layer),
        );
        dxf.addCircle(point3d(...p.c), p.r, opt(p.layer));
        break;
      }
      case "text":
        dxf.addText(point3d(...p.p), p.h, dxfText(p.s), {
          ...opt(p.layer),
          rotation: p.rot ?? 0,
          horizontalAlignment:
            p.align === "center"
              ? TextHorizontalAlignment.Center
              : p.align === "right"
                ? TextHorizontalAlignment.Right
                : TextHorizontalAlignment.Left,
          verticalAlignment: TextVerticalAlignment.BaseLine,
          secondAlignmentPoint: point3d(...p.p),
        }).textStyle = STYLE;
        break;
      case "dim": {
        const name = `*D${++dimCount}`;
        const blk = dxf.document.blocks.addBlock(
          name,
          dxf.document.objects,
          false,
        );
        blk.flags = 1; // anonymous
        for (const g of dimGeometry(p)) {
          if (g.t === "line")
            blk.addLine(point3d(...g.a), point3d(...g.b), opt("S-DIMS"));
          else if (g.t === "poly")
            blk.addLWPolyline(
              g.v.map((v) => ({ point: point2d(...v.p) })),
              { ...opt("S-DIMS"), flags: LWPolylineFlags.Closed },
            );
          else if (g.t === "text")
            blk.addMText(point3d(...g.p), g.h, dxfText(g.s), {
              ...opt("S-DIMS"),
              rotation: g.rot ?? 0,
              attachmentPoint: 8, // bottom centre
            }).textStyle = STYLE;
        }
        // Linear dimension: horizontal (0°) or vertical (90°).
        const first = point3d(...p.a),
          second = point3d(...p.b);
        dxf.addLinearDim(first, second, {
          ...opt(p.layer),
          blockName: name,
          styleName: DIMSTYLE,
          angle: p.vertical ? 90 : 0,
          offset: p.vertical
            ? p.a[0] - p.at
            : p.at - Math.max(p.a[1], p.b[1]),
          text: dxfText(p.text),
          // Text middle point (group 11), same place as the block text.
          middlePoint: point3d(...dimTextPoint(p)),
        });
        break;
      }
    }
  }
  return dxf.stringify();
}

