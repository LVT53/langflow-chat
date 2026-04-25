export function buildOpenAICompatibleUrl(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (/\/v1$/i.test(base) && normalizedPath.toLowerCase().startsWith('/v1/')) {
    return `${base}${normalizedPath.slice('/v1'.length)}`;
  }

  return `${base}${normalizedPath}`;
}
