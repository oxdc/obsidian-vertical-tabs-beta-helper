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
