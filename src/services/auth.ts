import { ApiError, ApiException, ApiService } from "./api";
import { stripTokenDashes, sleep, makeError } from "../common/utils";

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 500;
const RETRYABLE_ERRORS = [
	ApiError.ServerError,
	ApiError.UnknownError,
	ApiError.RateLimited,
];

export interface ValidateTokenResponse {
	isValid: boolean;
	errorMessage: string;
}

export function normalizeToken(token: string): string {
	return stripTokenDashes(token).trim().toUpperCase();
}

enum Messages {
	InvalidToken = "Please enter a valid token.",
	Unauthorized = "Your access token is invalid or has expired. Please check your token and try again.",
	ServerError = "Something went wrong while validating your token. Please try again later.",
	RateLimited = "Too many requests. Please wait a moment and try again.",
}

export async function validateToken(
	token: string
): Promise<ValidateTokenResponse> {
	const normalizedToken = normalizeToken(token);
	if (normalizedToken.length !== 16) {
		return { isValid: false, errorMessage: Messages.InvalidToken };
	}

	let lastError: Error | null = null;
	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			const apiService = new ApiService(normalizedToken);
			const response = await apiService.getSubscription();
			const isValid = response.success && response.data.valid;
			const errorMessage = isValid ? "" : Messages.Unauthorized;
			return { isValid, errorMessage };
		} catch (error) {
			if (error instanceof ApiException) {
				// Don't retry on non-retryable errors
				if (!RETRYABLE_ERRORS.includes(error.error)) {
					const errorMessage =
						error.error === ApiError.Unauthorized
							? Messages.Unauthorized
							: Messages.ServerError;
					return { isValid: false, errorMessage };
				}
			}
			lastError = makeError(error);
			// Exponential backoff for retryable errors
			if (attempt < MAX_RETRIES) {
				const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
				await sleep(delay);
			}
		}
	}

	let errorMessage = Messages.ServerError;
	if (lastError instanceof ApiException) {
		switch (lastError.error) {
			case ApiError.RateLimited:
				errorMessage = Messages.RateLimited;
				break;
			case ApiError.ServerError:
				errorMessage = Messages.ServerError;
				break;
		}
	}

	return { isValid: false, errorMessage };
}
