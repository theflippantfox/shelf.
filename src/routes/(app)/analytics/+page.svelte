<script lang="ts">
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import { formatCurrency } from '$lib/utils/format';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import Chart from 'chart.js/auto';
  import { 
    TrendingUp, 
    TrendingDown, 
    Users, 
    ShoppingBag, 
    DollarSign, 
    Percent, 
    BarChart3,
    PieChart,
    LayoutGrid,
    Calendar,
    Clock
  } from 'lucide-svelte';

  let data: any = null;
  let loading = true;
  let activeMetric = 'revenue';

  const presets = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: '7d', value: '7d' },
    { label: '30d', value: '30d' },
    { label: '90d', value: '90d' },
    { label: 'This Month', value: 'this_month' },
    { label: 'Last Month', value: 'last_month' },
    { label: 'This Year', value: 'this_year' },
  ];

  async function fetchAnalytics() {
    loading = true;
    const period = $page.url.searchParams.get('period') || '30d';
    const res = await fetch(`/api/analytics?period=${period}`);
    data = await res.json();
    loading = false;
    initCharts();
  }

  let revenueChart: any, paymentChart: any, hourChart: any, dayChart: any;

  function initCharts() {
    if (!data) return;

    const ctxRevenue = document.getElementById('revenueChart') as HTMLCanvasElement;
    if (ctxRevenue) {
      if (revenueChart) revenueChart.destroy();
      const labels = Object.keys(data.trends.current).sort();
      const currentData = labels.map(l => data.trends.current[l]);
      const prevData = labels.map(l => data.trends.previous[l] || 0);
      revenueChart = new Chart(ctxRevenue, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Current',
              data: currentData,
              borderColor: 'var(--primary)',
              backgroundColor: 'rgba(123, 79, 138, 0.1)',
              fill: true,
              tension: 0.4,
              pointRadius: 2,
              borderWidth: 2
            },
            {
              label: 'Previous',
              data: prevData,
              borderColor: 'var(--text-3)',
              borderDash: [5, 5],
              fill: false,
              tension: 0.4,
              pointRadius: 0,
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'var(--text-3)', font: { size: 10 } } },
            x: { grid: { display: false }, ticks: { color: 'var(--text-3)', font: { size: 10 } } }
          }
        }
      });
    }

    const ctxPayment = document.getElementById('paymentChart') as HTMLCanvasElement;
    if (ctxPayment) {
      if (paymentChart) paymentChart.destroy();
      const labels = Object.keys(data.distributions.paymentMethods);
      const values = Object.values(data.distributions.paymentMethods);
      paymentChart = new Chart(ctxPayment, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: ['#2DD4BF', '#3B82F6', '#FBBF24', '#F87171', '#A78BFA'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          cutout: '75%'
        }
      });
    }

    const ctxHour = document.getElementById('hourChart') as HTMLCanvasElement;
    if (ctxHour) {
      if (hourChart) hourChart.destroy();
      hourChart = new Chart(ctxHour, {
        type: 'bar',
        data: {
          labels: Array.from({length: 24}, (_, i) => `${i}h`),
          datasets: [{
            data: data.distributions.hourlyDist,
            backgroundColor: 'var(--primary)',
            borderRadius: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { display: false },
            x: { grid: { display: false }, ticks: { color: 'var(--text-3)', font: { size: 9 } } }
          }
        }
      });
    }

    const ctxDay = document.getElementById('dayChart') as HTMLCanvasElement;
    if (ctxDay) {
      if (dayChart) dayChart.destroy();
      dayChart = new Chart(ctxDay, {
        type: 'bar',
        data: {
          labels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
          datasets: [{
            data: data.distributions.dailyDist,
            backgroundColor: 'var(--primary)',
            borderRadius: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { display: false },
            x: { grid: { display: false }, ticks: { color: 'var(--text-3)', font: { size: 10 } } }
          }
        }
      });
    }
  }

  onMount(async () => {
    await fetchAnalytics();
  });

  function setPeriod(val: string) {
    goto(`?period=${val}`, { replaceState: true });
    fetchAnalytics();
  }
</script>

<PageShell>
  <div class="p-4 md:p-6 space-y-6">
    
    <!-- Period Selector -->
    <div class="sticky top-20 z-10 bg-surface-1/80 backdrop-blur-md p-2 rounded-xl flex flex-wrap gap-2 justify-center md:justify-start border border-surface-2">
      {#each presets as p}
        <button 
          class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all { $page.url.searchParams.get('period') === p.value ? 'bg-primary text-white shadow-sm' : 'bg-surface-2 text-text-3 hover:bg-surface-3' }"
          on:click={() => setPeriod(p.value)}
        >
          {p.label}
        </button>
      {/each}
    </div>

    {#if loading}
      <div class="flex items-center justify-center h-64">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    {:else if !data}
      <div class="flex items-center justify-center h-64 text-text-3">
        No data available for this period.
      </div>
    {:else}
      <div class="space-y-6">
        <!-- KPI Strip -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="card p-4 space-y-2">
            <div class="flex items-center justify-between text-text-3 text-[10px] font-bold uppercase tracking-wider">
              <span>Revenue</span>
              <DollarSign size={12} />
            </div>
            <div class="text-xl font-bold">{formatCurrency(data.kpis.revenue.current)}</div>
            <div class="flex items-center gap-1 text-[10px] { data.kpis.revenue.delta >= 0 ? 'text-teal' : 'text-crimson' }">
              {#if data.kpis.revenue.delta >= 0}<TrendingUp size={10} />{:else}<TrendingDown size={10} />{/if}
              {Math.abs(data.kpis.revenue.delta).toFixed(1)}% vs prev
            </div>
          </div>
          <div class="card p-4 space-y-2">
            <div class="flex items-center justify-between text-text-3 text-[10px] font-bold uppercase tracking-wider">
              <span>Sales</span>
              <ShoppingBag size={12} />
            </div>
            <div class="text-xl font-bold">{data.kpis.transactions.current}</div>
            <div class="flex items-center gap-1 text-[10px] { data.kpis.transactions.delta >= 0 ? 'text-teal' : 'text-crimson' }">
              {#if data.kpis.transactions.delta >= 0}<TrendingUp size={10} />{:else}<TrendingDown size={10} />{/if}
              {Math.abs(data.kpis.transactions.delta).toFixed(1)}% vs prev
            </div>
          </div>
          <div class="card p-4 space-y-2">
            <div class="flex items-center justify-between text-text-3 text-[10px] font-bold uppercase tracking-wider">
              <span>Avg Order</span>
              <BarChart3 size={12} />
            </div>
            <div class="text-xl font-bold">{formatCurrency(data.kpis.aov.current)}</div>
            <div class="flex items-center gap-1 text-[10px] { data.kpis.aov.delta >= 0 ? 'text-teal' : 'text-crimson' }">
              {#if data.kpis.aov.delta >= 0}<TrendingUp size={10} />{:else}<TrendingDown size={10} />{/if}
              {Math.abs(data.kpis.aov.delta).toFixed(1)}% vs prev
            </div>
          </div>
          <div class="card p-4 space-y-2">
            <div class="flex items-center justify-between text-text-3 text-[10px] font-bold uppercase tracking-wider">
              <span>Gross Margin</span>
              <Percent size={12} />
            </div>
            <div class="text-xl font-bold">{data.kpis.margin.current.toFixed(1)}%</div>
            <div class="flex items-center gap-1 text-[10px] { data.kpis.margin.delta >= 0 ? 'text-teal' : 'text-crimson' }">
              {#if data.kpis.margin.delta >= 0}<TrendingUp size={10} />{:else}<TrendingDown size={10} />{/if}
              {Math.abs(data.kpis.margin.delta).toFixed(1)} pp vs prev
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="card p-4 lg:col-span-2 space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <TrendingUp size={16} class="text-primary" />
                <h3 class="font-semibold text-sm">Revenue Trend</h3>
              </div>
              <div class="flex gap-1 bg-surface-2 p-1 rounded-lg text-[10px]">
                <button class="px-2 py-1 rounded { activeMetric === 'revenue' ? 'bg-primary text-white' : 'text-text-3' }" on:click={() => activeMetric = 'revenue'}>Revenue</button>
                <button class="px-2 py-1 rounded { activeMetric === 'transactions' ? 'bg-primary text-white' : 'text-text-3' } " on:click={() => activeMetric = 'transactions'}>Txns</button>
                <button class="px-2 py-1 rounded { activeMetric === 'aov' ? 'bg-primary text-white' : 'text-text-3' } " on:click={() => activeMetric = 'aov'}>AOV</button>
              </div>
            </div>
            <div class="h-72 w-full">
              <canvas id="revenueChart"></canvas>
            </div>
          </div>

          <div class="card p-4 space-y-4">
            <div class="flex items-center gap-2">
              <PieChart size={16} class="text-primary" />
              <h3 class="font-semibold text-sm">Payment Methods</h3>
            </div>
            <div class="h-48 w-full relative">
              <canvas id="paymentChart"></canvas>
            </div>
            <div class="space-y-2 pt-2">
              {#each Object.entries(data.distributions.paymentMethods) as [method, value]}
                <div class="flex items-center justify-between text-[11px]">
                  <span class="text-text-3">{method}</span>
                  <span class="font-medium">{formatCurrency(value as number)}</span>
                </div>
              {/each}
            </div>
          </div>

          <div class="card p-4 space-y-4">
            <div class="flex items-center gap-2">
              <Clock size={16} class="text-primary" />
              <h3 class="font-semibold text-sm">Busiest Hours</h3>
            </div>
            <div class="h-32 w-full">
              <canvas id="hourChart"></canvas>
            </div>
            <p class="text-center text-[10px] text-text-3 italic">Revenue peak by hour of day</p>
          </div>

          <div class="card p-4 space-y-4">
            <div class="flex items-center gap-2">
              <Calendar size={16} class="text-primary" />
              <h3 class="font-semibold text-sm">Sales by Day</h3>
            </div>
            <div class="h-32 w-full">
              <canvas id="dayChart"></canvas>
            </div>
            <p class="text-center text-[10px] text-text-3 italic">Weekly revenue distribution</p>
          </div>

          <div class="card p-4 space-y-4">
            <div class="flex items-center gap-2">
              <Users size={16} class="text-primary" />
              <h3 class="font-semibold text-sm">Top Customers</h3>
            </div>
            <div class="overflow-x-auto">
              <table class="tbl w-full text-[11px]">
                <thead>
                  <tr>
                    <th class="text-left">Name</th>
                    <th class="text-right">Spent</th>
                    <th class="text-right">Visits</th>
                  </tr>
                </thead>
                <tbody>
                  {#each data.customers.topCustomers as c}
                    <tr>
                      <td class="font-medium">{c.name || 'Unknown'}</td>
                      <td class="text-right">{formatCurrency(c.spend)}</td>
                      <td class="text-right">{c.visits}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>

          <div class="card p-4 lg:col-span-3 space-y-4">
            <div class="flex items-center gap-2">
              <LayoutGrid size={16} class="text-primary" />
              <h3 class="font-semibold text-sm">Product Performance</h3>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="overflow-x-auto">
                <table class="tbl w-full text-[11px]">
                  <thead>
                    <tr>
                      <th class="text-left">#</th>
                      <th class="text-left">Product</th>
                      <th class="text-right">Revenue</th>
                      <th class="text-right">Units</th>
                      <th class="text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each data.products.topRevenue as p, i}
                      <tr>
                        <td class="text-text-3">{i + 1}</td>
                        <td class="font-medium">{p.name}</td>
                        <td class="text-right">{formatCurrency(p.revenue)}</td>
                        <td class="text-right">{p.units}</td>
                        <td class="text-right">{p.margin.toFixed(1)}%</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
              <div class="overflow-x-auto">
                <table class="tbl w-full text-[11px]">
                  <thead>
                    <tr>
                      <th class="text-left">#</th>
                      <th class="text-left">Product</th>
                      <th class="text-right">Units</th>
                      <th class="text-right">Revenue</th>
                      <th class="text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each data.products.topUnits as p, i}
                      <tr>
                        <td class="text-text-3">{i + 1}</td>
                        <td class="font-medium">{p.name}</td>
                        <td class="text-right">{p.units}</td>
                        <td class="text-right">{formatCurrency(p.revenue)}</td>
                        <td class="text-right">{p.margin.toFixed(1)}%</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="card p-4 lg:col-span-3 space-y-4">
            <div class="flex items-center gap-2">
              <PieChart size={16} class="text-primary" />
              <h3 class="font-semibold text-sm">Category Performance</h3>
            </div>
            <div class="overflow-x-auto">
              <table class="tbl w-full text-[11px]">
                <thead>
                  <tr>
                    <th class="text-left">Category</th>
                    <th class="text-right">Revenue</th>
                    <th class="text-right">Units</th>
                    <th class="text-right">Avg Sale</th>
                    <th class="text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {#each Object.entries(data.categories) as [name, stats]}
                    <tr>
                      <td class="font-medium">{name}</td>
                      <td class="text-right">{formatCurrency(stats.revenue)}</td>
                      <td class="text-right">{stats.units}</td>
                      <td class="text-right">{formatCurrency(stats.revenue / (stats.units || 1))}</td>
                      <td class="text-right">{stats.margin || '—'}%</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>

          <div class="card p-4 lg:col-span-3 space-y-4">
            <div class="flex items-center gap-2">
              <Clock size={16} class="text-primary" />
              <h3 class="font-semibold text-sm">Busiest Times Heatmap</h3>
            </div>
            <div class="overflow-x-auto pb-2">
              <div class="grid grid-cols-1 gap-2 text-[10px]">
                {#each data.heatmap as dayRow, i}
                  <div class="flex items-center gap-2">
                    <span class="w-8 text-text-3 uppercase font-bold">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][i]}</span>
                    <div class="grid grid-cols-24 gap-1 flex-1">
                      {#each dayRow as cell}
                        <div 
                          class="h-5 w-full rounded-sm transition-all hover:bg-primary" 
                          style="background-color: rgba(123, 79, 138, { 0.05 + (cell / (data.heatmap.flat().reduce((a,b) => a+b, 0) || 1) * 12) })"
                        ></div>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
            <p class="text-center text-[10px] text-text-3 italic">Intensity represents average revenue per time slot</p>
          </div>
        </div>
      </div>
    {/if}
  </div>
</PageShell>
