import Dexie, { Table } from "dexie";
import { App } from "obsidian";
import { migrationRegistry } from "src/services/migration";

interface GroupMetadata {
	id: string;
	color?: string;
	icon?: string;
	customTitle?: string;
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
 * Migrates group titles from localStorage (old design) to IndexedDB (new design).
 *
 * Reads the "view-state" key from localStorage, which contains group titles
 * in the format [[id, title], [id, title], ...], and writes them to the
 * groupMetadata table in IndexedDB as customTitle properties.
 *
 * Default titles ("Grouped tabs") are not migrated.
 */
export async function migrateGroupTitlesToIndexDB(): Promise<void> {
	try {
		const data = localStorage.getItem("view-state");
		if (!data) {
			console.log("[Migration] No group titles found in localStorage");
			return;
		}

		const entries = JSON.parse(data) as [string, string][];
		if (!entries || entries.length === 0) {
			console.log("[Migration] Empty group titles in localStorage");
			return;
		}

		const db = new MetadataDatabase();
		const groupsToMigrate: GroupMetadata[] = [];

		for (const [id, title] of entries) {
			if (title && title !== "Grouped tabs") {
				groupsToMigrate.push({ id, customTitle: title });
			}
		}

		if (groupsToMigrate.length > 0) {
			await db.groupMetadata.bulkPut(groupsToMigrate);
			console.log(
				`[Migration] Migrated ${groupsToMigrate.length} group titles to IndexedDB`
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
 * customTitle properties to the "view-state" key in localStorage in the format
 * [[id, title], [id, title], ...].
 *
 * Only entries with customTitle are migrated.
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
			if (metadata.customTitle) {
				entries.push([metadata.id, metadata.customTitle]);
			}
		}

		if (entries.length > 0) {
			const data = JSON.stringify(entries);
			localStorage.setItem("view-state", data);
			console.log(
				`[Migration] Migrated ${entries.length} group titles to localStorage`
			);
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
		localStorage.removeItem("view-state");
		console.log(
			"[Cleanup] Removed group titles from localStorage (view-state)"
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
migrationRegistry.registerMigration({
	qualifier: {
		fromVersion: "0.17.4",
		toVersion: "0.18.0",
	},
	preInstallationTasks: async (app: App) => {
		await migrateGroupTitlesToIndexDB();
	},
	postInstallationTasks: async (app: App) => {
		cleanupGroupTitlesLocalStorage();
	},
});

// Downgrading from >=0.18.0 to <=0.17.4
migrationRegistry.registerMigration({
	qualifier: {
		fromVersion: "0.18.0",
		toVersion: "0.17.4",
	},
	preInstallationTasks: async (app: App) => {
		await migrateGroupTitlesFromIndexDB();
	},
	postInstallationTasks: async (app: App) => {
		await cleanupIndexDB();
	},
});
