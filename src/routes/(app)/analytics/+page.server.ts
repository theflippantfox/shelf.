import type { RequestHandler } from '@sveltejs/kit';
import { adminClient, readItems } from '$lib/server/directus';
import {
	buildKpis,
	buildTrend,
	buildPaymentMethods,
	buildHourly,
	buildWeekday,
	buildProducts,
	buildCategories,
	buildCustomerInsights,
	buildHeatmap,
	buildSlowMovers,
	parsePeriod,
	type Period,
	type KpiSet,
	type PaymentRow,
	type TimeSlot,
	type ProductSet,
	type CategoryRow,
	type CustomerInsights,
} from '$lib/utils/analytics';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

// ─── Inline helpers ──────────────────────────────────────────────────────────

/**
 * Returns the last 12 calendar months of revenue + transaction counts.
 * Independent of the selected period — always the rolling 12 months to now.
 */
function buildMonthlyTrend(sales: any[], shopTz: string) {
	const now = dayjs().tz(shopTz);
	return Array.from({ length: 12 }, (_, i) => {
		const m = now.subtract(11 - i, 'month');
		const start = m.startOf('month').valueOf();
		const end = m.endOf('month').valueOf();
		const slice = sales.filter((s) => {
			const d = dayjs(s.date_created).tz(shopTz).valueOf();
			return d >= start && d <= end;
		});
		return {
			label: m.format('MMM'),
			month: m.format('YYYY-MM'),
			revenue: slice.reduce((acc, s) => acc + (s.total ?? 0), 0),
			count: slice.length,
		};
	});
}

/**
 * Calculates total inventory value at cost and at retail.
 * `price` and `cost_price` are stored as integers (÷100 = actual value).
 */
function buildStockValue(products: any[]) {
	let costValue = 0;
	let retailValue = 0;
	let totalUnits = 0;
	for (const p of products) {
		const qty = Math.max(0, p.qty ?? 0);
		costValue += qty * (p.cost_price ?? 0);
		retailValue += qty * (p.price ?? 0);
		totalUnits += qty;
	}
	return {
		costValue,
		retailValue,
		totalUnits,
		potentialMargin: retailValue > 0 ? ((retailValue - costValue) / retailValue) * 100 : 0,
	};
}

/**
 * Derives absolute gross profit from sale_items using line_total vs cost.
 * Both values are stored as integers (÷100 = actual).
 */
