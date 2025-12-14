import Dexie, { Table } from "dexie";
import { App } from "obsidian";
import { migrationRegistry } from "src/services/migration";

interface GroupMetadata {
	id: string;
	color?: string;
	icon?: string;
	title?: string;
}

class MetadataDatabase extends Dexie {
	groupMetadata!: Table<GroupMetadata, string>;

	constructor() {
		super("VerticalTabsMetadata");
		this.version(1).stores({
			tabMetadata: "id",
			groupMetadata: "id",
		});
	}
}

/**
 * Finds all localStorage keys matching the view-state pattern.
 * Format: vertical-tabs-${installationID}-${deviceID}:view-state
 */
function findViewStateKeys(): string[] {
	const pattern = /^vertical-tabs-.+-.+:view-state$/;
	const keys = ["view-state"];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key && pattern.test(key)) {
			keys.push(key);
		}
	}
	return keys;
}

/**
 * Migrates group titles from localStorage (old design) to IndexedDB (new design).
 *
 * Reads the "view-state" key from localStorage, which contains group titles
 * in the format [[id, title], [id, title], ...], and writes them to the
 * groupMetadata table in IndexedDB as title properties.
 *
 * Default titles ("Grouped tabs") are not migrated.
 */
export async function migrateGroupTitlesToIndexDB(): Promise<void> {
	try {
		const viewStateKeys = findViewStateKeys();
		if (viewStateKeys.length === 0) {
			console.log("[Migration] No view-state keys found in localStorage");
			return;
		}

		const db = new MetadataDatabase();
		const groupsToMigrate: GroupMetadata[] = [];

		for (const key of viewStateKeys) {
			const data = localStorage.getItem(key);
			if (!data) continue;

			const entries = JSON.parse(data) as [string, string][];
			if (!entries || entries.length === 0) continue;

			for (const [id, title] of entries) {
				if (title && title !== "Grouped tabs") {
					groupsToMigrate.push({ id, title });
				}
			}
		}

		if (groupsToMigrate.length > 0) {
			await db.groupMetadata.bulkPut(groupsToMigrate);
			console.log(
				`[Migration] Migrated ${groupsToMigrate.length} group titles to IndexedDB from ${viewStateKeys.length} key(s)`
			);
		} else {
			console.log(
				"[Migration] No custom group titles to migrate (all were default)"
			);
		}

		db.close();
	} catch (error) {
		console.error("[Migration] Failed to migrate group titles:", error);
		throw error;
	}
}

/**
 * Migrates group titles from IndexedDB (new design) to localStorage (old design).
 *
 * Reads group metadata from the groupMetadata table in IndexedDB and writes
 * title properties to the "view-state" key in localStorage in the format
 * [[id, title], [id, title], ...].
 *
 * Only entries with title are migrated.
 */
export async function migrateGroupTitlesFromIndexDB(): Promise<void> {
	try {
		const db = new MetadataDatabase();
		const allMetadata = await db.groupMetadata.toArray();

		if (!allMetadata || allMetadata.length === 0) {
			console.log("[Migration] No group metadata found in IndexedDB");
			db.close();
			return;
		}

		const entries: [string, string][] = [];
		for (const metadata of allMetadata) {
			if (metadata.title) {
				entries.push([metadata.id, metadata.title]);
			}
		}

		if (entries.length > 0) {
			const viewStateKeys = findViewStateKeys();
			if (viewStateKeys.length === 0) {
				console.log(
					"[Migration] No view-state keys found in localStorage to restore to"
				);
			} else {
				const data = JSON.stringify(entries);
				for (const key of viewStateKeys) {
					localStorage.setItem(key, data);
				}
				console.log(
					`[Migration] Migrated ${entries.length} group titles to ${viewStateKeys.length} localStorage key(s)`
				);
			}
		} else {
			console.log("[Migration] No custom titles found in IndexedDB");
		}

		db.close();
	} catch (error) {
		console.error(
			"[Migration] Failed to migrate group titles from IndexedDB:",
			error
		);
		throw error;
	}
}

/**
 * Removes group titles from localStorage (old design).
 *
 * Deletes the "view-state" key from localStorage, which contains group titles.
 */
export function cleanupGroupTitlesLocalStorage(): void {
	try {
		const viewStateKeys = findViewStateKeys();
		for (const key of viewStateKeys) {
			localStorage.removeItem(key);
		}
		console.log(
			`[Cleanup] Removed ${viewStateKeys.length} view-state key(s) from localStorage`
		);
	} catch (error) {
		console.error(
			"[Cleanup] Failed to cleanup group titles from localStorage:",
			error
		);
		throw error;
	}
}

/**
 * Deletes the entire VerticalTabsMetadata IndexedDB database.
 *
 * This removes all metadata stored by the plugin in IndexedDB, including
 * both tab and group metadata (colors, icons, custom titles).
 */
export async function cleanupIndexDB(): Promise<void> {
	try {
		await Dexie.delete("VerticalTabsMetadata");
		console.log("[Cleanup] Deleted VerticalTabsMetadata IndexedDB");
	} catch (error) {
		console.error("[Cleanup] Failed to delete IndexedDB:", error);
		throw error;
	}
}

// Upgrading from <=0.17.4 to >=0.18.0
// prettier-ignore
migrationRegistry.registerMigration({
	qualifier: {
		fromVersion: "0.17.4",
		toVersion: "0.18.0",
	},
	preInstallationTasks: async (app: App) => {
		console.log("[Migration] Pre-installation tasks for upgrading from <=0.17.4 to >=0.18.0");
		await migrateGroupTitlesToIndexDB();
	},
	postInstallationTasks: async (app: App) => {
		console.log("[Migration] Post-installation tasks for upgrading from <=0.17.4 to >=0.18.0");
		cleanupGroupTitlesLocalStorage();
	},
});

// Downgrading from >=0.18.0 to <=0.17.4
// prettier-ignore
migrationRegistry.registerMigration({
	qualifier: {
		fromVersion: "0.18.0",
		toVersion: "0.17.4",
	},
	preInstallationTasks: async (app: App) => {
		console.log("[Migration] Pre-installation tasks for downgrading from >=0.18.0 to <=0.17.4");
		await migrateGroupTitlesFromIndexDB();
	},
	postInstallationTasks: async (app: App) => {
		console.log("[Migration] Post-installation tasks for downgrading from >=0.18.0 to <=0.17.4");
		await cleanupIndexDB();
	},
});
