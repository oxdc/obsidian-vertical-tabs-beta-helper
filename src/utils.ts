export function stripTokenDashes(token: string): string {
	return token.trim().replace(/-/g, "");
}
