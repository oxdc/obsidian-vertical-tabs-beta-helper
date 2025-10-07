export function stripTokenDashes(token: string): string {
	return token.trim().replace(/-/g, "");
}

export function randomString(length: number): string {
	return Math.random()
		.toString(36)
		.substring(2, 2 + length);
}

export async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function makeError(error: unknown): Error {
	if (error instanceof Error) return error;
	if (typeof error === "string") return new Error(error);
	return new Error(String(error));
}

export function errorToString(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return String(error);
}

export type RetryDecision = {
	retry: boolean;
	delay?: number;
};

export type RetryDecider = (error: Error, attempt: number) => RetryDecision;

const UNKNOWN_ERROR = new Error("Unknown error");

export interface RetryConfig {
	maxRetries: number;
	initialDelay: number;
	shouldRetry?: RetryDecider;
}

export async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	config: RetryConfig
): Promise<T> {
	let lastError: Error = UNKNOWN_ERROR;
	for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = makeError(error);
			if (attempt >= config.maxRetries) throw lastError;
			const defaultDelay = config.initialDelay * Math.pow(2, attempt);
			if (config.shouldRetry) {
				const decision = config.shouldRetry(error, attempt);
				if (!decision.retry) throw lastError;
				await sleep(decision.delay ?? defaultDelay);
			} else {
				await sleep(defaultDelay);
			}
		}
	}
	throw lastError;
}
