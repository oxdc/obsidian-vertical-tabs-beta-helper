import { RequestUrlResponse } from "obsidian";

export type ErrorResponse = {
	success: false;
	error: string;
};

type _GetSubscriptionResponse = {
	success: true;
	data: {
		email: string;
		renew_date: string;
		expires_at: string;
		valid: boolean;
	};
};
export type GetSubscriptionResponse = _GetSubscriptionResponse | ErrorResponse;

type _PaginatedResponse<T> = {
	success: true;
	data: T[];
	total: number;
	limit: number;
	offset: number;
	has_more: boolean;
};
export type PaginatedResponse<T> = _PaginatedResponse<T> | ErrorResponse;

export type BuildData = {
	id: number;
	tag: string;
	release_date: string;
	release_note: string | null;
	short_summary: string | null;
	deleted: boolean;
};
export type ListBuildsResponse = PaginatedResponse<BuildData>;

type _GetBuildResponse = {
	success: true;
	data: BuildData;
};
export type GetBuildResponse = _GetBuildResponse | ErrorResponse;

export type PendingJobDetails = {
	tag: string;
	retry_after: number;
};

export type BuildRequestNotReadyResponse = {
	success: false;
	code: "BUILD_IN_PROGRESS";
	error: string;
	data: PendingJobDetails;
};

export type DownloadBuildSuccess = {
	response: RequestUrlResponse;
	sha256: string;
};

export type DownloadBuildResult =
	| DownloadBuildSuccess
	| BuildRequestNotReadyResponse
	| ErrorResponse;

export function isDownloadBuildSuccess(
	result: DownloadBuildResult
): result is DownloadBuildSuccess {
	return "response" in result && "sha256" in result;
}
