import { chromium } from 'playwright';
import type { Browser } from 'playwright';

/**
 * Converts an HTML string to a PDF buffer using Playwright Chromium.
 *
 * Security:
 * - Uses --disable-local-file-access to prevent SSRF via malicious image tags
 * - Uses --no-sandbox and --disable-setuid-sandbox for container compatibility
 * - Uses --disable-dev-shm-usage to avoid shared memory issues
 *
 * @param html - Raw HTML string to convert
 * @returns Promise resolving to a PDF Buffer
 */
export async function generatePdfFromHtml(html: string): Promise<Buffer> {
	let browser: Browser | null = null;

	try {
		browser = await chromium.launch({
			args: [
				'--disable-local-file-access',
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-dev-shm-usage'
			]
		});

		const context = await browser.newContext();
		const page = await context.newPage();

		// Set content and wait for network idle so remote images load
		await page.setContent(html, { waitUntil: 'networkidle' });

		// Generate PDF with A4 format and proper margins
		const pdfBuffer = await page.pdf({
			format: 'A4',
			printBackground: true,
			margin: {
				top: '60px',
				bottom: '60px',
				left: '50px',
				right: '50px'
			}
		});

		await context.close();

		return Buffer.from(pdfBuffer);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`PDF generation failed: ${message}`);
	} finally {
		if (browser) {
			await browser.close().catch(() => {
				// Ignore close errors to prevent unhandled rejections
			});
		}
	}
}