function buildGrossProfit(items: any[], compareItems: any[]) {
	const calc = (arr: any[]) =>
		arr.reduce((sum, item) => {
			const cost = (item.product?.cost_price ?? 0) * (item.qty ?? 0);
			return sum + (item.line_total ?? 0) - cost;
		}, 0);
	const current = calc(items);
	const previous = calc(compareItems);
	const deltaPct = previous > 0 ? ((current - previous) / previous) * 100 : null;
	return {
		current,
		previous,
		delta:
			deltaPct !== null
				? { pct: Math.round(deltaPct), direction: deltaPct >= 0 ? 'up' : 'down' }
				: null,
	};
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export const load: RequestHandler = async ({ locals, url, setHeaders }) => {
	const shop = locals.currentShop;
	if (!shop) return {};

	const shopId = shop.id;
	const shopTz = shop.timezone ?? 'UTC';
	const currency = shop.currency_symbol ?? '$';
	const period: Period = parsePeriod(url, shopTz);

	const client = adminClient();

	// Monthly window — last 12 full calendar months, always fixed
	const monthlyFrom = dayjs().tz(shopTz).subtract(11, 'month').startOf('month').toISOString();
	const monthlyTo = dayjs().tz(shopTz).endOf('month').toISOString();

	const [currentSales, compareSales, customers, monthlySales, stockProducts] = await Promise.all([
		client.request(
			readItems('sales', {
				filter: {
					shop: { _eq: shopId },
					voided_at: { _null: true },
					date_created: { _gte: period.from, _lte: period.to },
				},
				fields: [
					'id',
					'total',
					'subtotal',
					'tax_amount',
					'payment_method',
					'date_created',
					'customer',
				],
				sort: ['date_created'],
				limit: -1,
			})
		),
		client.request(
			readItems('sales', {
				filter: {
					shop: { _eq: shopId },
					voided_at: { _null: true },
					date_created: { _gte: period.cFrom, _lte: period.cTo },
				},
				fields: [
					'id',
					'total',
					'subtotal',
					'tax_amount',
					'payment_method',
					'date_created',
					'customer',
				],
				sort: ['date_created'],
				limit: -1,
			})
		),
		client.request(
			readItems('customers', {
				filter: { shop: { _eq: shopId } },
				fields: ['*'],
				limit: 100,
			})
		),
		// Rolling 12-month window (independent of selected period)
		client.request(
			readItems('sales', {
				filter: {
					shop: { _eq: shopId },
					voided_at: { _null: true },
					date_created: { _gte: monthlyFrom, _lte: monthlyTo },
				},
				fields: ['id', 'total', 'date_created'],
				sort: ['date_created'],
				limit: -1,
			})
		),
		// All products for stock value calculation
		client.request(
			readItems('products', {
				filter: { shop: { _eq: shopId } },
				fields: ['id', 'price', 'cost_price', 'qty'],
				limit: -1,
			})
		),
	]);

	const currentIds = (currentSales as any[]).map((s) => s.id).filter(Boolean);
	const compareIds = (compareSales as any[]).map((s) => s.id).filter(Boolean);

	const [allCurrentItems, allCompareItems] = await Promise.all([
		currentIds.length
			? client.request(
					readItems('sale_items', {
						filter: { sale: { _in: currentIds } },
						fields: [
							'id',
							'sale',
							'product',
							'product_name',
							'product_sku',
							'qty',
							'unit_price',
							'line_total',
							'product.cost_price',
							'product.category.id',
							'product.category.name',
							'product.category.color',
						],
						limit: -1,
					})
			  )
			: [],
		compareIds.length
			? client.request(
					readItems('sale_items', {
						filter: { sale: { _in: compareIds } },
						fields: ['id', 'sale', 'product', 'qty', 'line_total', 'product.cost_price'],
						limit: -1,
					})
			  )
			: [],
	]);

	const saleItems = allCurrentItems as any[];
	const compareSaleItems = allCompareItems as any[];

	const kpis = buildKpis(
		currentSales as any[],
		compareSales as any[],
		saleItems,
		compareSaleItems,
		shopTz
	);
	const trend = buildTrend(
		currentSales as any[],
		period.from,
		period.to,
		compareSales as any[],
		period.cFrom,
		shopTz
	);
	const paymentMethods = buildPaymentMethods(currentSales as any[]);
	const hourly = buildHourly(currentSales as any[], shopTz);
	const weekday = buildWeekday(currentSales as any[], shopTz);
	const products = buildProducts(saleItems);
	const categories = buildCategories(saleItems);
	const customerInsights = buildCustomerInsights(currentSales as any[], customers as any[]);
	const heatmap = buildHeatmap(currentSales as any[], shopTz);
	const slowMovers = buildSlowMovers(saleItems, (currentSales as any[])[0]?.sale_items ?? []);
	const monthlyTrend = buildMonthlyTrend(monthlySales as any[], shopTz);
	const stockValue = buildStockValue(stockProducts as any[]);
	const grossProfit = buildGrossProfit(saleItems, compareSaleItems);

	setHeaders({ 'cache-control': 'private, max-age=60' });

	return {
		analytics: {
			shopTz,
			currency,
			period,
			kpis,
			trend,
			paymentMethods,
			hourly,
			weekday,
			products,
			categories,
			customers: customerInsights,
			heatmap,
			slowMovers,
			monthlyTrend,
			stockValue,
			grossProfit,
		},
	};
};
