const DOCUMENT_FOCUS_RE =
  /\b(document|doc|file|pdf|attachment|attached|resume|cv|recipe|job description|contract|report)\b/i;
const USER_CORRECTION_RE =
  /\b(actually|instead|rather than|use the previous|use the earlier|change it to|revise this|refine this|update this|fix this|correct this|replace that|not that one)\b/i;

export function isDocumentFocusedTurn(
  message: string,
  attachmentIds: string[] = [],
): boolean {
  return attachmentIds.length > 0 || DOCUMENT_FOCUS_RE.test(message);
}

export function hasRecentUserCorrectionSignal(
  message: string | null | undefined,
): boolean {
  if (!message?.trim()) return false;
  return USER_CORRECTION_RE.test(message);
}
