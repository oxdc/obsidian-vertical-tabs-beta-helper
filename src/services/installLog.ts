import { errorToString } from "../common/utils";

const PREFIX = "[VT Beta Helper · Install]";

function timestamp(): string {
	return new Date().toISOString();
}

export function installLog(message: string): void {
	console.log(`${PREFIX} ${timestamp()} ${message}`);
}

export function installLogError(message: string, error: unknown): void {
	console.error(`${PREFIX} ${timestamp()} ${message}: ${errorToString(error)}`);
	if (error instanceof Error && error.stack) console.error(error.stack);
}
