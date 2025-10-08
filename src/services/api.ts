import { requestUrl, RequestUrlParam, RequestUrlResponse } from "obsidian";
import moment from "moment";
import type {
	GetSubscriptionResponse,
	ListBuildsResponse,
	GetBuildResponse,
	BuildRequestNotReadyResponse,
	DownloadBuildResult,
	DownloadBuildSuccess,
} from "./response";

const BETA_SERVER = process.env.BETA_SERVER;
const USER_AGENT_VERSION = process.env.USER_AGENT_VERSION;

export enum ApiError {
	UnknownError = "UnknownError",
	Unauthorized = "Unauthorized",
	NotFound = "NotFound",
	ServerError = "ServerError",
	BuildNotReady = "BuildNotReady",
	RateLimited = "RateLimited",
}

const ERROR_MESSAGES: Record<ApiError, string> = {
	[ApiError.UnknownError]: "An unexpected error occurred. Please try again.",
	[ApiError.Unauthorized]: "Your access token is invalid or has expired.",
	[ApiError.NotFound]: "The requested build was not found.",
	[ApiError.ServerError]:
		"The server encountered an error. Please try again later.",
	[ApiError.BuildNotReady]: "The build is being prepared. Please wait %hint.",
	[ApiError.RateLimited]:
		"Too many requests. Please wait a moment and try again.",
};

function formatRetryTime(seconds: number | null): string {
	if (!seconds) return "a moment";
	return moment.duration(seconds, "seconds").humanize();
}

function getHeader(
	headers: Record<string, string>,
	name: string
): string | undefined {
	const lowerName = name.toLowerCase();
	for (const key in headers) {
		if (key.toLowerCase() === lowerName) {
			return headers[key];
		}
	}
	return undefined;
}

export class ApiException extends Error {
	constructor(
		public readonly error: ApiError,
		public readonly context: Record<string, unknown> = {}
	) {
		let message =
			ERROR_MESSAGES[error] || ERROR_MESSAGES[ApiError.UnknownError];
		if (error === ApiError.BuildNotReady) {
			const hint = formatRetryTime(context.retry_after as number | null);
			message = message.replace("%hint", hint);
		}
		super(message);
		this.name = "ApiException";
	}
}

export class ApiService {
	private baseURL: string;
	private token: string;

	constructor(token: string) {
		this.baseURL = `https://${BETA_SERVER}/api/v1/user`;
		this.token = token;
	}

	private async request(
		endpoint: string,
		options: Partial<RequestUrlParam> = {}
	): Promise<RequestUrlResponse> {
		const response = await requestUrl({
			method: options.method || "GET",
			url: `${this.baseURL}${endpoint}`,
			headers: {
				Authorization: `Bearer ${this.token}`,
				"User-Agent": `vtbetahelper/${USER_AGENT_VERSION}`,
				"Cache-Control": "no-cache, no-store, must-revalidate",
				Pragma: "no-cache",
			},
			throw: false,
		});
		return response;
	}

	async getSubscription(): Promise<GetSubscriptionResponse> {
		const response = await this.request("/subscription");
		switch (response.status) {
			case 200:
				return response.json as GetSubscriptionResponse;
			case 401:
				throw new ApiException(ApiError.Unauthorized);
			case 429:
				throw new ApiException(ApiError.RateLimited);
			case 500:
				throw new ApiException(ApiError.ServerError);
			default:
				throw new ApiException(ApiError.UnknownError);
		}
	}

	async listBuilds(
		limit: number,
		offset: number
	): Promise<ListBuildsResponse> {
		const pagination = `limit=${limit}&offset=${offset}`;
		const response = await this.request(`/builds?${pagination}`);
		switch (response.status) {
			case 200:
				return response.json as ListBuildsResponse;
			case 401:
				throw new ApiException(ApiError.Unauthorized);
			case 429:
				throw new ApiException(ApiError.RateLimited);
			case 500:
				throw new ApiException(ApiError.ServerError);
			default:
				throw new ApiException(ApiError.UnknownError);
		}
	}

	async getBuild(tag: string): Promise<GetBuildResponse> {
		const response = await this.request(`/builds/${tag}`);
		switch (response.status) {
			case 200:
				return response.json as GetBuildResponse;
			case 401:
				throw new ApiException(ApiError.Unauthorized);
			case 404:
				throw new ApiException(ApiError.NotFound);
			case 429:
				throw new ApiException(ApiError.RateLimited);
			case 500:
				throw new ApiException(ApiError.ServerError);
			default:
				throw new ApiException(ApiError.UnknownError);
		}
	}

	async downloadBuild(tag: string): Promise<DownloadBuildResult> {
		// Add cache-busting parameter
		const cacheBuster = `?_t=${Date.now()}`;
		const response = await this.request(
			`/builds/${tag}/download${cacheBuster}`
		);

		switch (response.status) {
			case 200: {
				const contentType = getHeader(response.headers, "content-type");
				const sha256 = getHeader(response.headers, "x-sha256");
				if (contentType === "application/zip" && sha256) {
					return { response, sha256 } as DownloadBuildSuccess;
				}
				throw new ApiException(ApiError.UnknownError);
			}
			case 202: {
				const { data } = response.json as BuildRequestNotReadyResponse;
				const { retry_after } = data;
				throw new ApiException(ApiError.BuildNotReady, { retry_after });
			}
			case 401:
				throw new ApiException(ApiError.Unauthorized);
			case 404:
				throw new ApiException(ApiError.NotFound);
			case 429:
				throw new ApiException(ApiError.RateLimited);
			case 500:
				throw new ApiException(ApiError.ServerError);
			default:
				throw new ApiException(ApiError.UnknownError);
		}
	}
}
