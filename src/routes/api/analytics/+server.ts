import { json, type RequestHandler } from '@sveltejs/kit';
import { directus } from '$lib/server/directus';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

export const GET: RequestHandler = async ({ url, locals }) => {
  const { shopId } = locals;
  if (!shopId) return json({ error: 'Unauthorized' }, { status: 401 });

  // 1. Resolve Shop Context
  const shop = await directus.request('GET', '/items/shops', {
    params: {
      filter: { id: { _eq: shopId } },
      fields: ['*', 'currency_symbol', 'timezone']
    }
  });
  const shopData = shop[0];
  const shopTz = shopData?.timezone || 'UTC';

  // 2. Period Selection
  const period = url.searchParams.get('period');
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  let start = dayjs().tz(shopTz).startOf('day');
  let end = dayjs().tz(shopTz);

  if (fromParam && toParam) {
    start = dayjs.tz(fromParam, shopTz).startOf('day');
    end = dayjs.tz(toParam, shopTz).endOf('day');
  } else if (period) {
    switch (period) {
      case 'today':
        start = dayjs().tz(shopTz).startOf('day');
        end = dayjs().tz(shopTz);
        break;
      case 'yesterday':
        start = dayjs().tz(shopTz).subtract(1, 'day').startOf('day');
        end = dayjs().tz(shopTz).subtract(1, 'day').endOf('day');
        break;
      case '7d':
        start = dayjs().tz(shopTz).subtract(7, 'day').startOf('day');
        end = dayjs().tz(shopTz).subtract(1, 'day').endOf('day');
        break;
      case '30d':
        start = dayjs().tz(shopTz).subtract(30, 'day').startOf('day');
        end = dayjs().tz(shopTz).subtract(1, 'day').endOf('day');
        break;
      case '90d':
        start = dayjs().tz(shopTz).subtract(90, 'day').startOf('day');
        end = dayjs().tz(shopTz).subtract(1, 'day').endOf('day');
        break;
      case 'this_month':
        start = dayjs().tz(shopTz).startOf('month');
        end = dayjs().tz(shopTz);
        break;
      case 'last_month':
        start = dayjs().tz(shopTz).subtract(1, 'month').startOf('month');
        end = dayjs().tz(shopTz).subtract(1, 'month').endOf('month');
        break;
      case 'this_year':
        start = dayjs().tz(shopTz).startOf('year');
        end = dayjs().tz(shopTz);
        break;
    }
  }

  const diffDays = end.diff(start, 'day') + 1;
  const compStart = start.subtract(diffDays, 'day');
  const compEnd = end.subtract(diffDays, 'day');

  const formatISO = (d) => d.toISOString();

  // 3. Data Fetching
  // Fetch sales for both periods in one go to reduce requests
  const salesParams = {
    params: {
      filter: {
        shop: { _eq: shopId },
        voided_at: { _null: true },
        _or: [
          { date_created: { _between: [`${formatISO(start)}`, `${formatISO(end)}`] } },
          { date_created: { _between: [`${formatISO(compStart)}`, `${formatISO(compEnd)}`] } }
        ]
      },
      fields: ['*', { sale_items: ['*', { product: ['*', { category: ['*'] }] }] }],
      limit: -1
    }
  };

  const allSales = await directus.request('GET', '/items/sales', salesParams);

  const currentSales = allSales.filter(s => {
    const d = dayjs(s.date_created).tz(shopTz);
    return d.isSameOrAfter(start) && d.isSameOrBefore(end);
  });

  const prevSales = allSales.filter(s => {
    const d = dayjs(s.date_created).tz(shopTz);
    return d.isSameOrAfter(compStart) && d.isSameOrBefore(compEnd);
  });

  // --- KPI Calculations ---
  const calcKpis = (sales) => {
    let revenue = 0;
    let txns = sales.length;
    let totalCogs = 0;
    let productsWithCost = 0;
    let totalItemsSold = 0;

    sales.forEach(s => {
      revenue += s.total || 0;
      s.sale_items?.forEach(item => {
        const cost = item.product?.cost_price || 0;
        if (cost > 0) {
          totalCogs += cost * item.qty;
          productsWithCost++;
        }
        totalItemsSold += item.qty;
      });
    });

    const aov = txns > 0 ? revenue / txns : 0;
    const margin = revenue > 0 ? ((revenue - totalCogs) / revenue) * 100 : 0;
    const costCoverage = sales.flatMap(s => s.sale_items || []).length > 0 
      ? (productsWithCost / sales.flatMap(s => s.sale_items || []).length) * 100 
      : 0;

    return { revenue, txns, aov, margin, costCoverage, totalCogs, totalItemsSold };
  };

  const currentKpi = calcKpis(currentSales);
  const prevKpi = calcKpis(prevSales);

  const getDelta = (curr, prev) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return ((curr - prev) / prev) * 100;
  };

  // --- Revenue Trend ---
  const getTrend = (sales, start, end, granularity = 'day') => {
    const map = {};
    sales.forEach(s => {
      const d = dayjs(s.date_created).tz(shopTz);
      const key = granularity === 'day' ? d.format('YYYY-MM-DD') : d.format('YYYY-MM-DD HH');
      map[key] = (map[key] || 0) + s.total;
    });
    return map;
  };

  const currentTrend = getTrend(currentSales, start, end);
  const prevTrend = getTrend(prevSales, compStart, compEnd);

  // --- Distributions ---
  const paymentMethods = {};
  currentSales.forEach(s => {
    const method = s.payment_method || 'Unknown';
    paymentMethods[method] = (paymentMethods[method] || 0) + s.total;
  });

  const hourlyDist = Array(24).fill(0);
  const dailyDist = Array(7).fill(0); // 0=Sun, 6=Sat
  currentSales.forEach(s => {
    const d = dayjs(s.date_created).tz(shopTz);
    hourlyDist[d.hour()] += s.total;
    dailyDist[d.day()] += s.total;
  });

  // --- Product Performance ---
  const productStats = {};
  currentSales.forEach(s => {
    s.sale_items?.forEach(item => {
      const id = item.product?.id || item.product_sku;
      if (!productStats[id]) {
        productStats[id] = { 
          name: item.product_name, 
          revenue: 0, 
          units: 0, 
          cost: 0,
          category: item.product?.category?.name || 'Uncategorized'
        };
      }
      productStats[id].revenue += item.line_total;
      productStats[id].units += item.qty;
      productStats[id].cost += (item.product?.cost_price || 0) * item.qty;
    });
  });

  const productsArray = Object.values(productStats).map(p => ({
    ...p,
    margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0
  }));

  const topRevenue = [...productsArray].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const topUnits = [...productsArray].sort((a, b) => b.units - a.units).slice(0, 10);

  // --- Category Breakdown ---
  const categories = {};
  productsArray.forEach(p => {
    if (!categories[p.category]) {
      categories[p.category] = { revenue: 0, profit: 0, units: 0 };
    }
    categories[p.category].revenue += p.revenue;
    categories[p.category].profit += (p.revenue - p.cost);
    categories[p.category].units += p.units;
  });

  // --- Customer Insights ---
  const customerStats = {};
  currentSales.forEach(s => {
    const cid = s.customer;
    if (!cid) return;
    if (!customerStats[cid]) {
      customerStats[cid] = { spend: 0, visits: 0 };
    }
    customerStats[cid].spend += s.total;
    customerStats[cid].visits += 1;
  });

  const topCustomers = Object.entries(customerStats)
    .map(([id, stats]) => ({ id, ...stats }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 8);

  // --- Heatmap ---
  const heatmap = Array(7).fill(0).map(() => Array(24).fill(0));
  const counts = Array(7).fill(0).map(() => Array(24).fill(0));
  currentSales.forEach(s => {
    const d = dayjs(s.date_created).tz(shopTz);
    const day = d.day();
    const hour = d.hour();
    heatmap[day][hour] += s.total;
    counts[day][hour]++;
  });

  // Average the heatmap
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (counts[d][h] > 0) heatmap[d][h] /= counts[d][h];
    }
  }

  // --- Slow Movers ---
  const slowMovers = productsArray
    .filter(p => p.units <= 2)
    .sort((a, b) => a.units - b.units);

  return json({
    shop: {
      currency_symbol: shopData.currency_symbol,
      timezone: shopTz
    },
    period: {
      start,
      end,
      compStart,
      compEnd,
      diffDays
    },
    kpis: {
      revenue: {
        current: currentKpi.revenue,
        previous: prevKpi.revenue,
        delta: getDelta(currentKpi.revenue, prevKpi.revenue)
      },
      transactions: {
        current: currentKpi.txns,
        previous: prevKpi.txns,
        delta: getDelta(currentKpi.txns, prevKpi.txns)
      },
      aov: {
        current: currentKpi.aov,
        previous: prevKpi.aov,
        delta: getDelta(currentKpi.aov, prevKpi.aov)
      },
      margin: {
        current: currentKpi.margin,
        previous: prevKpi.margin,
        delta: currentKpi.margin - prevKpi.margin, // percentage points
        coverage: currentKpi.costCoverage
      }
    },
    trends: {
      current: currentTrend,
      previous: prevTrend
    },
    distributions: {
      paymentMethods,
      hourlyDist,
      dailyDist
    },
    products: {
      topRevenue,
      topUnits
    },
    categories,
    customers: {
      topCustomers
    },
    heatmap,
    slowMovers
  });
};
