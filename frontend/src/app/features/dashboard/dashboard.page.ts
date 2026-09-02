import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { MetaInfo, SummaryResponse, TrendResponse } from '../../core/models';
import { fmtMoney, pct } from '../../core/format';
import { PageHeader, YearSelect } from '../../shared/ui';
import { TrendChart } from '../../shared/trend-chart';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, YearSelect, TrendChart],
  templateUrl: './dashboard.page.html'
})
export class DashboardPage implements OnInit {
  private http = inject(HttpClient);
  auth = inject(AuthService);

  fmtMoney = fmtMoney;
  pct = pct;

  year = signal(new Date().getFullYear());
  years = signal<number[]>([new Date().getFullYear()]);
  data = signal<SummaryResponse | null>(null);
  trend = signal<TrendResponse | null>(null);

  ngOnInit() {
    firstValueFrom(this.http.get<MetaInfo>('/api/meta')).then((meta) => {
      this.years.set(meta.years);
    }).catch(() => {});
    this.load();
  }

  loadYear(y: number) {
    this.year.set(y);
    this.load();
  }

  private async load() {
    const y = this.year();
    const [sum, trend] = await Promise.all([
      firstValueFrom(this.http.get<SummaryResponse>(`/api/dashboard/summary?year=${y}`)),
      firstValueFrom(this.http.get<TrendResponse>(`/api/dashboard/trend?year=${y}`))
    ]);
    if (this.year() !== y) return;
    this.data.set(sum);
    this.trend.set(trend);
  }

  subtitleText(): string {
    const dept = this.auth.user()?.role === 'USER' ? 'departemen Anda' : 'seluruh departemen';
    return `Ringkasan Cost Reduction ${dept} — Actual CR dihitung otomatis (Budget − Actual Biaya)`;
  }

  ideaCountLabel(): string {
    return `${this.data()?.totals.ideasCount ?? 0} idea terdaftar`;
  }

  achievementTone(): 'default' | 'positive' | 'negative' {
    const p = this.data()?.totals.achievementPct;
    if (p == null) return 'default';
    return p >= 100 ? 'positive' : 'negative';
  }
}
