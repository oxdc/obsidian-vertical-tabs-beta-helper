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
	private builds: Map<number, CacheEntry<BuildData[]>> = new Map();
	private buildTotal: number | null = null;
	private subscription: CacheEntry<SubscriptionData> | null = null;

	private isExpired(timestamp: number): boolean {
		return Date.now() - timestamp > CACHE_TTL;
	}

	async fetchBuilds(page: number, pageSize: number, fetchFn: () => Promise<BuildsResult>): Promise<BuildsResult> {
		const entry = this.builds.get(page);
		const total = this.buildTotal;
		if (entry && total !== null && !this.isExpired(entry.timestamp)) {
			const has_more = (page + 1) * pageSize < total;
			return { data: entry.data, total, has_more };
		} else {
			const result = await fetchFn();
			this.builds.set(page, { data: result.data, timestamp: Date.now() });
			this.buildTotal = result.total;
			return result;
		}
	}

	async fetchSubscription(fetchFn: () => Promise<SubscriptionData>): Promise<SubscriptionData> {
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
		this.buildTotal = null;
		this.subscription = null;
	}
}

export const cache = new Cache();
