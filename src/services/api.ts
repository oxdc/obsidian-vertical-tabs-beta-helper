import { requestUrl, RequestUrlParam, RequestUrlResponse } from "obsidian";
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

export class ApiException extends Error {
	constructor(
		public readonly error: ApiError,
		public readonly context: Record<string, unknown> = {}
	) {
		super(`API error: ${error}`);
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
		const response = await this.request(
			`/builds?limit=${limit}&offset=${offset}`
		);
		return response.json as ListBuildsResponse;
	}

	async getBuild(tag: string): Promise<GetBuildResponse> {
		const response = await this.request(`/builds/${tag}`);
		return response.json as GetBuildResponse;
	}

	async downloadBuild(tag: string): Promise<DownloadBuildResult> {
		const response = await this.request(`/builds/${tag}/download`);

		switch (response.status) {
			case 200: {
				const contentType = response.headers["content-type"];
				const sha256 = response.headers["x-sha256"];
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
