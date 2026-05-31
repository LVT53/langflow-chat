export type PreviewFileType =
	| "pdf"
	| "docx"
	| "xlsx"
	| "pptx"
	| "odt"
	| "image"
	| "html"
	| "text"
	| "unsupported";

const TEXT_EXTENSIONS = new Set([
	"txt",
	"md",
	"markdown",
	"csv",
	"json",
	"html",
	"htm",
	"xml",
	"rtf",
	"css",
	"scss",
	"sass",
	"less",
	"js",
	"mjs",
	"cjs",
	"jsx",
	"py",
	"ts",
	"tsx",
	"yaml",
	"yml",
	"sh",
	"bash",
	"zsh",
	"sql",
	"graphql",
	"gql",
	"toml",
	"ini",
	"env",
	"conf",
	"log",
	"rb",
	"rs",
	"go",
	"java",
	"kt",
	"kts",
	"swift",
	"cs",
	"cpp",
	"cxx",
	"cc",
	"c",
	"h",
	"hpp",
	"php",
	"r",
]);

const GENERIC_MIME_TYPES = new Set([
	"application/octet-stream",
	"application/download",
]);

const IMAGE_EXTENSIONS = new Set([
	"jpg",
	"jpeg",
	"jfif",
	"png",
	"gif",
	"webp",
	"svg",
	"bmp",
	"tif",
	"tiff",
	"heic",
	"heif",
	"avif",
]);

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
	pdf: "application/pdf",
	doc: "application/msword",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	xls: "application/vnd.ms-excel",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	ppt: "application/vnd.ms-powerpoint",
	pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	odt: "application/vnd.oasis.opendocument.text",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
	bmp: "image/bmp",
	tif: "image/tiff",
	tiff: "image/tiff",
	heic: "image/heic",
	heif: "image/heif",
	avif: "image/avif",
	txt: "text/plain",
	md: "text/markdown",
	markdown: "text/markdown",
	csv: "text/csv",
	html: "text/html",
	htm: "text/html",
	css: "text/css",
	scss: "text/x-scss",
	sass: "text/x-sass",
	less: "text/x-less",
	js: "application/javascript",
	mjs: "application/javascript",
	cjs: "application/javascript",
	jsx: "text/jsx",
	json: "application/json",
	xml: "application/xml",
	rtf: "application/rtf",
	py: "text/x-python",
	ts: "application/typescript",
	tsx: "text/tsx",
	yaml: "application/yaml",
	yml: "application/yaml",
	sh: "application/x-sh",
	bash: "application/x-sh",
	zsh: "application/x-sh",
	sql: "application/sql",
	graphql: "application/graphql",
	gql: "application/graphql",
	toml: "application/toml",
	ini: "text/plain",
	env: "text/plain",
	conf: "text/plain",
	log: "text/plain",
	rb: "text/x-ruby",
	rs: "text/rust",
	go: "text/x-go",
	java: "text/x-java-source",
	kt: "text/x-kotlin",
	kts: "text/x-kotlin",
	swift: "text/x-swift",
	cs: "text/x-csharp",
	cpp: "text/x-c++src",
	cxx: "text/x-c++src",
	cc: "text/x-c++src",
	c: "text/x-csrc",
	h: "text/x-csrc",
	hpp: "text/x-c++src",
	php: "application/x-httpd-php",
	r: "text/x-r-source",
	zip: "application/zip",
};

function getExtension(name: string): string | null {
	const ext = name.split(".").pop()?.toLowerCase().trim();
	return ext ? ext : null;
}

function normalizeMimeType(mimeType: string | null): string | null {
	const normalized = mimeType?.split(";")[0]?.trim().toLowerCase() ?? "";
	return normalized || null;
}

function isGenericMimeType(mimeType: string | null): boolean {
	const normalized = normalizeMimeType(mimeType);
	return !normalized || GENERIC_MIME_TYPES.has(normalized);
}

