<script lang="ts">
	export let data: number[] = [];
	export let color: string = 'var(--primary)';
	export let width: number = 80;
	export let height: number = 30;

	import { onMount } from 'svelte';
	import Chart from 'chart.js/auto';

	let canvas: HTMLCanvasElement;
	let chart: any;

	onMount(() => {
		if (!canvas) return;
		chart = new Chart(canvas, {
			type: 'line',
			data: {
				labels: data.map((_, i) => i),
				datasets: [
					{
						data,
						borderColor: color,
						backgroundColor: 'transparent',
						fill: false,
						tension: 0.4,
						pointRadius: 1,
						borderWidth: 2
					}
				]
			},
			options: {
				responsive: false,
				maintainAspectRatio: false,
				plugins: { legend: { display: false }, tooltip: { enabled: false } },
				scales: {
					x: { display: false },
					y: { display: false }
				}
			}
		});
	});
</script>

<canvas
	bind:this={canvas}
	width={width}
	height={height}
	style="width: {width}px; height: {height}px;"
/>
