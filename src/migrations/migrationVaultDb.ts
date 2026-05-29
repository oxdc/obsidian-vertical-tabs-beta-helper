import { App } from "obsidian";
import { migrationRegistry } from "src/services/migration";
import { Database, Table } from "src/utils/IndexedDBWrapper";

const LEGACY_DB_NAME = "VerticalTabsMetadata";
const VAULT_DB_PREFIX = "VerticalTabsMetadata-";
const STORE_NAMES = ["tabMetadata", "groupMetadata"] as const;

type MetadataStoreName = (typeof STORE_NAMES)[number];

interface MetadataRecord {
	id: string;
	vaultId?: string;
	[key: string]: unknown;
}

function getVaultDbName(vaultId: string): string {
	return `${VAULT_DB_PREFIX}${vaultId}`;
}

function vaultIdFromDbName(dbName: string): string {
	return dbName.slice(VAULT_DB_PREFIX.length);
}

function resolveVaultId(record: MetadataRecord, fallbackVaultId: string): string {
	return record.vaultId ?? fallbackVaultId;
}

function stripVaultId(record: MetadataRecord): MetadataRecord {
	const copy = { ...record };
	delete copy.vaultId;
	return copy;
}

function withVaultId<T extends MetadataRecord>(
	record: Omit<T, "vaultId">,
	vaultId: string
): T {
	return { ...record, vaultId } as T;
}

function openDb(dbName: string) {
	const dbInstance = new Database(dbName);
	dbInstance.version(1).stores({
		tabMetadata: "id",
		groupMetadata: "id",
	});
	return dbInstance as unknown as Record<
		MetadataStoreName,
		Table<MetadataRecord>
	>;
}

async function deleteDatabase(dbName: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(dbName);

		request.onsuccess = () => resolve();
		request.onerror = () => {
			reject(
				new Error(
					`Failed to delete IndexedDB "${dbName}": ${
						request.error?.message || "Unknown error"
					}`
				)
			);
		};
		request.onblocked = () => {
			reject(
				new Error(
					`Failed to delete IndexedDB "${dbName}": database is blocked by open connections`
				)
			);
		};
	});
}

async function listVaultDatabaseNames(): Promise<string[]> {
	if (!indexedDB.databases) {
		return [];
	}
	const databases = await indexedDB.databases();
	return databases
		.map((database) => database.name)
		.filter(
			(name): name is string =>
				!!name && name.startsWith(VAULT_DB_PREFIX)
		);
}

async function writeRecordsToVault(
	vaultId: string,
	storeName: MetadataStoreName,
	records: MetadataRecord[]
): Promise<number> {
	if (records.length === 0) return 0;
	const vaultDb = openDb(getVaultDbName(vaultId));
	const table = vaultDb[storeName];
	for (const record of records) {
		await table.put(stripVaultId(record));
	}
	return records.length;
}

/**
 * Splits the shared IndexedDB into per-vault databases keyed by vaultId.
 */
export async function migrateMetadataToVaultDatabases(
	app: App
): Promise<void> {
	try {
		const legacyDb = openDb(LEGACY_DB_NAME);
		const [tabRecords, groupRecords] = await Promise.all([
			legacyDb.tabMetadata.toArray(),
			legacyDb.groupMetadata.toArray(),
		]);

		if (tabRecords.length === 0 && groupRecords.length === 0) {
			console.log(
				"[Migration] No metadata found in legacy IndexedDB to split by vault"
			);
			return;
		}

		const fallbackVaultId = app.appId;
		const tabByVault = new Map<string, MetadataRecord[]>();
		const groupByVault = new Map<string, MetadataRecord[]>();

		for (const record of tabRecords) {
			const vaultId = resolveVaultId(record, fallbackVaultId);
			const bucket = tabByVault.get(vaultId) ?? [];
			bucket.push(record);
			tabByVault.set(vaultId, bucket);
		}

		for (const record of groupRecords) {
			const vaultId = resolveVaultId(record, fallbackVaultId);
			const bucket = groupByVault.get(vaultId) ?? [];
			bucket.push(record);
			groupByVault.set(vaultId, bucket);
		}

		const vaultIds = new Set([...tabByVault.keys(), ...groupByVault.keys()]);
		let tabCount = 0;
		let groupCount = 0;

		for (const vaultId of vaultIds) {
			tabCount += await writeRecordsToVault(
				vaultId,
				"tabMetadata",
				tabByVault.get(vaultId) ?? []
			);
			groupCount += await writeRecordsToVault(
				vaultId,
				"groupMetadata",
				groupByVault.get(vaultId) ?? []
			);
		}

		console.log(
			`[Migration] Migrated ${tabCount} tab and ${groupCount} group metadata record(s) into ${vaultIds.size} vault database(s)`
		);
	} catch (error) {
		console.error(
			"[Migration] Failed to migrate metadata to per-vault IndexedDB:",
			error
		);
		throw error;
	}
}

