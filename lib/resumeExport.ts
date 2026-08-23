import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  rgb,
} from "pdf-lib";

type ResumeLine = {
  kind:
    | "title"
    | "subtitle"
    | "contact"
    | "heading"
    | "bullet"
    | "body"
    | "company_date"
    | "role_title"
    | "skills_group";
  text: string;
  // For company_date lines, the date/range portion is split out so it can be
  // styled (italic) separately from the company/location portion (bold).
  companyText?: string;
  dateText?: string;
  // For skills_group lines ("Label: item, item, item").
  label?: string;
  items?: string;
};

const HEADING_BLUE = "2E74B5";
const COMPETENCY_HEADING_PATTERN = /COMPETENC/i;

function isSectionHeading(value: string) {
  const text = value.trim();

  return (
    text.length > 0 &&
    text.length <= 72 &&
    text === text.toUpperCase() &&
    /[A-Z]/.test(text) &&
    !text.startsWith("-")
  );
}

function looksLikeContactLine(text: string) {
  const hasEmailOrPhoneOrLink =
    /@/.test(text) ||
    /\+?\d[\d\s-]{6,}\d/.test(text) ||
    /linkedin\.com/i.test(text);

  return hasEmailOrPhoneOrLink || /\|/.test(text);
}

const DATE_RANGE_PATTERN =
  /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|\d{4})\s*[-–—]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|\d{4}|Present|Current)/i;

function looksLikeCompanyDateLine(text: string) {
  if (text.startsWith("-") || text.startsWith("•")) return false;
  if (isSectionHeading(text)) return false;

  return DATE_RANGE_PATTERN.test(text);
}

function splitCompanyDateLine(text: string) {
  const match = text.match(DATE_RANGE_PATTERN);

  if (!match || match.index === undefined) {
    return { companyText: text, dateText: "" };
  }

  const companyText = text.slice(0, match.index).replace(/[\s|]+$/, "").trim();
  const dateText = match[0].trim();

  return { companyText: companyText || text, dateText };
}

