import { createHash } from "node:crypto";
import type { MemoryProfileCategory, MemoryProfileScope } from "./types";

export const ITEM_KEY_VERSION = "memory-profile-item:v1";

export function toScopeColumns(scope: MemoryProfileScope): {
	scopeType: string;
	scopeId: string;
} {
	return {
		scopeType: scope.type,
		scopeId: scope.type === "global" ? "" : scope.id,
	};
}

export function normalizeRememberedStatement(statement: string): string {
	return statement.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeExplicitItemKey(itemKey: string): string {
	const normalized = itemKey.trim();
	if (!normalized) {
		throw new Error("Memory profile item key cannot be empty.");
	}
	return normalized;
}

export function deriveMemoryProfileItemKey(params: {
	category: MemoryProfileCategory;
	scope: MemoryProfileScope;
	statement: string;
}): string {
	const scope = toScopeColumns(params.scope);
	const normalizedStatement = normalizeRememberedStatement(params.statement);
	const digest = createHash("sha256")
		.update(
			[
				params.category,
				scope.scopeType,
				scope.scopeId,
				normalizedStatement,
			].join("\u001f"),
		)
		.digest("hex")
		.slice(0, 32);

	return `${ITEM_KEY_VERSION}:${params.category}:${scope.scopeType}:${scope.scopeId || "global"}:${digest}`;
}

export function resolveMemoryProfileItemKey(params: {
	category: MemoryProfileCategory;
	scope: MemoryProfileScope;
	statement: string;
	itemKey?: string;
	slotKey?: string;
}): string {
	if (params.itemKey !== undefined && params.slotKey !== undefined) {
		const itemKey = normalizeExplicitItemKey(params.itemKey);
		const slotKey = normalizeExplicitItemKey(params.slotKey);
		if (itemKey !== slotKey) {
			throw new Error("Memory profile itemKey and slotKey must match.");
		}
		return itemKey;
	}
	if (params.itemKey !== undefined) {
		return normalizeExplicitItemKey(params.itemKey);
	}
	if (params.slotKey !== undefined) {
		return normalizeExplicitItemKey(params.slotKey);
	}
	return deriveMemoryProfileItemKey(params);
}

export function fromScopeColumns(
	scopeType: string,
	scopeId: string,
): MemoryProfileScope {
	if (scopeType === "project") return { type: "project", id: scopeId };
	if (scopeType === "conversation")
		return { type: "conversation", id: scopeId };
	if (scopeType === "document") return { type: "document", id: scopeId };
	return { type: "global" };
}

export function stableMemoryMaintenanceDigest(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 24);
}
