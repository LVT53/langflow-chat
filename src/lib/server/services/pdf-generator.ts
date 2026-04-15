import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import { existsSync } from 'node:fs';

/**
 * AlfyAI Logo SVG - Crown mark only, compact
 */
const ALFYAI_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 112" style="width:20px;height:22px;display:block;">
  <path fill="none" stroke="#C15F3C" stroke-width="4.2" stroke-linecap="round" d="M50 19 C46 40 36 64 24 88"/>
  <path fill="none" stroke="#C15F3C" stroke-width="4.2" stroke-linecap="round" d="M50 19 C54 40 64 64 76 88"/>
  <line x1="27" y1="57" x2="73" y2="57" stroke="#C15F3C" stroke-width="2.2" stroke-linecap="round"/>
  <line x1="27" y1="52" x2="27" y2="62" stroke="#C15F3C" stroke-width="1.8" stroke-linecap="round" opacity="0.75"/>
  <line x1="73" y1="52" x2="73" y2="62" stroke="#C15F3C" stroke-width="1.8" stroke-linecap="round" opacity="0.75"/>
  <line x1="14" y1="90" x2="36" y2="90" stroke="#C15F3C" stroke-width="3.2" stroke-linecap="round"/>
  <line x1="64" y1="90" x2="86" y2="90" stroke="#C15F3C" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="50" cy="19" r="3.5" fill="#C15F3C"/>
</svg>`;

/**
 * Header template for Playwright PDF generation.
 * Uses inline styles - external CSS is not inherited in header/footer.
 */
const HEADER_TEMPLATE = `
<div style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 0;font-family:'Nimbus Sans L',system-ui,sans-serif;">
  ${ALFYAI_LOGO_SVG}
  <span style="font-size:11px;font-weight:500;color:#C15F3C;letter-spacing:0.05em;">AlfyAI</span>
</div>
`;

/**
 * Footer template for Playwright PDF generation.
 * Shows page numbers using Playwright's built-in classes.
 */
const FOOTER_TEMPLATE = `
<div style="width:100%;display:flex;align-items:center;justify-content:center;padding:10px 0;font-family:'Nimbus Sans L',system-ui,sans-serif;">
  <span style="font-size:12px;color:#6B6B6B;letter-spacing:0.02em;">
    <span class="pageNumber"></span> / <span class="totalPages"></span>
  </span>
</div>
`;
const SYSTEM_CHROMIUM_PATHS = [
	'/usr/bin/chromium-browser',
	'/usr/bin/chromium',
	'/usr/bin/google-chrome',
	'/usr/bin/google-chrome-stable'
] as const;

const LAUNCH_ARGS = [
	'--disable-local-file-access',
	'--no-sandbox',
	'--disable-setuid-sandbox',
	'--disable-dev-shm-usage'
];

/**
 * Finds the first existing system Chromium binary.
 */
function findSystemChromium(): string | null {
	for (const path of SYSTEM_CHROMIUM_PATHS) {
		if (existsSync(path)) return path;
	}
	return null;
}

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
			args: LAUNCH_ARGS
		});

		const context = await browser.newContext();
		const page = await context.newPage();

		await page.setContent(html, { waitUntil: 'load' });

		// Generate PDF with A4 format, proper margins, and header/footer templates
		const pdfBuffer = await page.pdf({
			format: 'A4',
			printBackground: true,
			displayHeaderFooter: true,
			headerTemplate: HEADER_TEMPLATE,
			footerTemplate: FOOTER_TEMPLATE,
			margin: {
				top: '80px',
				bottom: '70px',
				left: '50px',
				right: '50px'
			}
		});

		await context.close();

		return Buffer.from(pdfBuffer);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		// Fallback to system Chromium if Playwright's bundled binary is missing
		if (message.includes('Executable doesn\'t exist')) {
			const systemPath = findSystemChromium();
			if (systemPath) {
				console.warn(
					`[PDF_GENERATOR] Playwright Chromium not found, falling back to system Chromium at: ${systemPath}`
				);
				try {
					browser = await chromium.launch({
						executablePath: systemPath,
						args: LAUNCH_ARGS
					});

					const context = await browser.newContext();
					const page = await context.newPage();

					await page.setContent(html, { waitUntil: 'load' });

					const pdfBuffer = await page.pdf({
						format: 'A4',
						printBackground: true,
						displayHeaderFooter: true,
						headerTemplate: HEADER_TEMPLATE,
						footerTemplate: FOOTER_TEMPLATE,
						margin: {
							top: '80px',
							bottom: '70px',
							left: '50px',
							right: '50px'
						}
					});

					await context.close();
					return Buffer.from(pdfBuffer);
				} catch (fallbackError) {
					const fallbackMessage =
						fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
					throw new Error(
						`PDF generation failed with both Playwright and system Chromium: ${fallbackMessage}`
					);
				}
			}
		}

		throw new Error(`PDF generation failed: ${message}`);
	} finally {
		if (browser) {
			await browser.close().catch(() => {
				// Ignore close errors to prevent unhandled rejections
			});
		}
	}
}