function looksLikeSkillsGroupLine(text: string) {
  if (text.startsWith("-") || text.startsWith("•")) return false;
  if (isSectionHeading(text)) return false;

  // Matches "Cloud & Digital Transformation: Azure, AWS, ..." — a short
  // label (no more than ~6 words) followed by a colon and a comma-ish list.
  const match = text.match(/^([A-Za-z0-9 &/'-]{2,60}):\s+(.+)$/);
  if (!match) return false;

  const label = match[1];
  return label.split(/\s+/).length <= 6;
}

function splitSkillsGroupLine(text: string) {
  const match = text.match(/^([A-Za-z0-9 &/'-]{2,60}):\s+(.+)$/);
  if (!match) return { label: text, items: "" };
  return { label: match[1].trim(), items: match[2].trim() };
}

function parseResumeText(resumeText: string): ResumeLine[] {
  const nonEmptyLines = resumeText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const lines: ResumeLine[] = [];
  let currentHeading = "";
  let previousKind: ResumeLine["kind"] | null = null;

  nonEmptyLines.forEach((line, index) => {
    if (index === 0) {
      lines.push({ kind: "title", text: line });
      previousKind = "title";
      return;
    }

    if (index <= 3 && !isSectionHeading(line) && looksLikeContactLine(line)) {
      lines.push({ kind: index === 1 ? "subtitle" : "contact", text: line });
      previousKind = "contact";
      return;
    }

    if (index === 1 && !isSectionHeading(line)) {
      lines.push({ kind: "subtitle", text: line });
      previousKind = "subtitle";
      return;
    }

    if (isSectionHeading(line)) {
      currentHeading = line;
      lines.push({ kind: "heading", text: line });
      previousKind = "heading";
      return;
    }

    if (/^[-•]\s+/.test(line)) {
      lines.push({ kind: "bullet", text: line.replace(/^[-•]\s+/, "") });
      previousKind = "bullet";
      return;
    }

    // Some source resumes store Core Competencies as one flowing line with
    // items separated by "|" (often with a few items bolded) rather than
    // one bullet per line — e.g. a Word table that got flattened to plain
    // text during upload parsing. Split that into the same per-item form
    // the bullet-per-line style produces, so both patterns render as the
    // same 3-column table downstream.
    if (
      COMPETENCY_HEADING_PATTERN.test(currentHeading) &&
      (line.match(/\|/g) ?? []).length >= 2
    ) {
      const items = line
        .split("|")
        .map((item) => item.replace(/\*\*/g, "").trim())
        .filter(Boolean);

      items.forEach((item) => {
        lines.push({ kind: "bullet", text: item });
      });

      previousKind = "bullet";
      return;
    }

    // Skills-group lines only apply under a "TECHNICAL SKILLS"-style
    // heading, to avoid misclassifying unrelated "Word: rest" sentences.
    if (
      /SKILL/i.test(currentHeading) &&
      !COMPETENCY_HEADING_PATTERN.test(currentHeading) &&
      looksLikeSkillsGroupLine(line)
    ) {
      const { label, items } = splitSkillsGroupLine(line);
      lines.push({ kind: "skills_group", text: line, label, items });
      previousKind = "skills_group";
      return;
    }

    if (looksLikeCompanyDateLine(line)) {
      const { companyText, dateText } = splitCompanyDateLine(line);
      lines.push({
        kind: "company_date",
        text: line,
        companyText,
        dateText,
      });
      previousKind = "company_date";
      return;
    }

    // A short, non-bulleted line right after a company/date line is almost
    // always the job title for that role.
    if (previousKind === "company_date" && line.length <= 90) {
      lines.push({ kind: "role_title", text: line });
      previousKind = "role_title";
      return;
    }

    lines.push({ kind: "body", text: line });
    previousKind = "body";
  });

  return lines;
}

export async function createResumeDocx(resumeText: string) {
  const lines = parseResumeText(resumeText);
  const children: (Paragraph | Table)[] = [];
  let currentHeadingText = "";

  const noBorder = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };

  const buildCompetencyTable = (items: string[]) => {
    const columns = 3;
    const columnWidth = 3120; // 9360 usable DXA / 3
    const rows: TableRow[] = [];

    for (let i = 0; i < items.length; i += columns) {
      const rowItems = items.slice(i, i + columns);

      while (rowItems.length < columns) rowItems.push("");

      rows.push(
        new TableRow({
          children: rowItems.map(
            (item) =>
              new TableCell({
                width: { size: columnWidth, type: WidthType.DXA },
                borders: noBorder,
                margins: { top: 60, bottom: 60, left: 40, right: 120 },
                children: [
                  new Paragraph({
                    children: item
                      ? [
                          new TextRun({
                            text: `\u2726 ${item}`,
                            size: 20,
                          }),
                        ]
                      : [],
                  }),
                ],
              })
          ),
        })
      );
    }

    return new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [columnWidth, columnWidth, columnWidth],
      borders: noBorder,
      rows,
    });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (line.kind === "heading") {
      currentHeadingText = line.text;
      children.push(
        new Paragraph({
          heading: "Heading1",
          spacing: { before: 360, after: 200 },
          keepNext: true,
          children: [new TextRun({ text: line.text })],
        })
      );
      continue;
    }

    if (
      line.kind === "bullet" &&
      COMPETENCY_HEADING_PATTERN.test(currentHeadingText)
    ) {
      const items: string[] = [line.text];
      let lookahead = i + 1;

      while (lookahead < lines.length && lines[lookahead].kind === "bullet") {
        items.push(lines[lookahead].text);
        lookahead += 1;
      }

      children.push(buildCompetencyTable(items));
      i = lookahead - 1;
      continue;
    }

    if (line.kind === "title") {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 80 },
          children: [
            new TextRun({
              text: line.text,
              bold: true,
              font: "Calibri",
              size: 40,
              color: "0B2545",
            }),
          ],
        })
      );
      continue;
    }

    if (line.kind === "subtitle") {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 160 },
          children: [
            new TextRun({
              text: line.text,
              bold: true,
              font: "Calibri",
              size: 24,
              color: "1F4D78",
            }),
          ],
        })
      );
      continue;
    }

    if (line.kind === "contact") {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 100 },
          children: [
            new TextRun({
              text: line.text,
              font: "Calibri",
              size: 18,
              color: "475569",
            }),
          ],
        })
      );
      continue;
    }

    if (line.kind === "company_date") {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 20, line: 300 },
          children: [
            new TextRun({
              text: line.companyText ?? line.text,
              bold: true,
              size: 22,
            }),
            ...(line.dateText
              ? [
                  new TextRun({
                    text: `   ${line.dateText}`,
                    italics: true,
                    size: 20,
                    color: "475569",
                  }),
                ]
              : []),
          ],
        })
      );
      continue;
    }

    if (line.kind === "role_title") {
      children.push(
        new Paragraph({
          spacing: { before: 0, after: 120, line: 300 },
          children: [
            new TextRun({ text: line.text, bold: true, size: 22 }),
          ],
        })
      );
      continue;
    }

    if (line.kind === "skills_group") {
      children.push(
        new Paragraph({
          spacing: { before: 0, after: 120, line: 300 },
          children: [
            new TextRun({ text: `${line.label}: `, bold: true, size: 22 }),
            new TextRun({ text: line.items ?? "", size: 22 }),
          ],
        })
      );
      continue;
    }

    if (line.kind === "bullet") {
      children.push(
        new Paragraph({
          numbering: { reference: "resume-bullets", level: 0 },
          spacing: { before: 0, after: 80, line: 300 },
          children: [new TextRun({ text: line.text })],
        })
      );
      continue;
    }

    children.push(
      new Paragraph({
        spacing: { before: 0, after: 120, line: 300 },
        children: [new TextRun({ text: line.text })],
      })
    );
  }

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22, color: "111827" },
          paragraph: { spacing: { after: 120, line: 300 } },
        },
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            font: "Calibri",
            size: 32,
            bold: true,
            color: HEADING_BLUE,
          },
          paragraph: {
            spacing: { before: 360, after: 200 },
            keepNext: true,
          },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "resume-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 540, hanging: 270 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
              header: 708,
              footer: 708,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: "Page ",
                    color: "64748B",
                    size: 18,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    color: "64748B",
                    size: 18,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

