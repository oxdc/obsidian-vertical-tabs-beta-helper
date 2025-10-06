import { requestUrl, RequestUrlParam, RequestUrlResponse } from "obsidian";
import type {
	GetSubscriptionResponse,
	ListBuildsResponse,
	GetBuildResponse,
	BuildRequestResponse,
	ErrorResponse,
	DownloadBuildResult,
} from "./response";

const BETA_SERVER = process.env.BETA_SERVER;
const USER_AGENT_VERSION = process.env.USER_AGENT_VERSION;

export enum ApiError {
	UnknownError = "UnknownError",
	Unauthorized = "Unauthorized",
	NotFound = "NotFound",
}

export class ApiService {
	private baseURL: string;
	private token: string;

	constructor(token: string) {
		this.baseURL = `${BETA_SERVER}/api/v1/user`;
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
		});
		return response;
	}

	async getSubscription(): Promise<GetSubscriptionResponse> {
		const response = await this.request("/subscription");
		return response.json as GetSubscriptionResponse;
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
					return {
						response,
						sha256,
					};
				}
				throw ApiError.UnknownError;
			}
			case 202: {
				const jsonResponse = response.json as BuildRequestResponse;
				return jsonResponse;
			}
			case 401:
				throw ApiError.Unauthorized;
			case 404:
				throw ApiError.NotFound;
			case 500: {
				const errorResponse = response.json as ErrorResponse;
				return errorResponse;
			}
			default:
				throw ApiError.UnknownError;
		}
	}
}
