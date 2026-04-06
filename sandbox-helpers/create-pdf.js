/**
 * create-pdf.js -- Unicode-safe PDF helper for the AlfyAI sandbox.
 *
 * Usage:
 *   const createPDF = require("/workspace/helpers/create-pdf");
 *   await createPDF({
 *     filename: "report.pdf",
 *     title: "My Report",
 *     content: [
 *       { type: "heading", text: "Section 1", level: 1 },
 *       { type: "paragraph", text: "Hello, Č, ö, ü, ñ -- all safe." },
 *       { type: "table", headers: ["Name", "Score"], rows: [["Alice", "95"]] },
 *       { type: "list", items: ["First", "Second"], ordered: true },
 *     ],
 *   });
 */

"use strict";

const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OUTPUT_DIR = process.env.PDF_OUTPUT_DIR || "/output";

const FONT_DIR = path.join(__dirname, "fonts");
const REGULAR_FONT_PATH = path.join(FONT_DIR, "DejaVuSans.ttf");
const BOLD_FONT_PATH = path.join(FONT_DIR, "DejaVuSans-Bold.ttf");

const DEFAULT_PAGE_SIZE = [595.28, 841.89]; // A4 in points
const DEFAULT_MARGINS = { top: 60, bottom: 60, left: 50, right: 50 };

const HEADING_SIZES = { 1: 22, 2: 17, 3: 14 };
const BODY_SIZE = 11;
const CODE_SIZE = 9.5;
const SMALL_SIZE = 8.5;
const LINE_HEIGHT_FACTOR = 1.45;
const HEADING_LINE_HEIGHT_FACTOR = 1.3;

const TABLE_CELL_PAD_X = 6;
const TABLE_CELL_PAD_Y = 5;
const TABLE_BORDER_COLOR = rgb(0.75, 0.75, 0.75);
const TABLE_HEADER_BG = rgb(0.93, 0.93, 0.93);

const PAGE_NUMBER_COLOR = rgb(0.5, 0.5, 0.5);
const SEPARATOR_COLOR = rgb(0.8, 0.8, 0.8);
const TEXT_COLOR = rgb(0, 0, 0);
const CODE_BG = rgb(0.96, 0.96, 0.96);

// ---------------------------------------------------------------------------
// Text measurement & wrapping
// ---------------------------------------------------------------------------

function measureText(text, font, size) {
  try {
    return font.widthOfTextAtSize(text, size);
  } catch {
    // If the font can't measure a character, estimate based on average width
    return text.length * size * 0.5;
  }
}