function wrapPdfText(text: string, font: PDFFont, size: number, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export async function createResumePdf(resumeText: string) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(
      path.join(
        process.cwd(),
        "assets",
        "fonts",
        "LiberationSans-Regular.ttf"
      )
    ),
    readFile(
      path.join(
        process.cwd(),
        "assets",
        "fonts",
        "LiberationSans-Bold.ttf"
      )
    ),
  ]);
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const width = 612;
  const height = 792;
  const margin = 72;
  const contentWidth = width - margin * 2;
  let page: PDFPage = pdf.addPage([width, height]);
  let y = height - margin;

  const addPage = () => {
    page = pdf.addPage([width, height]);
    y = height - margin;
  };

  const drawWrapped = (
    text: string,
    options: {
      font: PDFFont;
      size: number;
      color: ReturnType<typeof rgb>;
      lineHeight: number;
      after: number;
      indent?: number;
      prefix?: string;
    }
  ) => {
    const indent = options.indent ?? 0;
    const availableWidth = contentWidth - indent;
    const wrapped = wrapPdfText(
      `${options.prefix ?? ""}${text}`,
      options.font,
      options.size,
      availableWidth
    );

    for (const row of wrapped) {
      if (y - options.lineHeight < margin) addPage();
      page.drawText(row, {
        x: margin + indent,
        y,
        size: options.size,
        font: options.font,
        color: options.color,
      });
      y -= options.lineHeight;
    }

    y -= options.after;
  };

  const parsedLines = parseResumeText(resumeText);
  let currentHeadingText = "";

  for (let i = 0; i < parsedLines.length; i += 1) {
    const line = parsedLines[i];

    if (line.kind === "heading") {
      currentHeadingText = line.text;
      if (y - 32 < margin) addPage();
      y -= 8;
      drawWrapped(line.text, {
        font: bold,
        size: 13,
        color: rgb(0.18, 0.45, 0.71),
        lineHeight: 17,
        after: 6,
      });
      continue;
    }

    if (
      line.kind === "bullet" &&
      COMPETENCY_HEADING_PATTERN.test(currentHeadingText)
    ) {
      // Collect the run of competency bullets and lay them out in a
      // 2-column grid (simpler and more reliable in raw PDF drawing than a
      // full 3-column table) instead of one bullet per line.
      const items: string[] = [line.text];
      let lookahead = i + 1;

      while (
        lookahead < parsedLines.length &&
        parsedLines[lookahead].kind === "bullet"
      ) {
        items.push(parsedLines[lookahead].text);
        lookahead += 1;
      }

      const colWidth = contentWidth / 2;
      for (let row = 0; row < items.length; row += 2) {
        if (y - 13.5 < margin) addPage();
        const rowItems = items.slice(row, row + 2);

        rowItems.forEach((item, col) => {
          const wrapped = wrapPdfText(
            `\u2022 ${item}`,
            regular,
            9.5,
            colWidth - 10
          );
          page.drawText(wrapped[0] ?? "", {
            x: margin + col * colWidth,
            y,
            size: 9.5,
            font: regular,
            color: rgb(0.07, 0.09, 0.15),
          });
        });

        y -= 14;
      }
      y -= 6;

      i = lookahead - 1;
      continue;
    }

    if (line.kind === "title") {
      const size = 20;
      const textWidth = bold.widthOfTextAtSize(line.text, size);
      page.drawText(line.text, {
        x: Math.max(margin, (width - textWidth) / 2),
        y,
        size,
        font: bold,
        color: rgb(0.04, 0.15, 0.27),
      });
      y -= 30;
      continue;
    }

    if (line.kind === "subtitle") {
      drawWrapped(line.text, {
        font: bold,
        size: 12,
        color: rgb(0.12, 0.3, 0.47),
        lineHeight: 15,
        after: 10,
      });
      continue;
    }

    if (line.kind === "contact") {
      drawWrapped(line.text, {
        font: regular,
        size: 9,
        color: rgb(0.28, 0.34, 0.41),
        lineHeight: 12,
        after: 4,
      });
      continue;
    }

    if (line.kind === "company_date") {
      if (y - 13.5 < margin) addPage();
      const companyText = line.companyText ?? line.text;
      page.drawText(companyText, {
        x: margin,
        y,
        size: 10.5,
        font: bold,
        color: rgb(0.07, 0.09, 0.15),
      });

      if (line.dateText) {
        const dateWidth = regular.widthOfTextAtSize(line.dateText, 9.5);
        page.drawText(line.dateText, {
          x: width - margin - dateWidth,
          y,
          size: 9.5,
          font: regular,
          color: rgb(0.28, 0.34, 0.41),
        });
      }

      y -= 15;
      continue;
    }

    if (line.kind === "role_title") {
      drawWrapped(line.text, {
        font: bold,
        size: 10.5,
        color: rgb(0.07, 0.09, 0.15),
        lineHeight: 13.5,
        after: 4,
      });
      continue;
    }

    if (line.kind === "skills_group") {
      if (y - 13.5 < margin) addPage();
      const labelText = `${line.label}: `;
      page.drawText(labelText, {
        x: margin,
        y,
        size: 10.5,
        font: bold,
        color: rgb(0.07, 0.09, 0.15),
      });
      const labelWidth = bold.widthOfTextAtSize(labelText, 10.5);
      drawWrapped(line.items ?? "", {
        font: regular,
        size: 10.5,
        color: rgb(0.07, 0.09, 0.15),
        lineHeight: 13.5,
        after: 6,
        indent: labelWidth,
      });
      continue;
    }

    if (line.kind === "bullet") {
      drawWrapped(line.text, {
        font: regular,
        size: 10.5,
        color: rgb(0.07, 0.09, 0.15),
        lineHeight: 13.5,
        after: 4,
        indent: 14,
        prefix: "- ",
      });
      continue;
    }

    drawWrapped(line.text, {
      font: regular,
      size: 10.5,
      color: rgb(0.07, 0.09, 0.15),
      lineHeight: 13.5,
      after: 6,
    });
  }

  const pages = pdf.getPages();
  pages.forEach((currentPage, index) => {
    const label = `Page ${index + 1} of ${pages.length}`;
    currentPage.drawText(label, {
      x: width - margin - regular.widthOfTextAtSize(label, 9),
      y: 36,
      size: 9,
      font: regular,
      color: rgb(0.39, 0.45, 0.55),
    });
  });

  return pdf.save();
}

export function makeResumeFileName(role: string, company: string) {
  const safePart = (value: string, fallback: string) =>
    value
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || fallback;

  return `Tailored-Resume-${safePart(role, "Role")}-${safePart(
    company,
    "Company"
  )}`;
}
