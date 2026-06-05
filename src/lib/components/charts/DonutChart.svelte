<script lang="ts">
	export let values: number[] = [];
	export let labels: string[] = [];
	export let colors: string[] = [
		'#2DD4BF',
		'#3B82F6',
		'#FBBF24',
		'#F87171',
		'#A78BFA'
	];
	export let height: string = '200px';

	let canvas: HTMLCanvasElement;
	let chart: any;

	import { onMount, onDestroy } from 'svelte';
	import Chart from 'chart.js/auto';

	onMount(() => {
		if (!canvas) return;
		chart = new Chart(canvas, {
			type: 'doughnut',
			data: {
				labels,
				datasets: [
					{
						data: values,
						backgroundColor: colors.slice(0, values.length),
						borderWidth: 0
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: { legend: { display: false } },
				cutout: '75%'
			}
		});
	});

	$: if (chart && values) {
		chart.data.labels = labels;
		chart.data.datasets[0].data = values;
		chart.update('none');
	}

	onDestroy(() => {
		if (chart) chart.destroy();
	});
</script>

<div style="height: {height};">
	<canvas bind:this={canvas}></canvas>
</div>