function wrapText(text, font, size, maxWidth) {
  const lines = [];
  const rawLines = String(text).split("\n");

  for (const rawLine of rawLines) {
    if (rawLine.trim() === "") {
      lines.push("");
      continue;
    }

    const words = rawLine.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine ? currentLine + " " + word : word;
      const width = measureText(candidate, font, size);

      if (width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = candidate;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Safe text drawing -- replaces unencodable characters instead of crashing
// ---------------------------------------------------------------------------

function safeDrawText(page, text, options) {
  try {
    page.drawText(text, options);
  } catch (e) {
    if (e && e.message && e.message.includes("cannot encode")) {
      // Replace unencodable characters with '?' and retry
      const cleaned = text.replace(/./gu, (ch) => {
        try {
          options.font.widthOfTextAtSize(ch, options.size || 12);
          return ch;
        } catch {
          return "?";
        }
      });
      page.drawText(cleaned, options);
    } else {
      throw e;
    }
  }
}

// ---------------------------------------------------------------------------
// Page management
// ---------------------------------------------------------------------------

class PageManager {
  constructor(pdfDoc, fonts, pageSize, margins) {
    this.pdfDoc = pdfDoc;
    this.fonts = fonts;
    this.pageSize = pageSize;
    this.margins = margins;
    this.pages = [];
    this.currentPage = null;
    this.cursorY = 0;
    this.pageCount = 0;
    this.contentWidth = pageSize[0] - margins.left - margins.right;
    this.contentTop = pageSize[1] - margins.top;
    this.contentBottom = margins.bottom + 20; // room for page number
  }

  addPage() {
    const page = this.pdfDoc.addPage(this.pageSize);
    this.currentPage = page;
    this.cursorY = this.contentTop;
    this.pageCount++;
    this.pages.push(page);
    return page;
  }

  ensureSpace(needed) {
    if (!this.currentPage || this.cursorY - needed < this.contentBottom) {
      this.addPage();
    }
  }

  advance(amount) {
    this.cursorY -= amount;
  }

  drawPageNumbers() {
    const font = this.fonts.regular;
    for (let i = 0; i < this.pages.length; i++) {
      const page = this.pages[i];
      const label = `${i + 1} / ${this.pages.length}`;
      const labelWidth = measureText(label, font, SMALL_SIZE);
      safeDrawText(page, label, {
        x: this.pageSize[0] / 2 - labelWidth / 2,
        y: this.margins.bottom,
        size: SMALL_SIZE,
        font,
        color: PAGE_NUMBER_COLOR,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Content block renderers
// ---------------------------------------------------------------------------

function renderHeading(pm, block) {
  const level = Math.min(Math.max(block.level || 1, 1), 3);
  const fontSize = HEADING_SIZES[level];
  const lineHeight = fontSize * HEADING_LINE_HEIGHT_FACTOR;
  const font = pm.fonts.bold;
  const text = String(block.text || "");
  const lines = wrapText(text, font, fontSize, pm.contentWidth);

  const totalHeight = lines.length * lineHeight + 8; // 8pt spacing above
  pm.ensureSpace(totalHeight);
  pm.advance(level === 1 ? 16 : 10); // extra space before heading

  for (const line of lines) {
    pm.ensureSpace(lineHeight);
    safeDrawText(pm.currentPage, line, {
      x: pm.margins.left,
      y: pm.cursorY,
      size: fontSize,
      font,
      color: TEXT_COLOR,
    });
    pm.advance(lineHeight);
  }

  pm.advance(4); // space after heading
}

function renderParagraph(pm, block) {
  const font = pm.fonts.regular;
  const text = String(block.text || "");
  const lineHeight = BODY_SIZE * LINE_HEIGHT_FACTOR;
  const lines = wrapText(text, font, BODY_SIZE, pm.contentWidth);

  for (const line of lines) {
    pm.ensureSpace(lineHeight);
    if (line !== "") {
      safeDrawText(pm.currentPage, line, {
        x: pm.margins.left,
        y: pm.cursorY,
        size: BODY_SIZE,
        font,
        color: TEXT_COLOR,
      });
    }
    pm.advance(lineHeight);
  }

  pm.advance(4);
}

function renderList(pm, block) {
  const font = pm.fonts.regular;
  const items = Array.isArray(block.items) ? block.items : [];
  const ordered = block.ordered === true;
  const lineHeight = BODY_SIZE * LINE_HEIGHT_FACTOR;
  const indent = 20;

  for (let i = 0; i < items.length; i++) {
    const bullet = ordered ? `${i + 1}. ` : "\u2022 ";
    const bulletWidth = measureText(bullet, font, BODY_SIZE);
    const itemLines = wrapText(
      String(items[i]),
      font,
      BODY_SIZE,
      pm.contentWidth - indent
    );

    for (let j = 0; j < itemLines.length; j++) {
      pm.ensureSpace(lineHeight);
      if (j === 0) {
        safeDrawText(pm.currentPage, bullet, {
          x: pm.margins.left + indent - bulletWidth,
          y: pm.cursorY,
          size: BODY_SIZE,
          font,
          color: TEXT_COLOR,
        });
      }
      if (itemLines[j] !== "") {
        safeDrawText(pm.currentPage, itemLines[j], {
          x: pm.margins.left + indent,
          y: pm.cursorY,
          size: BODY_SIZE,
          font,
          color: TEXT_COLOR,
        });
      }
      pm.advance(lineHeight);
    }
  }

  pm.advance(4);
}

function renderCode(pm, block) {
  const font = pm.fonts.regular; // DejaVu Sans is monospace-like enough for code
  const text = String(block.text || "");
  const lineHeight = CODE_SIZE * LINE_HEIGHT_FACTOR;
  const lines = text.split("\n");
  const padX = 8;
  const padY = 6;
  const totalHeight = lines.length * lineHeight + padY * 2;

  pm.ensureSpace(totalHeight);

  // Draw background rectangle
  const bgTop = pm.cursorY + CODE_SIZE;
  pm.currentPage.drawRectangle({
    x: pm.margins.left,
    y: bgTop - totalHeight,
    width: pm.contentWidth,
    height: totalHeight,
    color: CODE_BG,
  });

  pm.advance(padY);

  for (const line of lines) {
    pm.ensureSpace(lineHeight);
    if (line !== "") {
      safeDrawText(pm.currentPage, line, {
        x: pm.margins.left + padX,
        y: pm.cursorY,
        size: CODE_SIZE,
        font,
        color: TEXT_COLOR,
      });
    }
    pm.advance(lineHeight);
  }

  pm.advance(padY + 4);
}

function renderTable(pm, block) {
  const headers = Array.isArray(block.headers) ? block.headers : [];
  const rows = Array.isArray(block.rows) ? block.rows : [];
  const colCount = headers.length || (rows[0] ? rows[0].length : 0);
  if (colCount === 0) return;

  const font = pm.fonts.regular;
  const boldFont = pm.fonts.bold;
  const colWidth = pm.contentWidth / colCount;
  const rowHeight = BODY_SIZE + TABLE_CELL_PAD_Y * 2 + 2;

  // Helper: draw one row
  function drawRow(cells, y, isHeader) {
    const cellFont = isHeader ? boldFont : font;
    const startX = pm.margins.left;

    // Background for header
    if (isHeader) {
      pm.currentPage.drawRectangle({
        x: startX,
        y: y - rowHeight + BODY_SIZE + TABLE_CELL_PAD_Y,
        width: pm.contentWidth,
        height: rowHeight,
        color: TABLE_HEADER_BG,
      });
    }

    // Cell text
    for (let c = 0; c < colCount; c++) {
      const cellText = String(cells[c] != null ? cells[c] : "");
      // Truncate if too wide
      let displayText = cellText;
      const maxCellWidth = colWidth - TABLE_CELL_PAD_X * 2;
      if (measureText(displayText, cellFont, BODY_SIZE) > maxCellWidth) {
        while (
          displayText.length > 1 &&
          measureText(displayText + "\u2026", cellFont, BODY_SIZE) > maxCellWidth
        ) {
          displayText = displayText.slice(0, -1);
        }
        displayText += "\u2026";
      }

      safeDrawText(pm.currentPage, displayText, {
        x: startX + c * colWidth + TABLE_CELL_PAD_X,
        y: y,
        size: BODY_SIZE,
        font: cellFont,
        color: TEXT_COLOR,
      });
    }

    // Horizontal border below
    pm.currentPage.drawLine({
      start: { x: startX, y: y - TABLE_CELL_PAD_Y - 1 },
      end: { x: startX + pm.contentWidth, y: y - TABLE_CELL_PAD_Y - 1 },
      thickness: 0.5,
      color: TABLE_BORDER_COLOR,
    });
  }

  // Draw header
  if (headers.length > 0) {
    pm.ensureSpace(rowHeight);
    drawRow(headers, pm.cursorY, true);
    pm.advance(rowHeight);
  }

  // Draw data rows
  for (const row of rows) {
    pm.ensureSpace(rowHeight);
    const cells = Array.isArray(row) ? row : [row];
    drawRow(cells, pm.cursorY, false);
    pm.advance(rowHeight);
  }

  pm.advance(6);
}

function renderSeparator(pm) {
  pm.ensureSpace(20);
  pm.advance(8);
  const y = pm.cursorY;
  pm.currentPage.drawLine({
    start: { x: pm.margins.left, y },
    end: { x: pm.margins.left + pm.contentWidth, y },
    thickness: 0.75,
    color: SEPARATOR_COLOR,
  });
  pm.advance(12);
}

function renderSpacer(pm, block) {
  const height = Math.max(block.height || 12, 1);
  pm.ensureSpace(height);
  pm.advance(height);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function createPDF(options) {
  if (!options || typeof options !== "object") {
    throw new Error("createPDF expects an options object");
  }

  const filename = options.filename || "document.pdf";
  const pageSize = options.pageSize || DEFAULT_PAGE_SIZE;
  const margins = Object.assign({}, DEFAULT_MARGINS, options.margins);
  const content = Array.isArray(options.content) ? options.content : [];

  // Create document and register fontkit for Unicode support
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // Load and embed Unicode-capable fonts
  const regularFontBytes = fs.readFileSync(REGULAR_FONT_PATH);
  const boldFontBytes = fs.readFileSync(BOLD_FONT_PATH);
  const regularFont = await pdfDoc.embedFont(regularFontBytes, { subset: true });
  const boldFont = await pdfDoc.embedFont(boldFontBytes, { subset: true });

  const fonts = { regular: regularFont, bold: boldFont };

  // Set document metadata
  if (options.title) pdfDoc.setTitle(options.title);
  if (options.author) pdfDoc.setAuthor(options.author);

  // Page manager handles pagination
  const pm = new PageManager(pdfDoc, fonts, pageSize, margins);
  pm.addPage();

  // Render title block if provided
  if (options.title) {
    renderHeading(pm, { type: "heading", text: options.title, level: 1 });
    renderSeparator(pm);
  }

  // Render each content block
  for (const block of content) {
    if (!block || !block.type) continue;

    switch (block.type) {
      case "heading":
        renderHeading(pm, block);
        break;
      case "paragraph":
        renderParagraph(pm, block);
        break;
      case "list":
        renderList(pm, block);
        break;
      case "table":
        renderTable(pm, block);
        break;
      case "code":
        renderCode(pm, block);
        break;
      case "separator":
        renderSeparator(pm);
        break;
      case "spacer":
        renderSpacer(pm, block);
        break;
      default:
        // Treat unknown types as paragraphs
        if (block.text) renderParagraph(pm, block);
        break;
    }
  }

  // Add page numbers
  pm.drawPageNumbers();

  // Save to /output
  const pdfBytes = await pdfDoc.save();
  const outputPath = path.join(OUTPUT_DIR, path.basename(filename));
  fs.writeFileSync(outputPath, pdfBytes);

  return { filename: path.basename(filename), size: pdfBytes.length, path: outputPath };
}

module.exports = createPDF;
