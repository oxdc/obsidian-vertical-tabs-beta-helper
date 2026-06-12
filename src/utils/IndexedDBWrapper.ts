function toDbError(error: DOMException | null, fallback = "Unknown error"): Error {
	return new Error(error?.message ?? fallback);
}

function openDatabase(
	dbName: string,
	storeNames: string[]
): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(dbName);

		request.onerror = () => {
			reject(toDbError(request.error));
		};

		request.onupgradeneeded = (event) => {
			// Fires only when creating a brand-new database (version 0 → 1).
			const db = (event.target as IDBOpenDBRequest).result;
			for (const storeName of storeNames) {
				if (!db.objectStoreNames.contains(storeName)) {
					db.createObjectStore(storeName, { keyPath: "id" });
				}
			}
		};

		request.onsuccess = () => {
			const db = request.result;
			const missing = storeNames.filter((s) => !db.objectStoreNames.contains(s));

			if (missing.length === 0) {
				resolve(db);
				return;
			}

			// The database exists but is missing stores added in a later schema version
			// (onupgradeneeded does not fire when opening without a version on an existing
			// database). Close and reopen at currentVersion + 1 to trigger the upgrade path.
			const nextVersion = db.version + 1;
			db.close();

			const upgrade = indexedDB.open(dbName, nextVersion);

			upgrade.onerror = () => {
				reject(toDbError(upgrade.error));
			};

			upgrade.onblocked = () => {
				reject(new Error(`Cannot add missing stores to "${dbName}": blocked by another connection`));
			};

			upgrade.onupgradeneeded = (event) => {
				const upgradedDb = (event.target as IDBOpenDBRequest).result;
				for (const storeName of missing) {
					if (!upgradedDb.objectStoreNames.contains(storeName)) {
						upgradedDb.createObjectStore(storeName, { keyPath: "id" });
					}
				}
			};

			upgrade.onsuccess = () => {
				resolve(upgrade.result);
			};
		};
	});
}

export class Table<T extends { id: string }> {
	constructor(
		private storeName: string,
		private dbName: string,
		private allStoreNames: string[]
	) {}

	async get(id: string): Promise<T | undefined> {
		const db = await openDatabase(this.dbName, this.allStoreNames);
		return new Promise((resolve, reject) => {
			const transaction = db.transaction([this.storeName], "readonly");
			const store = transaction.objectStore(this.storeName);
			const request = store.get(id);

			request.onsuccess = () => {
				const result = request.result as T | undefined;
				resolve(result ?? undefined);
				db.close();
			};

			request.onerror = () => {
				db.close();
				reject(toDbError(request.error));
			};
		});
	}

	async put(item: T): Promise<void> {
		const db = await openDatabase(this.dbName, this.allStoreNames);
		return new Promise((resolve, reject) => {
			const transaction = db.transaction([this.storeName], "readwrite");
			const store = transaction.objectStore(this.storeName);
			const request = store.put(item);

			request.onsuccess = () => {
				resolve();
				db.close();
			};

			request.onerror = () => {
				db.close();
				reject(toDbError(request.error));
			};
		});
	}

	async delete(id: string): Promise<void> {
		const db = await openDatabase(this.dbName, this.allStoreNames);
		return new Promise((resolve, reject) => {
			const transaction = db.transaction([this.storeName], "readwrite");
			const store = transaction.objectStore(this.storeName);
			const request = store.delete(id);

			request.onsuccess = () => {
				resolve();
				db.close();
			};

			request.onerror = () => {
				db.close();
				reject(toDbError(request.error));
			};
		});
	}

	async toArray(): Promise<T[]> {
		const db = await openDatabase(this.dbName, this.allStoreNames);
		return new Promise((resolve, reject) => {
			const transaction = db.transaction([this.storeName], "readonly");
			const store = transaction.objectStore(this.storeName);
			const request = store.getAll();

			request.onsuccess = () => {
				resolve(request.result || []);
				db.close();
			};

			request.onerror = () => {
				db.close();
				reject(toDbError(request.error));
			};
		});
	}

	async clear(): Promise<void> {
		const db = await openDatabase(this.dbName, this.allStoreNames);
		return new Promise((resolve, reject) => {
			const transaction = db.transaction([this.storeName], "readwrite");
			const store = transaction.objectStore(this.storeName);
			const request = store.clear();

			request.onsuccess = () => {
				resolve();
				db.close();
			};

			request.onerror = () => {
				db.close();
				reject(toDbError(request.error));
			};
		});
	}

	async bulkDelete(ids: string[]): Promise<void> {
		if (ids.length === 0) {
			return;
		}

		const db = await openDatabase(this.dbName, this.allStoreNames);
		return new Promise((resolve, reject) => {
			const transaction = db.transaction([this.storeName], "readwrite");
			const store = transaction.objectStore(this.storeName);

			let completed = 0;
			let hasError = false;

			for (const id of ids) {
				const request = store.delete(id);
				request.onsuccess = () => {
					completed++;
					if (completed === ids.length && !hasError) {
						resolve();
						db.close();
					}
				};
				request.onerror = () => {
					hasError = true;
					db.close();
					reject(toDbError(request.error));
				};
			}
		});
	}

	where(field: string) {
		return {
			anyOf: async (values: string[]): Promise<T[]> => {
				if (values.length === 0) {
					return [];
				}

				const db = await openDatabase(this.dbName, this.allStoreNames);
				return new Promise((resolve, reject) => {
					const transaction = db.transaction(
						[this.storeName],
						"readonly"
					);
					const store = transaction.objectStore(this.storeName);
					const request = store.getAll();

					request.onsuccess = () => {
						const all = request.result || [];
						const filtered = all.filter((item: T) =>
							values.includes(item[field as keyof T] as string)
						);
						resolve(filtered);
						db.close();
					};

					request.onerror = () => {
						db.close();
						reject(toDbError(request.error));
					};
				});
			},
		};
	}
}

interface Version {
	stores(schema: Record<string, string>): Version;
}

/**
 * Database class providing table access.
 */
export class Database {
	private dbName: string;
	private storeNames: string[] = [];
	private initialized = false;

	constructor(dbName: string) {
		this.dbName = dbName;
	}

	version(versionNumber: number): Version {
		return {
			stores: (schema: Record<string, string>) => {
				if (this.initialized) {
					throw new Error("Database schema already initialized");
				}
				this.storeNames = Object.keys(schema);
				const tables: Record<string, Table<{ id: string }>> = {};
				for (const [tableName] of Object.entries(schema)) {
					tables[tableName] = new Table(
						tableName,
						this.dbName,
						this.storeNames
					);
				}
				Object.assign(this, tables);
				this.initialized = true;
				return {
					stores: () => {
						throw new Error("Schema already defined");
					},
				};
			},
		};
	}
}
