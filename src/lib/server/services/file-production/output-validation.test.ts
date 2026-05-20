import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { validateXlsxBytes } from "./output-validation";

async function buildMinimalXlsxZip(extraEntries = 0): Promise<Buffer> {
	const zip = new JSZip();
	zip.file("[Content_Types].xml", "<Types></Types>");
	zip.file("_rels/.rels", "<Relationships></Relationships>");
	zip.file("xl/workbook.xml", "<workbook></workbook>");
	zip.file("xl/_rels/workbook.xml.rels", "<Relationships></Relationships>");
	zip.file("xl/worksheets/sheet1.xml", "<worksheet></worksheet>");
	for (let index = 0; index < extraEntries; index += 1) {
		zip.file(`xl/sharedStrings/${index}.xml`, "<sst></sst>");
	}
	return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("file-production output validation", () => {
	it("rejects XLSX validation inputs above the byte ceiling before loading the ZIP", async () => {
		await expect(
			validateXlsxBytes(Buffer.alloc(5), { maxBytes: 4 }),
		).resolves.toMatchObject({
			ok: false,
			code: "xlsx_output_too_large",
		});
	});

	it("rejects XLSX packages with too many ZIP entries", async () => {
		const content = await buildMinimalXlsxZip(3);

		await expect(
			validateXlsxBytes(content, { maxZipEntries: 4 }),
		).resolves.toMatchObject({
			ok: false,
			code: "xlsx_output_too_complex",
		});
	});
});