export function getPreviewContentType(
	filename: string,
	mimeType: string | null,
): string {
	const normalizedMimeType = normalizeMimeType(mimeType);
	if (!isGenericMimeType(normalizedMimeType)) return normalizedMimeType;
	const ext = getExtension(filename);
	if (!ext) return "application/octet-stream";
	return EXTENSION_CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export function determinePreviewFileType(
	mimeType: string | null,
	filename: string,
): PreviewFileType {
	const ext = getExtension(filename);
	const mime = normalizeMimeType(mimeType);

	if (!mime) {
		if (ext === "pdf") return "pdf";
		if (ext === "docx") return "docx";
		if (ext === "xlsx") return "xlsx";
		if (ext === "pptx") return "pptx";
		if (ext === "odt") return "odt";
		if (ext && IMAGE_EXTENSIONS.has(ext)) return "image";
		if (ext === "html" || ext === "htm") return "html";
		if (ext && TEXT_EXTENSIONS.has(ext)) return "text";
		return "unsupported";
	}

	if (ext === "pdf") return "pdf";
	if (ext === "docx") return "docx";
	if (ext === "xlsx") return "xlsx";
	if (ext === "pptx") return "pptx";
	if (ext === "odt") return "odt";
	if (ext && IMAGE_EXTENSIONS.has(ext)) return "image";
	if (ext === "html" || ext === "htm") return "html";

	if (mime.includes("pdf")) return "pdf";
	if (mime.includes("wordprocessingml")) return "docx";
	if (mime.includes("spreadsheetml")) return "xlsx";
	if (mime.includes("presentationml")) return "pptx";
	if (mime === "application/vnd.oasis.opendocument.text") return "odt";
	if (mime.startsWith("image/")) return "image";
	if (mime === "text/html") return "html";
	if (
		mime.startsWith("text/") ||
		mime === "application/json" ||
		mime === "application/csv" ||
		mime === "application/xml" ||
		mime === "application/rtf" ||
		mime === "application/javascript" ||
		mime === "text/javascript" ||
		mime === "text/jsx" ||
		mime === "text/x-python" ||
		mime === "application/typescript" ||
		mime === "text/tsx" ||
		mime === "application/yaml" ||
		mime === "application/x-sh" ||
		mime === "text/x-shellscript" ||
		mime === "application/sql" ||
		mime === "application/graphql" ||
		mime === "application/toml" ||
		mime === "text/x-scss" ||
		mime === "text/x-sass" ||
		mime === "text/x-less" ||
		mime === "text/x-ruby" ||
		mime === "text/rust" ||
		mime === "text/x-go" ||
		mime === "text/x-java-source" ||
		mime === "text/x-kotlin" ||
		mime === "text/x-swift" ||
		mime === "text/x-csharp" ||
		mime === "text/x-c++src" ||
		mime === "text/x-csrc" ||
		mime === "application/x-httpd-php" ||
		mime === "text/x-r-source"
	) {
		return "text";
	}

	if (ext && TEXT_EXTENSIONS.has(ext)) return "text";
	return "unsupported";
}

export function isPreviewableFile(
	mimeType: string | null,
	filename: string,
): boolean {
	return determinePreviewFileType(mimeType, filename) !== "unsupported";
}

export function getPreviewLanguage(
	mimeType: string | null,
	filename: string,
): string | undefined {
	const ext = getExtension(filename);

	if (ext === "py") return "python";
	if (ext === "js" || ext === "mjs" || ext === "cjs") return "javascript";
	if (ext === "jsx") return "jsx";
	if (ext === "ts") return "typescript";
	if (ext === "tsx") return "tsx";
	if (ext === "json") return "json";
	if (ext === "html" || ext === "htm") return "html";
	if (ext === "css") return "css";
	if (ext === "scss") return "scss";
	if (ext === "sass") return "sass";
	if (ext === "less") return "less";
	if (ext === "md" || ext === "markdown") return "markdown";
	if (ext === "xml" || ext === "svg") return "xml";
	if (ext === "yaml" || ext === "yml") return "yaml";
	if (ext === "sh" || ext === "bash" || ext === "zsh") return "bash";
	if (ext === "sql") return "sql";
	if (ext === "graphql" || ext === "gql") return "graphql";
	if (ext === "toml") return "toml";
	if (ext === "ini" || ext === "env" || ext === "conf") return "ini";
	if (ext === "rb") return "ruby";
	if (ext === "rs") return "rust";
	if (ext === "go") return "go";
	if (ext === "java") return "java";
	if (ext === "kt" || ext === "kts") return "kotlin";
	if (ext === "swift") return "swift";
	if (ext === "cs") return "csharp";
	if (ext === "cpp" || ext === "cxx" || ext === "cc" || ext === "hpp")
		return "cpp";
	if (ext === "c" || ext === "h") return "c";
	if (ext === "php") return "php";
	if (ext === "r") return "r";

	const mime = mimeType?.toLowerCase() ?? null;
	if (mime === "application/json") return "json";
	if (mime === "application/xml") return "xml";
	if (mime === "text/html") return "html";
	if (mime === "text/css") return "css";
	if (mime === "text/x-scss") return "scss";
	if (mime === "text/x-sass") return "sass";
	if (mime === "text/x-less") return "less";
	if (mime === "application/javascript" || mime === "text/javascript")
		return "javascript";
	if (mime === "text/jsx") return "jsx";
	if (mime === "text/markdown") return "markdown";
	if (mime === "text/x-python") return "python";
	if (mime === "application/typescript") return "typescript";
	if (mime === "text/tsx") return "tsx";
	if (mime === "application/yaml") return "yaml";
	if (mime === "application/x-sh" || mime === "text/x-shellscript")
		return "bash";
	if (mime === "application/sql") return "sql";
	if (mime === "application/graphql") return "graphql";
	if (mime === "application/toml") return "toml";
	if (mime === "text/x-ruby") return "ruby";
	if (mime === "text/rust") return "rust";
	if (mime === "text/x-go") return "go";
	if (mime === "text/x-java-source") return "java";
	if (mime === "text/x-kotlin") return "kotlin";
	if (mime === "text/x-swift") return "swift";
	if (mime === "text/x-csharp") return "csharp";
	if (mime === "text/x-c++src") return "cpp";
	if (mime === "text/x-csrc") return "c";
	if (mime === "application/x-httpd-php") return "php";
	if (mime === "text/x-r-source") return "r";

	return undefined;
}
