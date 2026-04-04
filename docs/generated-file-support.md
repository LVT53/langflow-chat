# Generated File Support

This is the current target support matrix for AlfyAI generated files.

## Should Support Now

- `.txt` plain text
- `.md` Markdown
- `.csv` comma-separated data
- `.json` structured JSON exports
- `.html` standalone HTML reports
- `.xml` structured XML documents
- `.svg` vector graphics
- `.rtf` rich text files
- `.css` stylesheet files
- `.js` JavaScript source files
- `.py` Python source files
- `.xlsx` Excel workbooks via `exceljs`
- `.pdf` PDF documents via `pdf-lib`
- `.pptx` PowerPoint presentations via `pptxgenjs`
- `.docx` Word documents via `docx`
- `.odt` OpenDocument text files via `jszip` packaging

## Good Next Candidates

- `.png` chart and image exports
- `.tsv` tab-separated data
- `.zip` bundled multi-file exports

## Runtime Notes

- Use `language: "python"` for plain text and text-like files such as `.txt`, `.md`, `.csv`, `.json`, `.html`, `.xml`, `.svg`, `.rtf`, `.css`, `.js`, and `.py`.
- Use `language: "javascript"` for `.xlsx`, `.pdf`, `.pptx`, and `.docx`.
- Use `language: "javascript"` plus `jszip` when building `.odt`.
- Preview libraries such as `pdfjs-dist` and `pptxviewjs` are for viewing files in the UI, not generating them.
