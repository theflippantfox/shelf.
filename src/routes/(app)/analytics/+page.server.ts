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

export const load: RequestHandler = async ({ locals, url, setHeaders }) => {
	const shop = locals.currentShop;
	if (!shop) return {};

	const shopId = shop.id;
	const shopTz = shop.timezone ?? 'UTC';
	const currency = shop.currency_symbol ?? '$';
	const period: Period = parsePeriod(url, shopTz);

	const client = adminClient();

	const [currentSales, compareSales, customers] = await Promise.all([
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
	]);

	const currentIds = (currentSales as any[])
		.map((sale) => sale.id)
		.filter(Boolean);

	const compareIds = (compareSales as any[])
		.map((sale) => sale.id)
		.filter(Boolean);

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
		saleItems as any[],
		compareSaleItems as any[],
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
	const products = buildProducts(saleItems as any[]);
	const categories = buildCategories(saleItems as any[]);
	const customerInsights = buildCustomerInsights(
		currentSales as any[],
		customers as any[]
	);
	const heatmap = buildHeatmap(currentSales as any[], shopTz);
	const slowMovers = buildSlowMovers(
		saleItems as any[],
		(currentSales as any[])[0]?.sale_items ?? []
	);

	setHeaders({
		'cache-control': 'private, max-age=60',
	});

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
		},
	};
};
