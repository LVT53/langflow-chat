# Generated File Support

AlfyAI provides two complementary tools for generating downloadable files. Choose the right tool based on your use case.

## Dual-Tool Architecture

### 1. `export_document` Tool (PDF and Static Documents)

Use this tool for creating polished, presentation-ready documents such as reports, brochures, fact sheets, and white papers.

**When to use:**
- PDF output is required
- Rich formatting with cover pages is needed
- Callouts, styled sections, or embedded images are desired
- Document layout and typography matter

**How it works:**
- Write content in **Markdown** with YAML frontmatter for metadata
- The Markdown is rendered to PDF using **Playwright** (headless browser engine)
- Supports professional typography and layout

**Markdown syntax supported:**
- **YAML frontmatter** for cover page metadata:
  ```yaml
  ---
  title: Quarterly Report
  subtitle: Q3 2024 Performance
  author: Finance Team
  date: 2024-10-15
  cover: true
  ---
  ```
- **Obsidian-style callouts** for highlighted sections:
  - `> [!info] Information callout`
  - `> [!warning] Warning callout`
  - `> [!tip] Tip callout`
  - `> [!note] Note callout`
- **Embedded images** via `image_search` tool:
  - Search for real-world images using the `image_search` tool
  - Embed them as `![alt text](image_url)` in Markdown

**Example workflow:**
1. Use `image_search` to find relevant images
2. Write Markdown with frontmatter and callouts
3. Call `export_document` with the Markdown content
4. The tool returns a rendered PDF

### 2. `generate_file` Tool (Data Science and Python Scripts)

Use this tool for data processing, analysis, and programmatic file generation.

**When to use:**
- CSV data manipulation or analysis
- Excel workbook creation with complex formatting
- Data transformation or extraction tasks
- Any Python-based file generation

**How it works:**
- Write Python code that processes data and writes files
- Code runs in a sandboxed environment
- Output files are captured and made available for download

**Python libraries available:**
- **Pandas**: Data analysis, CSV reading/writing, data transformation
- **openpyxl**: Advanced Excel formatting, formulas, styling
- Standard library: `json`, `csv`, `io`, `datetime`, etc.

**Usage:**
```python
# Example: Create an Excel file with Pandas and openpyxl
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

# Your data processing code here
# Write final output to /output/filename.xlsx
```

**Important:** Always write output files to `/output/` directory or no file will be created.

## File Format Support Matrix

### Via `export_document` (Markdown → PDF)

| Format | Support | Notes |
|--------|---------|-------|
| `.pdf` | Full | Primary output format via Playwright rendering |

### Via `generate_file` (Python)

| Format | Support | Notes |
|--------|---------|-------|
| `.txt` | Full | Plain text output |
| `.md` | Full | Markdown files |
| `.csv` | Full | Via Pandas or csv module |
| `.json` | Full | Structured data exports |
| `.html` | Full | Standalone HTML reports |
| `.xml` | Full | Structured XML documents |
| `.svg` | Full | Vector graphics |
| `.rtf` | Full | Rich text files |
| `.css` | Full | Stylesheet files |
| `.js` | Full | JavaScript source files |
| `.py` | Full | Python source files |
| `.xlsx` | Full | Excel workbooks via openpyxl |

### Legacy JavaScript Runtime (still available)

| Format | Support | Notes |
|--------|---------|-------|
| `.pptx` | Full | PowerPoint via `pptxgenjs` |
| `.docx` | Full | Word documents via `docx` |
| `.odt` | Full | OpenDocument via `jszip` |

## Choosing the Right Tool

| Use Case | Recommended Tool | Why |
|----------|------------------|-----|
| Business report with charts | `export_document` | Better layout, cover pages, embedded images |
| Data analysis export | `generate_file` | Python data processing power |
| CSV transformation | `generate_file` | Pandas is ideal for this |
| Excel with formulas | `generate_file` | openpyxl supports formulas |
| Fact sheet with images | `export_document` | Image embedding via Markdown |
| Multi-slide presentation | `generate_file` (JS) | `pptxgenjs` for PowerPoint |

## Runtime Notes

- **Playwright PDF rendering**: The `export_document` tool uses Playwright to render HTML/Markdown to PDF. This provides professional typography, automatic page breaks, and print-quality output.
- **Sandbox execution**: The `generate_file` tool runs in a Docker sandbox with no network access for security.
- **File output**: Both tools require writing to specific output locations (`/output/` for `generate_file`, internal handling for `export_document`).
- **Error handling**: If generation fails, inspect the error, fix the code, and retry once. Do not create fallback error files.
- **Preview libraries**: Libraries like `pdfjs-dist` and `pptxviewjs` are for UI preview only, not file generation.

## Good Next Candidates

- `.png` chart and image exports
- `.tsv` tab-separated data
- `.zip` bundled multi-file exports
