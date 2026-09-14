import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, effect, input, viewChild
} from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { TrendMonth } from '../core/models';
import { fmtCompact, fmtNum } from '../core/format';

Chart.register(...registerables);

@Component({
  selector: 'app-trend-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4">
      <!-- Area Canvas Grafik -->
      <div class="relative h-72 w-full rounded-lg bg-[#FAF8F5] p-3 border border-emerald-200">
        <canvas #canvas></canvas>
      </div>

      <!-- Tabel Data Matriks Excel -->
      <div class="overflow-x-auto rounded-md border border-hairline">
        <table class="w-full min-w-[700px] border-collapse text-xs">
          <thead>
            <tr class="bg-surface text-ink">
              <th class="border border-hairline p-2 text-left font-semibold">Metrik</th>
              @for (m of months(); track m.month) {
                <th class="border border-hairline p-2 text-center font-medium">{{ getMonthLabel(m.month) }}</th>
              }
            </tr>
          </thead>
          <tbody class="bg-white">
            <!-- Actual CR Row -->
            <tr>
              <td class="border border-hairline p-2 font-medium text-ink">
                <span class="mr-2 inline-block h-2.5 w-2.5 rounded-[3px] bg-[#B7A88C]"></span> Actual CR
              </td>
              @for (m of months(); track m.month) {
                <td class="border border-hairline p-2 text-center tabular-nums text-ink-soft">{{ m.actual ? fmtNum(m.actual) : '-' }}</td>
              }
            </tr>

            <!-- Potential CR / Target Row -->
            <tr>
              <td class="border border-hairline p-2 font-medium text-ink">
                <span class="mr-2 inline-block h-2.5 w-2.5 rounded-[3px] bg-[#5B7FBF]"></span> Potential CR
              </td>
              @for (m of months(); track m.month) {
                <td class="border border-hairline p-2 text-center tabular-nums text-ink-soft">{{ m.potential ? fmtNum(m.potential) : '-' }}</td>
              }
            </tr>

            <!-- YTD Actual CR Row -->
            <tr class="bg-surface/60">
              <td class="border border-hairline p-2 font-medium text-ink">
                <span class="mr-2 inline-block h-1 w-3 rounded bg-[#8B0000]"></span> YTD Actual CR
              </td>
              @for (m of months(); track m.month) {
                <td class="border border-hairline p-2 text-center tabular-nums font-medium text-forest">{{ m.cumulative ? fmtNum(m.cumulative) : '-' }}</td>
              }
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class TrendChart implements AfterViewInit {
  months = input.required<TrendMonth[]>();
  fmtNum = fmtNum;
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
          {
            type: 'bar',
            label: 'Actual CR',
            data: [],
            backgroundColor: '#C2B49A',
            barPercentage: 0.5,
            yAxisID: 'y',
            order: 3
          },
          {
            type: 'line',
            label: 'Potential CR',
            data: [],
            borderColor: '#2563EB',
            backgroundColor: '#2563EB',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0,
            yAxisID: 'y',
            order: 2
          },
          {
            type: 'line',
            label: 'YTD Actual CR',
            data: [],
            borderColor: '#8B0000',
            backgroundColor: '#FFD700',
            pointBackgroundColor: '#FFD700',
            pointBorderColor: '#8B0000',
            borderWidth: 2,
            pointRadius: 4,
            tension: 0,
            yAxisID: 'y1',
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#14233B',
            titleFont: { family: '"Inter Variable", sans-serif', size: 11 },
            bodyFont: { family: '"Inter Variable", sans-serif', size: 12 },
            padding: 10,
            cornerRadius: 6,
            callbacks: {
              label: (item) => ` ${item.dataset.label}: ${fmtNum(item.parsed.y as number)}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(0,0,0,0.08)' },
            border: { color: '#E2E8F2' },
            ticks: { color: '#5B6B85', font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            position: 'left',
            title: { display: true, text: 'IDR', font: { size: 10, weight: 'bold' } },
            border: { display: false },
            grid: { color: 'rgba(0,0,0,0.15)', lineWidth: 0.8 },
            ticks: { color: '#5B6B85', font: { size: 11 }, callback: (v) => fmtCompact(v as number) }
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            border: { display: false },
            grid: { drawOnChartArea: true, color: 'rgba(139,0,0,0.1)', lineWidth: 0.6 },
            ticks: { color: '#8B0000', font: { size: 11 }, callback: (v) => fmtCompact(v as number) }
          }
        }
      }
    });

    this.update(data);
  }

  getMonthLabel(m: number): string {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][m - 1] || '';
  }

  private update(data: TrendMonth[]) {
    const chart = this.chart;
    if (!chart) return;
    chart.data.labels = data.map((m) => this.getMonthLabel(m.month));
    chart.data.datasets[0].data = data.map((m) => m.actual);
    chart.data.datasets[1].data = data.map((m) => m.potential);
    chart.data.datasets[2].data = data.map((m) => m.cumulative);
    chart.update();
  }
}