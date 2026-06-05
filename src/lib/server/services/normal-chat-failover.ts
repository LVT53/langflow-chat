export {
	isModelRateLimitError,
	isModelTimeoutError,
	resolveModelStreamFirstOutputTimeoutMs,
	resolveModelTimeoutFailoverTargetModelId,
	resolveProviderRateLimitFallback,
} from "./normal-chat-model/failover";
