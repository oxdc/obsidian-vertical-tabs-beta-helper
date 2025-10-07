import { BuildData } from "./response";

interface CacheEntry<T> {
	data: T;
	timestamp: number;
}

export interface SubscriptionData {
	email: string;
	renew_date: string;
	expires_at: string;
	valid: boolean;
}

export interface BuildsResult {
	data: BuildData[];
	total: number;
	has_more: boolean;
}

const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

class Cache {
	private builds: Map<string, CacheEntry<BuildData[]>> = new Map();
	private buildTotals: Map<string, number> = new Map();
	private subscription: CacheEntry<SubscriptionData> | null = null;

	private isExpired(timestamp: number): boolean {
		return Date.now() - timestamp > CACHE_TTL;
	}

	async fetchBuilds(
		token: string,
		page: number,
		pageSize: number,
		fetchFn: () => Promise<BuildsResult>
	): Promise<BuildsResult> {
		const key = `${token}-${page}`;
		const entry = this.builds.get(key);
		const cachedTotal = this.buildTotals.get(token);
		const cacheHit = entry && cachedTotal !== undefined;
		if (cacheHit && !this.isExpired(entry.timestamp)) {
			const has_more = (page + 1) * pageSize < cachedTotal;
			const result = { data: entry.data, total: cachedTotal, has_more };
			return result;
		} else {
			const result = await fetchFn();
			this.builds.set(key, { data: result.data, timestamp: Date.now() });
			this.buildTotals.set(token, result.total);
			return result;
		}
	}

	async fetchSubscription(
		fetchFn: () => Promise<SubscriptionData>
	): Promise<SubscriptionData> {
		if (this.subscription && !this.isExpired(this.subscription.timestamp)) {
			return this.subscription.data;
		} else {
			const data = await fetchFn();
			this.subscription = { data, timestamp: Date.now() };
			return data;
		}
	}

	invalidate(): void {
		this.builds.clear();
		this.buildTotals.clear();
		this.subscription = null;
	}
}

export const cache = new Cache();
