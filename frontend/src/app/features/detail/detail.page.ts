import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, httpError } from '../../core/auth.service';
import { Department, DetailIdea, MetaInfo } from '../../core/models';
import { MONTHS_ID, fmtNum } from '../../core/format';
import { PageHeader, YearSelect } from '../../shared/ui';

interface DeptGroup {
  dept: string;
  ideas: DetailIdea[];
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, YearSelect],
  templateUrl: './detail.page.html'
})
export class DetailPage implements OnInit {
  private http = inject(HttpClient);
  auth = inject(AuthService);

  fmt = (v: number | null | undefined, digits = 2) => fmtNum(v, digits);
  isUser = this.auth.user()?.role === 'USER';

  year = signal(new Date().getFullYear());
  years = signal<number[]>([new Date().getFullYear()]);
  departments = signal<Department[]>([]);
  deptId = signal<string | ''>('');
  ideas = signal<DetailIdea[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  expanded = signal<Set<string>>(new Set());

  grouped = computed<DeptGroup[]>(() => {
    const map = new Map<string, DetailIdea[]>();
    for (const idea of this.ideas()) {
      if (!map.has(idea.departmentName)) map.set(idea.departmentName, []);
      map.get(idea.departmentName)!.push(idea);
    }
    return [...map.entries()].map(([dept, list]) => ({ dept, ideas: list }));
  });

  ngOnInit() {
    firstValueFrom(this.http.get<MetaInfo>('/api/meta')).then((meta) => this.years.set(meta.years));
    firstValueFrom(this.http.get<Department[]>('/api/departments')).then((d) => {
      this.departments.set(d);
      if (this.isUser) {
        const own = this.auth.user()?.departmentId;
        this.deptId.set(own ?? '');
      }
    });
    this.load();
  }

  setYear(y: number) { this.year.set(y); this.load(); }
  setDept(v: string) { this.deptId.set(v); this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const p = new URLSearchParams({ year: String(this.year()) });
      const dept = this.isUser ? this.auth.user()?.departmentId : this.deptId();
      if (dept) p.set('department_id', String(dept));
      const resp = await firstValueFrom(this.http.get<{ year: number; ideas: DetailIdea[] }>(`/api/report/detail?${p}`));
      this.ideas.set(resp.ideas);
      this.expanded.set(new Set());
    } catch (err) {
      this.error.set(httpError(err as never));
    } finally {
      this.loading.set(false);
    }
  }

  keyOf(idea: DetailIdea): string {
    return `${idea.departmentName}::${idea.name}`;
  }

  toggleExpanded(idea: DetailIdea) {
    const key = this.keyOf(idea);
    this.expanded.update((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  ideaIndex(group: DeptGroup, idea: DetailIdea): number {
    return group.ideas.indexOf(idea);
  }

  monthName(m: number): string {
    return MONTHS_ID[m - 1];
  }
}
