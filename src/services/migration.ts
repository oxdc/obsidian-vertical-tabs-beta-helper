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
	private migrations: Migration[] = [];
	private migrationsLoaded = false;

	private constructor() {}

	public static getInstance(): MigrationRegistry {
		if (!MigrationRegistry.instance) {
			MigrationRegistry.instance = new MigrationRegistry();
		}
		return MigrationRegistry.instance;
	}

	registerMigration(migration: Migration): void {
		this.migrations.push(migration);
	}

	private async ensureMigrationsLoaded(): Promise<void> {
		if (!this.migrationsLoaded) {
			await import("../migrations");
			this.migrationsLoaded = true;
		}
	}

	async queryMigrations(
		fromVersion: string,
		toVersion: string
	): Promise<Migration[]> {
		await this.ensureMigrationsLoaded();
		const realFromVersion = fromVersion.replace(/-beta-\d+$/, "");
		const realToVersion = toVersion.replace(/-beta-\d+$/, "");
		const isUpgrade = semver.lt(realFromVersion, realToVersion);

		return this.migrations.filter((migration) => {
			const mFrom = migration.qualifier.fromVersion;
			const mTo = migration.qualifier.toVersion;
			const migrationIsUpgrade = semver.lt(mFrom, mTo);

			if (isUpgrade) {
				// For upgrades: find migrations that bridge from old to new version
				return (
					migrationIsUpgrade &&
					semver.lte(realFromVersion, mFrom) &&
					semver.gte(realToVersion, mTo)
				);
			} else {
				// For downgrades: find migrations that bridge from new to old version
				return (
					!migrationIsUpgrade &&
					semver.gte(realFromVersion, mFrom) &&
					semver.lte(realToVersion, mTo)
				);
			}
		});
	}
}

export const migrationRegistry = MigrationRegistry.getInstance();

// prettier-ignore
export async function runPreinstallationTasks(app: App, fromVersion: string, toVersion: string): Promise<void> {
	const migrations = await migrationRegistry.queryMigrations(fromVersion, toVersion);
  console.log(`[Migration] Running pre-installation tasks for ${fromVersion} to ${toVersion}: ${migrations.length} migrations`);
	for (const migration of migrations) await migration.preInstallationTasks(app);
}

// prettier-ignore
export async function runPostinstallationTasks(app: App, fromVersion: string, toVersion: string): Promise<void> {
	const migrations = await migrationRegistry.queryMigrations(fromVersion, toVersion);
	console.log(`[Migration] Running post-installation tasks for ${fromVersion} to ${toVersion}: ${migrations.length} migrations`);
	for (const migration of migrations) await migration.postInstallationTasks(app);
}
