import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import { existsSync } from 'node:fs';

/**
 * Common system Chromium paths checked in order when Playwright's bundled
 * Chromium is not available (e.g. Almalinux/RHEL servers missing deps).
 */
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

					await page.setContent(html, { waitUntil: 'networkidle' });

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
