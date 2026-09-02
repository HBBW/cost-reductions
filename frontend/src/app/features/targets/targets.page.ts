import { ChangeDetectionStrategy, Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, httpError } from '../../core/auth.service';
import { Department, IdeaListItem, MetaInfo } from '../../core/models';
import { fmtNum, parseRupiahInput, rupiahFmt } from '../../core/format';
import { PageHeader, SaveBar, YearSelect } from '../../shared/ui';

interface IdeaTarget {
  id: number;
  name: string;
  departmentId: string;
  departmentName: string;
  budget: number;
  potentialCr: number;
  actual: number;
}

interface DeptGroup {
  dept: string;
  items: { idea: IdeaTarget; index: number }[];
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, YearSelect, SaveBar],
  templateUrl: './targets.page.html'
})
export class TargetsPage implements OnInit {
  private http = inject(HttpClient);
  auth = inject(AuthService);

  fmt = (v: number | null | undefined) => fmtNum(v, 0);
  rupiahFmt = rupiahFmt;
  parseRupiahInput = parseRupiahInput;
  MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  year = signal(new Date().getFullYear());
  years = signal<number[]>([new Date().getFullYear()]);
  departments = signal<Department[]>([]);
  selectedDeptId = signal<string | null>(null);

  ideas = signal<IdeaTarget[]>([]);
  baseline = signal<IdeaTarget[]>([]);
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);

  isMR = this.auth.user()?.role === 'MR';

  deptName = computed(() => {
    const id = this.isMR ? this.selectedDeptId() : (this.auth.user()?.departmentId ?? null);
    return this.departments().find((d) => d.id === id)?.name ?? '';
  });

  /** True bila tanggal hari ini sudah melewati 19 Februari tahun berjalan (target terkunci). */
  targetLocked = computed(() => {
    const now = new Date();
    const lockDate = new Date(now.getFullYear(), 1, 19); // 19 Feb
    return now.getTime() > lockDate.getTime();
  });

  dirtyCount = computed(() => {
    const cur = this.ideas();
    const base = this.baseline();
    let n = 0;
    for (let i = 0; i < cur.length; i++) {
      if (cur[i]?.budget !== base[i]?.budget || cur[i]?.potentialCr !== base[i]?.potentialCr) n++;
    }
    return n;
  });

  totalBudget = computed(() => this.ideas().reduce((s, i) => s + i.budget, 0));
  totalPotential = computed(() => this.ideas().reduce((s, i) => s + i.potentialCr, 0));
  totalActual = computed(() => this.ideas().reduce((s, i) => s + i.actual, 0));

  /** Grup idea per departemen, menyimpan indeks datar untuk edit inline. */
  grouped = computed<DeptGroup[]>(() => {
    const list = this.ideas();
    const map = new Map<string, { idea: IdeaTarget; index: number }[]>();
    list.forEach((idea, index) => {
      if (!map.has(idea.departmentName)) map.set(idea.departmentName, []);
      map.get(idea.departmentName)!.push({ idea, index });
    });
    return [...map.entries()].map(([dept, items]) => ({ dept, items }));
  });

  groupTotals(group: DeptGroup): { budget: number; potential: number; actual: number } {
    return group.items.reduce(
      (acc, { idea }) => ({
        budget: acc.budget + idea.budget,
        potential: acc.potential + idea.potentialCr,
        actual: acc.actual + idea.actual
      }),
      { budget: 0, potential: 0, actual: 0 }
    );
  }

  ngOnInit() {
    firstValueFrom(this.http.get<MetaInfo>('/api/meta'))
      .then((meta) => this.years.set(this.buildYears(meta.years)))
      .catch(() => {});
    firstValueFrom(this.http.get<Department[]>('/api/departments'))
      .then((d) => {
        this.departments.set(d);
        this.loadIdeas();
      })
      .catch(() => { this.loadIdeas(); });
  }

  /** Tahun yang bisa dipilih: meta-years + rentang beberapa tahun untuk MR/FA agar bisa input data takhta dan yang belum ada ide-nya. */
  private buildYears(metaYears: number[]): number[] {
    const role = this.auth.user()?.role;
    const ys = [...metaYears];
    if (role === 'MR' || role === 'FA') {
      const now = new Date().getFullYear();
      for (let y = now - 5; y <= now + 2; y++) {
        if (!ys.includes(y)) ys.push(y);
      }
    }
    return ys.sort((a, b) => b - a);
  }

  setYear(y: number) { this.year.set(y); this.loadIdeas(); }
  setDept(id: string) { this.selectedDeptId.set(id ? id : null); this.loadIdeas(); }

  private deptParam(): string | null {
    return this.isMR ? this.selectedDeptId() : (this.auth.user()?.departmentId ?? null);
  }

  async loadIdeas() {
    const dept = this.deptParam();
    this.loading.set(true);
    this.error.set(null);
    try {
      const p = new URLSearchParams({ year: String(this.year()) });
      if (dept) p.set('department_id', dept);
      const list = await firstValueFrom(this.http.get<IdeaListItem[]>(`/api/ideas?${p}`));
      const mapped: IdeaTarget[] = list.map((i) => ({
        id: i.id,
        name: i.name,
        departmentId: i.departmentId,
        departmentName: i.departmentName,
        budget: i.budget,
        potentialCr: i.potentialCr,
        actual: i.actual
      }));
      this.ideas.set(mapped);
      this.baseline.set(mapped.map((r) => ({ ...r })));
    } catch (err) {
      this.error.set(httpError(err as never));
    } finally {
      this.loading.set(false);
    }
  }

  onBudget(index: number, ev: Event) {
    const el = ev.target as HTMLInputElement;
    const v = parseRupiahInput(el.value);
    this.ideas.update((rows) => rows.map((r, i) => (i === index ? { ...r, budget: v } : r)));
    el.value = v === 0 ? '' : rupiahFmt.format(v);
  }

  onPotentialCr(index: number, ev: Event) {
    const el = ev.target as HTMLInputElement;
    const v = parseRupiahInput(el.value);
    this.ideas.update((rows) => rows.map((r, i) => (i === index ? { ...r, potentialCr: v } : r)));
    el.value = v === 0 ? '' : rupiahFmt.format(v);
  }

  isDirtyBudget(i: number): boolean {
    return this.ideas()[i]?.budget !== this.baseline()[i]?.budget;
  }

  isDirtyPotential(i: number): boolean {
    return this.ideas()[i]?.potentialCr !== this.baseline()[i]?.potentialCr;
  }

  actualCr(i: IdeaTarget): number {
    return Math.round(i.actual * 100) / 100;
  }

  revertRows() {
    this.ideas.set(this.baseline().map((r) => ({ ...r })));
  }

  async saveAll() {
    if (!this.dirtyCount()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const cur = this.ideas();
      const base = this.baseline();
      for (let i = 0; i < cur.length; i++) {
        if (cur[i].budget !== base[i]?.budget || cur[i].potentialCr !== base[i]?.potentialCr) {
          await firstValueFrom(this.http.put(`/api/ideas/${cur[i].id}`, {
            name: cur[i].name,
            budget: cur[i].budget,
            potentialCr: cur[i].potentialCr,
            remark: null
          }));
        }
      }
      await this.loadIdeas();
    } catch (err) {
      this.error.set(httpError(err as never));
    } finally {
      this.saving.set(false);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && this.dirtyCount() && !this.saving()) {
      e.preventDefault();
      this.saveAll();
    }
  }
}
