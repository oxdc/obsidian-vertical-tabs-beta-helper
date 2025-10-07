import { ApiError, ApiException, ApiService } from "./api";
import {
	stripTokenDashes,
	retryWithBackoff,
	RetryConfig,
} from "../common/utils";
import { GetSubscriptionResponse } from "./response";

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

	const retryConfig: RetryConfig = {
		maxRetries: 5,
		initialDelay: 500,
		shouldRetry: (error) => ({
			retry:
				error instanceof ApiException &&
				RETRYABLE_ERRORS.includes(error.error),
		}),
	};

	try {
		const apiService = new ApiService(normalizedToken);

		await retryWithBackoff(async () => {
			const response = await apiService.getSubscription();
			const isValid = response.success && response.data.valid;
			if (!isValid) throw new ApiException(ApiError.Unauthorized);
			return response;
		}, retryConfig);

		return { isValid: true, errorMessage: "" };
	} catch (error) {
		let errorMessage = Messages.ServerError;
		if (error instanceof ApiException) {
			switch (error.error) {
				case ApiError.Unauthorized:
					errorMessage = Messages.Unauthorized;
					break;
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
}

export async function refreshSubscription(
	token: string
): Promise<GetSubscriptionResponse> {
	const normalizedToken = normalizeToken(token);
	const apiService = new ApiService(normalizedToken);

	const retryConfig: RetryConfig = {
		maxRetries: 10,
		initialDelay: 1000,
		shouldRetry: (error) => ({
			retry:
				error instanceof ApiException &&
				RETRYABLE_ERRORS.includes(error.error),
		}),
	};

	return await retryWithBackoff(
		async () => await apiService.getSubscription(),
		retryConfig
	);
}
