import { App } from "obsidian";
import semver from "semver";

type MigrationQualifier = {
	fromVersion: string;
	toVersion: string;
};

type Migration = {
	qualifier: MigrationQualifier;
	preInstallationTasks: (app: App) => Promise<void>;
	postInstallationTasks: (app: App) => Promise<void>;
};

class MigrationRegistry {
	private static instance: MigrationRegistry;
	private migrations: Map<MigrationQualifier, Migration> = new Map();

	private constructor() {}

	public static getInstance(): MigrationRegistry {
		if (!MigrationRegistry.instance) {
			MigrationRegistry.instance = new MigrationRegistry();
		}
		return MigrationRegistry.instance;
	}

	registerMigration(migration: Migration): void {
		this.migrations.set(migration.qualifier, migration);
	}

	queryMigrations(fromVersion: string, toVersion: string): Migration[] {
		const realFromVersion = fromVersion.replace(/-beta-\d+$/, "");
		const realToVersion = toVersion.replace(/-beta-\d+$/, "");
		const isUpgrade = semver.lt(realFromVersion, realToVersion);

		return Array.from(this.migrations.values()).filter((migration) => {
			const mFrom = migration.qualifier.fromVersion;
			const mTo = migration.qualifier.toVersion;

			if (isUpgrade) {
				// For upgrades: find migrations that bridge from old to new version
				return (
					semver.lte(mFrom, realFromVersion) &&
					semver.lte(realToVersion, mTo)
				);
			} else {
				// For downgrades: find migrations that bridge from new to old version
				return (
					semver.lte(mTo, realFromVersion) &&
					semver.lte(realToVersion, mFrom)
				);
			}
		});
	}
}

export const migrationRegistry = MigrationRegistry.getInstance();

// prettier-ignore
export async function runPreinstallationTasks(app: App, fromVersion: string, toVersion: string): Promise<void> {
	const migrations = migrationRegistry.queryMigrations(fromVersion, toVersion);
	for (const migration of migrations) await migration.preInstallationTasks(app);
}

// prettier-ignore
export async function runPostinstallationTasks(app: App, fromVersion: string, toVersion: string): Promise<void> {
	const migrations = migrationRegistry.queryMigrations(fromVersion, toVersion);
	for (const migration of migrations) await migration.postInstallationTasks(app);
}
