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
	deleted: boolean;
};
export type ListBuildsResponse = PaginatedResponse<BuildData>;

type _GetBuildResponse = {
	success: true;
	data: BuildData;
};
export type GetBuildResponse = _GetBuildResponse | ErrorResponse;

export type BuildRequestAcceptedResponse = {
	success: false;
	code: "BUILD_IN_PROGRESS";
	error: string;
};

export type PendingJobDetails = {
	tag: string;
	dispatched_at: string;
	expires_at: string;
};

export type BuildRequestIsProcessingResponse = {
	success: false;
	code: "BUILD_IN_PROGRESS";
	error: string;
	data: PendingJobDetails;
};

export type BuildRequestResponse =
	| BuildRequestAcceptedResponse
	| BuildRequestIsProcessingResponse;

export type DownloadBuildSuccess = {
	response: RequestUrlResponse;
	sha256: string;
};

export type DownloadBuildResult =
	| DownloadBuildSuccess
	| BuildRequestAcceptedResponse
	| BuildRequestIsProcessingResponse
	| ErrorResponse;
