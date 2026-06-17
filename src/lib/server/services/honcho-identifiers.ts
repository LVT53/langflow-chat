import { createHash } from "node:crypto";
import { getConfig } from "../config-store";

const HONCHO_PEER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const HONCHO_SAFE_ID_MAX_LENGTH = 48;
const HONCHO_ID_HASH_LENGTH = 32;

function normalizePeerIdFragment(rawId: string): string {
	const trimmed = rawId.trim();
	if (
		trimmed &&
		trimmed.length <= HONCHO_SAFE_ID_MAX_LENGTH &&
		HONCHO_PEER_ID_PATTERN.test(trimmed)
	) {
		return trimmed;
	}

	const digest = createHash("sha256").update(rawId).digest("hex").slice(0, 32);
	return `h_${digest}`;
}

function buildHonchoPeerSeed(userId: string, version: number): string {
	return version > 0 ? `${userId}_v${version}` : userId;
}

function buildNamespacedHonchoId(
	prefix: "u" | "a" | "s",
	parts: string[],
): string {
	const config = getConfig();
	const digest = createHash("sha256")
		.update([config.honchoIdentityNamespace, ...parts].join("\0"))
		.digest("hex")
		.slice(0, HONCHO_ID_HASH_LENGTH);
	return `${prefix}_${digest}`;
}

export function getLegacyHonchoUserPeerId(
	userId: string,
	version: number,
): string {
	return normalizePeerIdFragment(buildHonchoPeerSeed(userId, version));
}

export function getLegacyHonchoAssistantPeerId(
	userId: string,
	version: number,
): string {
	return `assistant_${normalizePeerIdFragment(buildHonchoPeerSeed(userId, version))}`;
}

export function getHonchoUserPeerId(userId: string, version = 0): string {
	return buildNamespacedHonchoId("u", ["user", userId, String(version)]);
}

export function getHonchoAssistantPeerId(userId: string, version = 0): string {
	return buildNamespacedHonchoId("a", ["assistant", userId, String(version)]);
}

export function getHonchoSessionId(
	userId: string,
	conversationId: string,
	version = 0,
): string {
	return buildNamespacedHonchoId("s", [
		"session",
		userId,
		String(version),
		conversationId,
	]);
}
