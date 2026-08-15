import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import {
  AlignmentType,
  Document,
  Footer,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  rgb,
} from "pdf-lib";

type ResumeLine = {
  kind: "title" | "subtitle" | "heading" | "bullet" | "body";
  text: string;
};

const HEADING_BLUE = "2E74B5";

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

function parseResumeText(resumeText: string): ResumeLine[] {
  const nonEmptyLines = resumeText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return nonEmptyLines.map((line, index) => {
    if (index === 0) {
      return { kind: "title", text: line };
    }

    if (index === 1 && !isSectionHeading(line)) {
      return { kind: "subtitle", text: line };
    }

    if (isSectionHeading(line)) {
      return { kind: "heading", text: line };
    }

    if (/^[-•]\s+/.test(line)) {
      return {
        kind: "bullet",
        text: line.replace(/^[-•]\s+/, ""),
      };
    }

    return { kind: "body", text: line };
  });
}

export async function createResumeDocx(resumeText: string) {
  const lines = parseResumeText(resumeText);
  const children = lines.map((line) => {
    if (line.kind === "title") {
      return new Paragraph({
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
      });
    }

    if (line.kind === "subtitle") {
      return new Paragraph({
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
      });
    }

    if (line.kind === "heading") {
      return new Paragraph({
        heading: "Heading1",
        spacing: { before: 360, after: 200 },
        keepNext: true,
        children: [new TextRun({ text: line.text })],
      });
    }

    if (line.kind === "bullet") {
      return new Paragraph({
        numbering: { reference: "resume-bullets", level: 0 },
        spacing: { before: 0, after: 80, line: 300 },
        children: [new TextRun({ text: line.text })],
      });
    }

    return new Paragraph({
      spacing: { before: 0, after: 120, line: 300 },
      children: [new TextRun({ text: line.text })],
    });
  });

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

  for (const line of parseResumeText(resumeText)) {
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
    } else if (line.kind === "subtitle") {
      drawWrapped(line.text, {
        font: bold,
        size: 12,
        color: rgb(0.12, 0.3, 0.47),
        lineHeight: 15,
        after: 10,
      });
    } else if (line.kind === "heading") {
      if (y - 32 < margin) addPage();
      y -= 8;
      drawWrapped(line.text, {
        font: bold,
        size: 13,
        color: rgb(0.18, 0.45, 0.71),
        lineHeight: 17,
        after: 6,
      });
    } else if (line.kind === "bullet") {
      drawWrapped(line.text, {
        font: regular,
        size: 10.5,
        color: rgb(0.07, 0.09, 0.15),
        lineHeight: 13.5,
        after: 4,
        indent: 14,
        prefix: "- ",
      });
    } else {
      drawWrapped(line.text, {
        font: regular,
        size: 10.5,
        color: rgb(0.07, 0.09, 0.15),
        lineHeight: 13.5,
        after: 6,
      });
    }
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
