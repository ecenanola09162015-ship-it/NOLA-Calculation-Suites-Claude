import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
  type PDFImage,
} from "pdf-lib";
import {
  defaultProjectReportSettings,
  projectReportSettingsSchema,
  type ReportStyle,
} from "@nola/calc-core";
import type { ReportData, ReportSection } from "./data";
export type ReportOptions = {
  type: "simple" | "complete";
  paper: "A4" | "Letter";
  nolaLogo?: string;
  companyLogo?: string;
};
const clean = (value: string) =>
  value
    .replaceAll("ϕ", "phi")
    .replaceAll("φ", "phi")
    .replaceAll("ρ", "rho")
    .replaceAll("ε", "epsilon")
    .replaceAll("δ", "delta")
    .replaceAll("β", "beta")
    .replaceAll("λ", "lambda")
    .replaceAll("→", " to ")
    .replaceAll("≥", ">=")
    .replaceAll("≤", "<=")
    .replace(/[–—]/g, "-")
    .replaceAll("…", "...")
    .replaceAll("³", "^3")
    .replaceAll("²", "^2")
    .replaceAll("′", "'")
    .replaceAll("’", "'")
    .replace(/[“”]/g, '"');
const color = (hex: string) =>
  rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  );
export function wrapReportText(
  value: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of clean(value).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      let part = "";
      for (const ch of word) {
        try {
          font.encodeText(ch);
          part += ch;
        } catch {
          part += "?";
        }
      }
      if (font.widthOfTextAtSize(part, size) > width) {
        if (line) {
          lines.push(line);
          line = "";
        }
        let chunk = "";
        for (const ch of part) {
          if (chunk && font.widthOfTextAtSize(chunk + ch, size) > width) {
            lines.push(chunk);
            chunk = "";
          }
          chunk += ch;
        }
        line = chunk;
      } else if (
        line &&
        font.widthOfTextAtSize(line + " " + part, size) > width
      ) {
        lines.push(line);
        line = part;
      } else line = line ? line + " " + part : part;
    }
    lines.push(line);
  }
  return lines;
}
export async function svgReportPng(svg: string): Promise<string> {
  const blob = new Blob([svg], { type: "image/svg+xml" }),
    url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(Error("A Report Drawing Could Not Be Rendered."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * 4;
    canvas.height = image.naturalHeight * 4;
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw Error("PDF Drawing Export Is Not Supported By This Browser.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
class SimpleOverflow extends Error {}
async function build(
  data: ReportData,
  options: ReportOptions,
  fontSize: number,
  figureHeight: number,
  maximumSimplePages = 1,
) {
  const settings = projectReportSettingsSchema.parse(
      data.project?.reportSettings ?? defaultProjectReportSettings,
    ),
    style = settings.style;
  const doc = await PDFDocument.create();
  doc.setTitle(
    data.title +
      " — " +
      (options.type === "simple" ? "Simple" : "Complete") +
      " Report",
  );
  doc.setAuthor(data.project?.preparedBy ?? "Ñola Calculation Suites");
  doc.setCreator("Ñola Calculation Suites " + style.version);
  const regular = await doc.embedFont(StandardFonts[style.pdfFallbackFont]);
  const bold = await doc.embedFont(
    StandardFonts[
      style.pdfFallbackFont === "Helvetica"
        ? "HelveticaBold"
        : style.pdfFallbackFont === "TimesRoman"
          ? "TimesRomanBold"
          : "CourierBold"
    ],
  );
  const [pageW, pageH] = options.paper === "A4" ? [595.28, 841.89] : [612, 792];
  const margin = (style.marginMm * 72) / 25.4,
    W = pageW - 2 * margin,
    gap = style.gapPt;
  const colors = style.colors;
  const labelSize = style.labelFontSize,
    valueSize = style.headerValueFontSize;
  const widths = [0.1, 0.14, 0.27, 0.21, 0.13, 0.05, 0.1].map((v) => v * W);
  const values = [
    "",
    data.project?.name ?? "Unsaved Project",
    (data.project?.buildingName ?? "Not Set") +
      (settings.buildingDescription ? "\n" + settings.buildingDescription : ""),
    data.project?.location ?? "Not Set",
    settings.ownerClient || "Not Set",
    settings.revision,
    "",
  ];
  const headLines = values.map((v, k) =>
    wrapReportText(v, regular, valueSize, widths[k] - 6),
  );
  const buildingNameLines = wrapReportText(
    data.project?.buildingName ?? "Not Set",
    regular,
    valueSize + 0.5,
    widths[2] - 6,
  );
  headLines[2] = [
    ...buildingNameLines,
    ...(settings.buildingDescription
      ? wrapReportText(
          settings.buildingDescription,
          regular,
          6.5,
          widths[2] - 6,
        )
      : []),
  ];
  const companyLines = wrapReportText(
    settings.companyName,
    bold,
    7,
    widths[0] - 6,
  );
  const headerH = Math.max(
    style.headerHeightPt,
    18 + Math.max(...headLines.slice(1, 6).map((l) => l.length)) * 8.4 + 6,
    settings.companyLogo || options.companyLogo
      ? 0
      : companyLines.length * 9 + 6,
  );
  const footerTexts = [
    `Prepared By: ${data.project?.preparedBy ?? "—"} / Checked By: ${data.project?.checkedBy ?? "—"}`,
    "Date Generated: " +
      new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeZone: "Asia/Manila",
      }).format(new Date(data.generatedAt)),
    `Generated by Ñola Calculation Suites v${style.version}`,
  ];
  const footerWidths = [W * 0.43, W * 0.22, W * 0.35];
  const footerLines = footerTexts.map((v, k) =>
    wrapReportText(v, regular, style.footerFontSize, footerWidths[k] - 4),
  );
  const footerTitleLines = wrapReportText(style.footerTitle, bold, 7, W - 87);
  const footerBandH = Math.max(12, footerTitleLines.length * 9 + 3);
  const footerH = Math.max(
    style.footerHeightPt,
    footerBandH +
      2 +
      Math.max(...footerLines.map((l) => l.length)) *
        (style.footerFontSize + style.lineGapPt) +
      4,
  );
  const moduleLines = wrapReportText(
    `${data.module} - ${options.type === "simple" ? "Simple" : "Complete"} Report | ${data.title}`,
    bold,
    8,
    W,
  );
  const top = margin + headerH + Math.max(18, moduleLines.length * 10 + 8),
    bottom = pageH - margin - footerH - 6;
  const embed = async (s: string | undefined): Promise<PDFImage | undefined> =>
    s
      ? s.startsWith("data:image/jpeg")
        ? doc.embedJpg(s)
        : doc.embedPng(s)
      : undefined;
  const company = await embed(
      options.companyLogo ?? settings.companyLogo ?? undefined,
    ),
    // The Ñola logo is fixed (supplied by the export); a stored upload is ignored.
    nola = await embed(options.nolaLogo);
  const figures = await Promise.all(
    data.figures.map(async (f) => ({
      title: f.title,
      image: await doc.embedPng(f.png ?? (await svgReportPng(f.svg))),
    })),
  );
  let page!: PDFPage;
  let y = top;
  const pages: PDFPage[] = [];
  const rect = (
    p: PDFPage,
    x: number,
    yt: number,
    w: number,
    h: number,
    fill: string,
    border?: string,
  ) =>
    p.drawRectangle({
      x,
      y: pageH - yt - h,
      width: w,
      height: h,
      color: color(fill),
      borderColor: border ? color(border) : undefined,
      borderWidth: border ? 0.5 : 0,
    });
  const write = (
    p: PDFPage,
    text: string,
    x: number,
    yt: number,
    size = fontSize,
    isBold = false,
    ink = colors.text,
  ) => {
    const font = isBold ? bold : regular;
    const sanitized = wrapReportText(text, font, size, 100000).join(" ");
    p.drawText(sanitized, {
      x,
      y: pageH - yt - size,
      size,
      font,
      color: color(ink),
    });
  };
  const lines = (
    p: PDFPage,
    ls: string[],
    x: number,
    yt: number,
    size = fontSize,
    isBold = false,
    ink = colors.text,
  ) =>
    ls.forEach((v, k) =>
      write(p, v, x, yt + k * (size + style.lineGapPt), size, isBold, ink),
    );
  const newPage = () => {
    page = doc.addPage([pageW, pageH]);
    pages.push(page);
    y = top;
  };
  newPage();
  const ensure = (height: number) => {
    if (y + height <= bottom) return;
    if (options.type === "simple" && pages.length >= maximumSimplePages)
      throw new SimpleOverflow();
    newPage();
    if (y + height > bottom)
      throw Error(
        "A Report Row Is Too Long. Shorten Its Description Or Remarks.",
      );
  };
  const titleBar = (title: string, x: number, yt: number, w: number) => {
    rect(page, x, yt, w, 14, colors.primary);
    write(
      page,
      title,
      x + 4,
      yt + 2,
      style.sectionTitleFontSize,
      true,
      colors.white,
    );
  };
  const table = (s: ReportSection, x = margin, w = W, compact = false) => {
    const size = compact
      ? fontSize
      : options.type === "complete"
        ? Math.max(7, fontSize - 0.5)
        : fontSize;
    const fractions =
      s.columns.length === 2
        ? [0.34, 0.66]
        : s.columns.length === 3
          ? s.columns[2] === "Status / Remarks"
            ? [0.43, 0.08, 0.49]
            : [0.22, 0.6, 0.18]
          : s.columns.length === 4 && s.columns[3] === "Status / Remarks"
            ? [0.33, 0.25, 0.08, 0.34]
            : Array(s.columns.length).fill(1 / s.columns.length);
    const colW = fractions.map((v) => v * w);
    if (!s.rows.length) return;
    const headingHeight =
      14 +
      Math.max(
        ...s.columns.map(
          (v, k) =>
            wrapReportText(
              v,
              bold,
              style.tableHeaderFontSize,
              colW[k] - 2 * style.tablePaddingPt,
            ).length,
        ),
      ) *
        (style.tableHeaderFontSize + style.lineGapPt) +
      5;
    const firstRowHeight =
      Math.max(
        ...s.rows[0].map(
          (v, k) =>
            wrapReportText(
              typeof v === "string" ? v : v.text,
              regular,
              size,
              colW[k] - 2 * style.tablePaddingPt,
            ).length,
        ),
      ) *
        (size + style.lineGapPt) +
      5;
    ensure(
      headingHeight + Math.min(firstRowHeight, bottom - top - headingHeight),
    );
    const heading = () => {
      ensure(35);
      titleBar(s.title, x, y, w);
      y += 14;
      const hs = s.columns.map((v, k) =>
        wrapReportText(
          v,
          bold,
          style.tableHeaderFontSize,
          colW[k] - 2 * style.tablePaddingPt,
        ),
      );
      const height =
        Math.max(...hs.map((v) => v.length)) *
          (style.tableHeaderFontSize + style.lineGapPt) +
        5;
      rect(page, x, y, w, height, colors.tint);
      let xx = x;
      s.columns.forEach((_, k) => {
        lines(
          page,
          hs[k],
          xx + style.tablePaddingPt,
          y + 2,
          style.tableHeaderFontSize,
          true,
          colors.primary,
        );
        xx += colW[k];
      });
      y += height;
    };
    const smallBlockHeight =
      14 +
      Math.max(
        ...s.columns.map(
          (v, k) =>
            wrapReportText(
              v,
              bold,
              style.tableHeaderFontSize,
              colW[k] - 2 * style.tablePaddingPt,
            ).length,
        ),
      ) *
        (style.tableHeaderFontSize + style.lineGapPt) +
      5 +
      s.rows.reduce(
        (total, row) =>
          total +
          Math.max(
            ...row.map(
              (v, k) =>
                wrapReportText(
                  typeof v === "string" ? v : v.text,
                  regular,
                  size,
                  colW[k] - 2 * style.tablePaddingPt,
                ).length,
            ),
          ) *
            (size + style.lineGapPt) +
          5,
        0,
      );
    if (smallBlockHeight <= 180) ensure(smallBlockHeight);
    heading();
    for (const row of s.rows) {
      const cells = row.map((v) => (typeof v === "string" ? { text: v } : v));
      const wrapped = cells.map((v, k) =>
        wrapReportText(
          v.text,
          regular,
          size,
          colW[k] - 2 * style.tablePaddingPt,
        ),
      );
      const totalLines = Math.max(...wrapped.map((v) => v.length));
      let offset = 0;
      while (offset < totalLines) {
        const fullHeight = (totalLines - offset) * (size + style.lineGapPt) + 5;
        const pageAvailable = bottom - top - 45;
        if (y + Math.min(fullHeight, pageAvailable) > bottom) {
          ensure(Math.min(fullHeight, pageAvailable) + 35);
          heading();
        }
        const capacity = Math.floor(
          (bottom - y - 5) / (size + style.lineGapPt),
        );
        if (capacity < 1) {
          ensure(bottom - y + 1);
          heading();
          continue;
        }
        const count = Math.min(totalLines - offset, capacity);
        if (
          count < totalLines - offset &&
          options.type === "simple" &&
          maximumSimplePages === 1
        )
          throw new SimpleOverflow();
        const height = count * (size + style.lineGapPt) + 5;
        let xx = x;
        cells.forEach((v, k) => {
          rect(page, xx, y, colW[k], height, colors.white, colors.border);
          lines(
            page,
            wrapped[k].slice(offset, offset + count),
            xx + 3,
            y + 2,
            size,
            false,
            v.color ?? colors.text,
          );
          xx += colW[k];
        });
        y += height;
        offset += count;
        if (offset < totalLines) {
          ensure(bottom - y + 1);
          heading();
        }
      }
    }
    y += gap;
  };
  const summaryStart = y,
    boxWidth = (W - 2 * gap) / 3;
  let maximum = summaryStart;
  if (options.type === "simple" && maximumSimplePages === 2) {
    for (const s of data.summary) table(s, margin, W, true);
  } else {
    for (let k = 0; k < data.summary.length; k++) {
      y = summaryStart;
      table(data.summary[k], margin + k * (boxWidth + gap), boxWidth, true);
      maximum = Math.max(maximum, y);
    }
    y = maximum;
  }
  const figureColumns = 3,
    fw = (W - (figureColumns - 1) * gap) / figureColumns;
  for (let first = 0; first < figures.length; first += figureColumns) {
    ensure(figureHeight + 18);
    for (let k = 0; k < figureColumns && first + k < figures.length; k++) {
      const fig = figures[first + k],
        x = margin + k * (fw + gap);
      rect(page, x, y, fw, figureHeight + 14, colors.white, colors.border);
      lines(
        page,
        wrapReportText(fig.title, bold, 7, fw - 6),
        x + 3,
        y + 2,
        7,
        true,
        colors.primary,
      );
      const scale = Math.min(
        (fw - 6) / fig.image.width,
        (figureHeight - 4) / fig.image.height,
      );
      page.drawImage(fig.image, {
        x: x + (fw - fig.image.width * scale) / 2,
        y: pageH - y - 14 - (figureHeight + fig.image.height * scale) / 2,
        width: fig.image.width * scale,
        height: fig.image.height * scale,
      });
    }
    y += figureHeight + 14 + gap;
  }
  table(data.references);
  if (data.estimate) table(data.estimate);
  const overview = [
    `Design Code: ${data.code}; Calculation Basis: ${data.basis}.`,
    data.module === "RC Column"
      ? (data.scopeNote ??
        "Section-Strength Screening Only. Shear / Slenderness / Seismic Tie Compliance Not Evaluated.")
      : "Immediate Elastic Deflection Screen; Long-Term / Cracked Deflection And Full Anchorage Compliance Require Review.",
    ...(data.estimate
      ? ["Estimate Excludes Splices, Couplers, Waste And Bend Deductions."]
      : []),
    ...(data.criticalNotes ?? []),
  ];
  const noteLines = wrapReportText(
    overview.join(" "),
    regular,
    Math.max(6.5, fontSize - 0.5),
    W,
  );
  ensure(noteLines.length * (fontSize + 1) + gap);
  lines(page, noteLines, margin, y, Math.max(6.5, fontSize - 0.5));
  y += noteLines.length * (fontSize + 1) + gap;
  if (options.type === "complete") {
    for (const s of [data.checks, ...data.sections]) table(s);
    table({
      title: "Assumptions, Limitations And Detailing Review",
      columns: ["Item", "Note"],
      rows: [...new Set(data.limitations)].map((v, k) => [String(k + 1), v]),
    });
    const recorded = Object.entries(data.remarks).filter(([, v]) => v.trim());
    if (recorded.length)
      table({
        title: "Recorded Engineering Remarks",
        columns: ["Check ID", "Remarks"],
        rows: recorded,
      });
  }
  // The same compact header and footer are stamped after final pagination.
  for (const [index, p] of pages.entries()) {
    let x = margin;
    const labels = [
      "",
      "Project Name",
      "Building / Model",
      "Address",
      "Owner / Client",
      "Rev.",
      "",
    ];
    for (let k = 0; k < widths.length; k++) {
      const w = widths[k];
      if (k === 0 || k === 6) {
        rect(p, x, margin, w, headerH, colors.white, colors.teal);
        const logo = k === 0 ? company : nola;
        if (logo) {
          const scale = Math.min(
            (w - 6) / logo.width,
            (headerH - 6) / logo.height,
          );
          p.drawImage(logo, {
            x: x + (w - logo.width * scale) / 2,
            y: pageH - margin - headerH + (headerH - logo.height * scale) / 2,
            width: logo.width * scale,
            height: logo.height * scale,
          });
        } else if (k === 0 && settings.companyName)
          companyLines.forEach((line, j) =>
            write(
              p,
              line,
              x + (w - bold.widthOfTextAtSize(line, 7)) / 2,
              margin + (headerH - companyLines.length * 9) / 2 + j * 9,
              7,
              true,
            ),
          );
      } else {
        rect(p, x, margin, w, 18, colors.primary);
        rect(p, x, margin + 18, w, headerH - 18, colors.tint);
        const label = wrapReportText(labels[k], bold, labelSize, w - 4);
        label.forEach((v, j) =>
          write(
            p,
            v,
            x + (w - bold.widthOfTextAtSize(v, labelSize)) / 2,
            margin + 1 + j * (labelSize + 1),
            labelSize,
            true,
            colors.white,
          ),
        );
        headLines[k].forEach((v, j) => {
          const size =
            k === 2 ? (j < buildingNameLines.length ? 7.5 : 6.5) : valueSize;
          write(
            p,
            v,
            x + (w - regular.widthOfTextAtSize(v, size)) / 2,
            margin + 21 + j * 8.4,
            size,
          );
        });
        p.drawLine({
          start: { x, y: pageH - margin - 18 },
          end: { x: x + w, y: pageH - margin - 18 },
          thickness: 0.5,
          color: color(colors.white),
        });
        p.drawLine({
          start: { x, y: pageH - margin },
          end: { x, y: pageH - margin - headerH },
          thickness: 0.5,
          color: color(colors.white),
        });
      }
      x += w;
    }
    lines(
      p,
      moduleLines,
      margin,
      margin + headerH + 4,
      8,
      true,
      colors.primary,
    );
    const fy = pageH - margin - footerH;
    rect(p, margin, fy, 10, footerBandH, colors.teal);
    rect(p, margin + 10, fy, W - 79, footerBandH, colors.primary);
    rect(p, margin + W - 69, fy, 69, footerBandH, colors.teal);
    lines(p, footerTitleLines, margin + 14, fy + 2, 7, true, colors.white);
    write(
      p,
      `Page ${index + 1} of ${pages.length}`,
      margin + W - 65,
      fy + 2,
      7,
      true,
      colors.white,
    );
    let xx = margin;
    footerLines.forEach((ls, k) => {
      lines(p, ls, xx + 2, fy + footerBandH + 3, style.footerFontSize);
      xx += footerWidths[k];
    });
  }
  return {
    bytes: await doc.save(),
    pageCount: pages.length,
    font: style.pdfFallbackFont,
  };
}
export async function generateCalculationPdf(
  data: ReportData,
  options: ReportOptions,
) {
  const style: ReportStyle = projectReportSettingsSchema.parse(
    data.project?.reportSettings ?? defaultProjectReportSettings,
  ).style;
  if (options.type === "complete")
    return build(data, options, style.completeFontSize, 150);
  const sizes = [
    style.simpleFontSize,
    Math.max(style.minimumFontSize, style.simpleFontSize - 0.5),
    style.minimumFontSize,
  ];
  for (const [index, size] of sizes.entries())
    try {
      return await build(
        data,
        options,
        size,
        index === 0 ? 150 : index === 1 ? 140 : 137,
      );
    } catch (error) {
      if (!(error instanceof SimpleOverflow)) throw error;
    }
  if (data.module === "Slab Design" || data.simplePageLimit === 2) {
    for (const size of sizes)
      try {
        return await build(data, options, size, 137, 2);
      } catch (error) {
        if (!(error instanceof SimpleOverflow)) throw error;
      }
  }
  throw Error(
    data.module === "Slab Design"
      ? "The Slab Simple Report Exceeds Two Pages. Shorten Project Descriptions / Remarks Or Select Complete Report."
      : data.simplePageLimit === 2
        ? "The Column Simple Report Exceeds Two Pages. Shorten Project Descriptions / Remarks Or Select Complete Report."
        : "The Column Simple Report Cannot Fit One Page At The Minimum Font Size. Shorten Project Descriptions / Remarks Or Select Complete Report.",
  );
}
