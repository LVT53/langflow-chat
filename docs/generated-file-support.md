# Generated File Support

This is the current target support matrix for AlfyAI generated files.

## Should Support Now

- `.txt` plain text
- `.md` Markdown
- `.csv` comma-separated data
- `.json` structured JSON exports
- `.html` standalone HTML reports
- `.xlsx` Excel workbooks via `exceljs`
- `.pdf` PDF documents via `pdf-lib`
- `.pptx` PowerPoint presentations via `pptxgenjs`

## Good Next Candidates

- `.docx` Word documents
- `.svg` vector charts and diagrams
- `.png` chart and image exports
- `.tsv` tab-separated data
- `.xml` structured exchange documents
- `.zip` bundled multi-file exports

## Runtime Notes

- Use `language: "python"` for plain text, CSV, JSON, HTML, and other outputs that only need the Python standard library.
- Use `language: "javascript"` for `.xlsx`, `.pdf`, and `.pptx`.
- Preview libraries such as `pdfjs-dist` and `pptxviewjs` are for viewing files in the UI, not generating them.
