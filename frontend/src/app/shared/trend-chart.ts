import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, effect, input, viewChild
} from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { TrendMonth } from '../core/models';
import { fmtCompact, fmtNum } from '../core/format';

Chart.register(...registerables);

/** Grafik tren bulanan: bar Target vs bar Actual CR + garis kumulatif YTD. */
@Component({
  selector: 'app-trend-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div class="relative h-80 w-full"><canvas #canvas></canvas></div>'
})
export class TrendChart implements AfterViewInit {
  months = input.required<TrendMonth[]>();
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart | null = null;

  constructor() {
    effect(() => {
      const data = this.months();
      if (this.chart && data.length) this.update(data);
    });
  }

  ngAfterViewInit() {
    const ctx = this.canvas().nativeElement.getContext('2d');
    if (!ctx) return;
    const data = this.months();
    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          { label: 'Target', data: [], backgroundColor: '#D8D2C6', borderRadius: 3, order: 3 },
          { label: 'Actual CR', data: [], backgroundColor: '#175E4C', borderRadius: 3, order: 2 },
          { label: 'Kumulatif YTD', data: [], type: 'line', borderColor: '#A16207', backgroundColor: '#A16207', borderWidth: 1.75, pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: '#A16207', tension: 0.25, yAxisID: 'y1', order: 1 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1C1917',
            titleFont: { family: '"Public Sans Variable", sans-serif', size: 11 },
            bodyFont: { family: '"Public Sans Variable", sans-serif', size: 12 },
            padding: 10,
            cornerRadius: 6,
            callbacks: {
              label: (item) => ` ${item.dataset.label}: ${fmtNum(item.parsed.y as number)}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: '#E7E2D9' },
            ticks: { color: '#78716C', font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: 'rgba(28,25,23,0.055)' },
            ticks: { color: '#78716C', font: { size: 11 }, callback: (v) => fmtCompact(v as number) }
          },
          y1: {
            position: 'right',
            beginAtZero: true,
            border: { display: false },
            grid: { drawOnChartArea: false },
            ticks: { color: '#A16207', font: { size: 11 }, callback: (v) => fmtCompact(v as number) }
          }
        }
      }
    });
    this.update(data);
  }

  private update(data: TrendMonth[]) {
    const chart = this.chart;
    if (!chart) return;
    chart.data.labels = data.map((m) => ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][m.month - 1]);
    chart.data.datasets[0].data = data.map((m) => m.target);
    chart.data.datasets[1].data = data.map((m) => m.actual);
    chart.data.datasets[2].data = data.map((m) => m.cumulative);
    chart.update();
  }
}
