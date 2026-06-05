<script lang="ts">
	export let data: number[] = [];
	export let labels: string[] = [];
	export let color: string = 'var(--primary)';
	export let height: string = '200px';

	let canvas: HTMLCanvasElement;
	let chart: any;

	import { onMount, onDestroy } from 'svelte';
	import Chart from 'chart.js/auto';

	onMount(() => {
		if (!canvas) return;
		chart = new Chart(canvas, {
			type: 'bar',
			data: {
				labels,
				datasets: [
					{
						data,
						backgroundColor: color,
						borderRadius: 3
					}
				]
			},
			options: {
				indexAxis: 'y',
				responsive: true,
				maintainAspectRatio: false,
				plugins: { legend: { display: false } },
				scales: {
					x: { display: false },
					y: {
						grid: { display: false },
						ticks: { color: 'var(--text-3)', font: { size: 10 } }
					}
				}
			}
		});
	});

	$: if (chart && data) {
		chart.data.labels = labels;
		chart.data.datasets[0].data = data;
		chart.update('none');
	}

	onDestroy(() => {
		if (chart) chart.destroy();
	});
</script>

<div style="height: {height};">
	<canvas bind:this={canvas}></canvas>
</div>
