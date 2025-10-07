import { ApiError, ApiException, ApiService } from "./api";
import { retryWithBackoff, RetryConfig } from "../common/utils";
import { ListBuildsResponse } from "./response";

const RETRYABLE_ERRORS = [
	ApiError.ServerError,
	ApiError.UnknownError,
	ApiError.RateLimited,
];

export async function listBuilds(
	token: string,
	limit: number,
	offset: number
): Promise<ListBuildsResponse> {
	const apiService = new ApiService(token);

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
		async () => await apiService.listBuilds(limit, offset),
		retryConfig
	);
}
