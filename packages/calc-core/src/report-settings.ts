import { z } from "zod";
import defaults from "./report-style.json";
const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
export const reportStyleSchema = z.object({
  version: z.string().max(20),
  fontFamily: z.string().min(1).max(60),
  pdfFallbackFont: z.enum(["Helvetica", "TimesRoman", "Courier"]),
  simpleFontSize: z.number().min(6.5).max(9),
  completeFontSize: z.number().min(7).max(10),
  minimumFontSize: z.number().min(6.5).max(8),
  labelFontSize: z.number().min(7).max(9),
  sectionTitleFontSize: z.number().min(8).max(9).default(8),
  tableHeaderFontSize: z.number().min(7).max(8).default(7),
  headerValueFontSize: z.number().min(7).max(8).default(7),
  descriptionFontSize: z.number().min(6.5).max(7).default(6.5),
  diagramFontSize: z.number().min(10).max(12).default(10),
  lineGapPt: z.number().min(1).max(3).default(2),
  tablePaddingPt: z.number().min(2).max(4).default(3),
  footerFontSize: z.number().min(6.5).max(7),
  marginMm: z.number().min(10).max(12),
  gapPt: z.number().min(3).max(10),
  headerHeightPt: z.number().min(55).max(75),
  footerHeightPt: z.number().min(28).max(40),
  footerTitle: z.string().trim().min(1).max(120),
  colors: z.object({
    primary: hex,
    teal: hex,
    tint: hex,
    text: hex,
    white: hex,
    border: hex,
    gold: hex,
    extra: hex,
  }),
});
export type ReportStyle = z.infer<typeof reportStyleSchema>;
export const defaultReportStyle = reportStyleSchema.parse(defaults);
const logo = z
  .string()
  .max(180000)
  .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
  .nullable();
export const projectReportSettingsSchema = z.object({
  ownerClient: z.string().trim().max(120).default(""),
  buildingDescription: z.string().trim().max(300).default(""),
  revision: z.string().trim().max(20).default("00"),
  companyName: z.string().trim().max(100).default(""),
  companyLogo: logo.default(null),
  nolaLogo: logo.default(null),
  style: reportStyleSchema.default(defaultReportStyle),
});
export type ProjectReportSettings = z.infer<typeof projectReportSettingsSchema>;
export const defaultProjectReportSettings = projectReportSettingsSchema.parse(
  {},
);