/**
 * Merges per-vault IndexedDB databases back into the shared legacy database.
 */
export async function migrateMetadataFromVaultDatabases(): Promise<void> {
	try {
		const vaultDbNames = await listVaultDatabaseNames();
		if (vaultDbNames.length === 0) {
			console.log(
				"[Migration] No per-vault IndexedDB databases found to merge"
			);
			return;
		}

		const legacyDb = openDb(LEGACY_DB_NAME);
		let tabCount = 0;
		let groupCount = 0;

		for (const dbName of vaultDbNames) {
			const vaultId = vaultIdFromDbName(dbName);
			const vaultDb = openDb(dbName);
			const [tabRecords, groupRecords] = await Promise.all([
				vaultDb.tabMetadata.toArray(),
				vaultDb.groupMetadata.toArray(),
			]);

			for (const record of tabRecords) {
				await legacyDb.tabMetadata.put(
					withVaultId(record, vaultId)
				);
				tabCount++;
			}

			for (const record of groupRecords) {
				await legacyDb.groupMetadata.put(
					withVaultId(record, vaultId)
				);
				groupCount++;
			}
		}

		console.log(
			`[Migration] Migrated ${tabCount} tab and ${groupCount} group metadata record(s) from ${vaultDbNames.length} vault database(s) to legacy IndexedDB`
		);
	} catch (error) {
		console.error(
			"[Migration] Failed to migrate metadata from per-vault IndexedDB:",
			error
		);
		throw error;
	}
}

export async function cleanupLegacyMetadataDatabase(): Promise<void> {
	try {
		await deleteDatabase(LEGACY_DB_NAME);
		console.log(
			`[Cleanup] Deleted legacy IndexedDB database "${LEGACY_DB_NAME}"`
		);
	} catch (error) {
		console.error(
			"[Cleanup] Failed to delete legacy IndexedDB database:",
			error
		);
		throw error;
	}
}

export async function cleanupVaultMetadataDatabases(): Promise<void> {
	try {
		const vaultDbNames = await listVaultDatabaseNames();
		for (const dbName of vaultDbNames) {
			await deleteDatabase(dbName);
		}
		console.log(
			`[Cleanup] Deleted ${vaultDbNames.length} per-vault IndexedDB database(s)`
		);
	} catch (error) {
		console.error(
			"[Cleanup] Failed to delete per-vault IndexedDB databases:",
			error
		);
		throw error;
	}
}

// Upgrading from <=0.23.1 to >=0.24.0 (runs after group visibility migration)
// prettier-ignore
migrationRegistry.registerMigration({
	qualifier: {
		fromVersion: "0.23.1",
		toVersion: "0.24.0",
	},
	order: 2,
	preInstallationTasks: async (app: App) => {
		console.log(
			"[Migration] Pre-installation tasks for upgrading from <=0.23.1 to >=0.24.0 (vault IndexedDB)"
		);
		await migrateMetadataToVaultDatabases(app);
	},
	postInstallationTasks: async (app: App) => {
		console.log(
			"[Migration] Post-installation tasks for upgrading from <=0.23.1 to >=0.24.0 (vault IndexedDB)"
		);
		await cleanupLegacyMetadataDatabase();
	},
});

// Downgrading from >=0.24.0 to <=0.23.1 (runs before group visibility migration)
// prettier-ignore
migrationRegistry.registerMigration({
	qualifier: {
		fromVersion: "0.24.0",
		toVersion: "0.23.1",
	},
	order: 2,
	preInstallationTasks: async (app: App) => {
		console.log(
			"[Migration] Pre-installation tasks for downgrading from >=0.24.0 to <=0.23.1 (vault IndexedDB)"
		);
		await migrateMetadataFromVaultDatabases();
	},
	postInstallationTasks: async (app: App) => {
		console.log(
			"[Migration] Post-installation tasks for downgrading from >=0.24.0 to <=0.23.1 (vault IndexedDB)"
		);
		await cleanupVaultMetadataDatabases();
	},
});
