/**
 * Shared defaults for model execution across Normal Chat, Control Model,
 * ChatGPT Summarizer, and Title Generator paths.
 *
 * Changing a value here updates it for all consumers, preventing drift.
 */

/** Default maxRetries used when not overridden by caller. */
export const DEFAULT_MODEL_MAX_RETRIES = 0;

/** Temperature used by the Control Model (JSON structured-output calls). */
export const CONTROL_MODEL_TEMPERATURE = 0.1;

/** Default maxOutputTokens for the Control Model when the provider cap is unknown. */
export const CONTROL_MODEL_DEFAULT_MAX_TOKENS = 2048;

/** Hard cap applied to the Control Model when the provider reports a larger maxOutputTokens. */
export const CONTROL_MODEL_MAX_TOKEN_CAP = 4096;

/** Temperature used by the ChatGPT Import summarizer. */
export const SUMMARIZER_TEMPERATURE = 0.2;

/** maxOutputTokens used by the ChatGPT Import summarizer. */
export const SUMMARIZER_MAX_TOKENS = 2048;

/** maxRetries used by the ChatGPT Import summarizer. */
export const SUMMARIZER_MAX_RETRIES = 1;

/** Temperature used by the Title Generator. */
export const TITLE_GEN_TEMPERATURE = 0.2;

/** maxOutputTokens used by the Title Generator. */
export const TITLE_GEN_MAX_TOKENS = 120;
