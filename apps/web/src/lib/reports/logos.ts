/** Ñola logo printed in the PDF header only (app screens keep their own brand mark). */
export const REPORT_NOLA_LOGO_PATH = "/brand/nola-report-logo.png";

/**
 * Canvas geometry that pads an image to a square without cropping or
 * stretching. `scale` fits the longer side to `max` pixels.
 */
export function squareLogoLayout(width: number, height: number, max = 512) {
  const scale = Math.min(1, max / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale)),
    h = Math.max(1, Math.round(height * scale));
  const side = Math.max(w, h);
  return {
    side,
    width: w,
    height: h,
    x: Math.round((side - w) / 2),
    y: Math.round((side - h) / 2),
    padded: Math.abs(width - height) > Math.max(width, height) * 0.02,
  };
}
