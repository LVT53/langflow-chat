export type {
	LinkedContextSourceIdentityInput,
	WorkingDocumentArtifactIdentity,
	WorkingDocumentFamilyIdentity,
	WorkingDocumentIdentity,
	WorkingDocumentIdentityInput,
	WorkingDocumentPreviewIdentity,
} from "$lib/services/working-document-identity";
export {
	isPromptReadyWorkingDocument,
	linkedContextSourceArtifactIds,
	linkedContextSourcesOverlap,
	resolveWorkingDocumentIdentity,
	toCanonicalLinkedContextSource,
	workingDocumentMatchesLinkedContextSource,
} from "$lib/services/working-document-identity";
