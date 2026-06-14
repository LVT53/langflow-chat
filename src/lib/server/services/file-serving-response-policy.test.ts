import { describe, expect, it } from "vitest";
import {
	applyFileServingRange,
	buildFileServingResponseHeaders,
} from "./file-serving-response-policy";

describe("file-serving response policy", () => {
	function baseHeaders(contentLength: number) {
		return buildFileServingResponseHeaders({
			mode: "preview",
			contentLength,
			contentType: "text/plain",
			filename: "notes.txt",
		});
	}

	it("returns partial response bytes in a detached backing buffer", () => {
		const source = Buffer.from("hello world");
		const result = applyFileServingRange({
			body: source,
			rangeHeader: "bytes=6-10",
			headers: baseHeaders(source.length),
		});

		expect(result.status).toBe(206);
		expect(Buffer.from(result.body).toString()).toBe("world");
		expect(result.body.byteLength).toBe(5);
		expect(result.body.buffer).not.toBe(source.buffer);
		expect(result.headers["Content-Length"]).toBe("5");
		expect(result.headers["Content-Range"]).toBe("bytes 6-10/11");
	});

	it("serves open-ended and suffix byte ranges", () => {
		const source = Buffer.from("hello world");

		const openEnded = applyFileServingRange({
			body: source,
			rangeHeader: "bytes=6-",
			headers: baseHeaders(source.length),
		});
		const suffix = applyFileServingRange({
			body: source,
			rangeHeader: "bytes=-5",
			headers: baseHeaders(source.length),
		});

		expect(openEnded.status).toBe(206);
		expect(Buffer.from(openEnded.body).toString()).toBe("world");
		expect(openEnded.headers["Content-Range"]).toBe("bytes 6-10/11");
		expect(suffix.status).toBe(206);
		expect(Buffer.from(suffix.body).toString()).toBe("world");
		expect(suffix.headers["Content-Range"]).toBe("bytes 6-10/11");
	});

	it("returns 416 for unsatisfiable ranges including empty files", () => {
		const beyondEnd = applyFileServingRange({
			body: Buffer.from("hello"),
			rangeHeader: "bytes=99-120",
			headers: baseHeaders(5),
		});
		const emptyFile = applyFileServingRange({
			body: new Uint8Array(0),
			rangeHeader: "bytes=0-0",
			headers: baseHeaders(0),
		});

		expect(beyondEnd.status).toBe(416);
		expect(beyondEnd.body.byteLength).toBe(0);
		expect(beyondEnd.headers["Content-Length"]).toBe("0");
		expect(beyondEnd.headers["Content-Range"]).toBe("bytes */5");
		expect(emptyFile.status).toBe(416);
		expect(emptyFile.headers["Content-Range"]).toBe("bytes */0");
	});

	it("ignores malformed, huge, and unsupported multipart ranges", () => {
		const source = Buffer.from("hello");
		for (const rangeHeader of [
			"bytes=abc",
			"bytes=4-2",
			"bytes=999999999999999999999-",
			"bytes=0-1,3-4",
		]) {
			const result = applyFileServingRange({
				body: source,
				rangeHeader,
				headers: baseHeaders(source.length),
			});

			expect(result.status).toBe(200);
			expect(Buffer.from(result.body).toString()).toBe("hello");
			expect(result.headers["Content-Range"]).toBeUndefined();
		}
	});
});
