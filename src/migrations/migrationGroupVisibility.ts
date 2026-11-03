import { App } from "obsidian";
import { storage } from "src/common/localStorage";
import { migrationRegistry } from "src/services/migration";
import { Database, Table } from "src/utils/IndexedDBWrapper";

interface GroupMetadata {
	id: string;
	color?: string;
	icon?: string;
	title?: string;
	isHidden?: boolean;
	isCollapsed?: boolean;
	unhideTime?: number;
}

const dbInstance = new Database("VerticalTabsMetadata");
dbInstance.version(2).stores({
	tabMetadata: "id",
	groupMetadata: "id",
});

const db = dbInstance as unknown as {
	groupMetadata: Table<GroupMetadata>;
};

async function getGroupMetadata(id: string): Promise<GroupMetadata | undefined> {
	return db.groupMetadata.get(id);
}

async function putGroupMetadata(item: GroupMetadata): Promise<void> {
	await db.groupMetadata.put(item);
}

async function getAllGroupMetadata(): Promise<GroupMetadata[]> {
	return db.groupMetadata.toArray();
}

function loadHiddenGroups(): string[] {
	const data = storage().getItem("hidden-groups");
	if (!data) return [];
	return JSON.parse(data) as string[];
}

function loadCollapsedGroups(): string[] {
	const data = storage().getItem("collapsed-groups");
	if (!data) return [];
	return JSON.parse(data) as string[];
}

function loadGroupUnhideTimes(): Map<string, number> {
	const data = storage().getItem("group-unhide-times");
	if (!data) return new Map();
	const entries = JSON.parse(data) as [string, number][];
	return new Map(entries);
}

/**
 * Migrates group hidden/collapsed state and unhide times from localStorage to IndexedDB.
 */
export async function migrateGroupVisibilityToIndexDB(): Promise<void> {
	try {
		const hiddenGroups = loadHiddenGroups();
		const collapsedGroups = loadCollapsedGroups();
		const unhideTimes = loadGroupUnhideTimes();

		const ids = new Set<string>([...hiddenGroups, ...collapsedGroups, ...unhideTimes.keys()]);

		if (ids.size === 0) {
			console.debug("[Migration] No group visibility data found in localStorage");
			return;
		}

		const hiddenSet = new Set(hiddenGroups);
		const collapsedSet = new Set(collapsedGroups);
		let migrated = 0;

		for (const id of ids) {
			const existing = (await getGroupMetadata(id)) ?? { id };
			const metadata: GroupMetadata = { ...existing };

			if (hiddenSet.has(id)) metadata.isHidden = true;
			if (collapsedSet.has(id)) metadata.isCollapsed = true;

			const unhideTime = unhideTimes.get(id);
			if (unhideTime !== undefined && unhideTime > 0) {
				metadata.unhideTime = unhideTime;
			}

			await putGroupMetadata(metadata);
			migrated++;
		}

		console.debug(`[Migration] Migrated visibility state for ${migrated} group(s) to IndexedDB`);
	} catch (error) {
		console.error("[Migration] Failed to migrate group visibility to IndexedDB:", error);
		throw error;
	}
}

/**
 * Migrates group hidden/collapsed state and unhide times from IndexedDB to localStorage.
 */
export async function migrateGroupVisibilityFromIndexDB(): Promise<void> {
	try {
		const allMetadata = await getAllGroupMetadata();
		if (!allMetadata || allMetadata.length === 0) {
			console.debug("[Migration] No group metadata found in IndexedDB");
			return;
		}

		const hiddenGroups: string[] = [];
		const collapsedGroups: string[] = [];
		const unhideEntries: [string, number][] = [];

		for (const metadata of allMetadata) {
			if (metadata.isHidden) hiddenGroups.push(metadata.id);
			if (metadata.isCollapsed) collapsedGroups.push(metadata.id);
			if (metadata.unhideTime !== undefined && metadata.unhideTime > 0) {
				unhideEntries.push([metadata.id, metadata.unhideTime]);
			}
		}

		if (hiddenGroups.length === 0 && collapsedGroups.length === 0 && unhideEntries.length === 0) {
			console.debug("[Migration] No group visibility data found in IndexedDB");
			return;
		}

		storage().setItem("hidden-groups", JSON.stringify(hiddenGroups));
		storage().setItem("collapsed-groups", JSON.stringify(collapsedGroups));
		storage().setItem("group-unhide-times", JSON.stringify(unhideEntries));

		console.debug(
			`[Migration] Migrated ${hiddenGroups.length} hidden, ${collapsedGroups.length} collapsed, and ${unhideEntries.length} unhide time(s) to localStorage`,
		);
	} catch (error) {
		console.error("[Migration] Failed to migrate group visibility from IndexedDB:", error);
		throw error;
	}
}

/**
 * Removes group visibility keys from localStorage (old design).
 */
export function cleanupGroupVisibilityLocalStorage(): void {
	try {
		storage().removeItem("hidden-groups");
		storage().removeItem("collapsed-groups");
		storage().removeItem("group-unhide-times");
		console.debug("[Cleanup] Removed hidden-groups, collapsed-groups, and group-unhide-times from localStorage");
	} catch (error) {
		console.error("[Cleanup] Failed to cleanup group visibility from localStorage:", error);
		throw error;
	}
}

/**
 * Removes visibility fields from group metadata in IndexedDB without deleting other fields.
 */
export async function cleanupGroupVisibilityFromIndexDB(): Promise<void> {
	try {
		const allMetadata = await getAllGroupMetadata();
		let cleaned = 0;

		for (const metadata of allMetadata) {
			if (!metadata.isHidden && !metadata.isCollapsed && metadata.unhideTime === undefined) {
				continue;
			}

			const rest = { ...metadata };
			delete rest.isHidden;
			delete rest.isCollapsed;
			delete rest.unhideTime;
			await putGroupMetadata(rest);
			cleaned++;
		}

		console.debug(`[Cleanup] Removed visibility fields from ${cleaned} group metadata record(s) in IndexedDB`);
	} catch (error) {
		console.error("[Cleanup] Failed to cleanup group visibility from IndexedDB:", error);
		throw error;
	}
}

// Upgrading from <=0.23.1 to >=0.24.0
// prettier-ignore
migrationRegistry.registerMigration({
	qualifier: {
		fromVersion: "0.23.1",
		toVersion: "0.24.0",
	},
	order: 1,
	preInstallationTasks: async (app: App) => {
		console.debug("[Migration] Pre-installation tasks for upgrading from <=0.23.1 to >=0.24.0 (group visibility)");
		await migrateGroupVisibilityToIndexDB();
	},
	postInstallationTasks: async (app: App) => {
		console.debug("[Migration] Post-installation tasks for upgrading from <=0.23.1 to >=0.24.0 (group visibility)");
		cleanupGroupVisibilityLocalStorage();
	},
});

// Downgrading from >=0.24.0 to <=0.23.1
// prettier-ignore
migrationRegistry.registerMigration({
	qualifier: {
		fromVersion: "0.24.0",
		toVersion: "0.23.1",
	},
	order: 1,
	preInstallationTasks: async (app: App) => {
		console.debug("[Migration] Pre-installation tasks for downgrading from >=0.24.0 to <=0.23.1 (group visibility)");
		await migrateGroupVisibilityFromIndexDB();
	},
	postInstallationTasks: async (app: App) => {
		console.debug("[Migration] Post-installation tasks for downgrading from >=0.24.0 to <=0.23.1 (group visibility)");
		await cleanupGroupVisibilityFromIndexDB();
	},
});
