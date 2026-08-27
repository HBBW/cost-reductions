import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Header halaman: judul serif display + subjudul. */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <h1 class="font-display text-[26px] leading-tight font-semibold tracking-tight text-ink">{{ title() }}</h1>
        @if (subtitle()) { <p class="mt-1 max-w-2xl text-sm text-muted">{{ subtitle() }}</p> }
      </div>
      <div class="flex items-center gap-2"><ng-content /></div>
    </div>
  `
})
export class PageHeader {
  title = input.required<string>();
  subtitle = input<string>('');
}

/** Pilihan tahun standar. */
@Component({
  selector: 'app-year-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <label class="flex items-center gap-2 text-sm text-muted">
      Tahun
      <select class="select-base w-28" [value]="year()" (change)="onChange($event)">
        @for (y of years(); track y) {
          <option [value]="y">{{ y }}</option>
        }
      </select>
    </label>
  `
})
export class YearSelect {
  year = input.required<number>();
  years = input<number[]>([new Date().getFullYear()]);
  yearChange = output<number>();

  onChange(ev: Event) {
    this.yearChange.emit(Number((ev.target as HTMLSelectElement).value));
  }
}

/** Bar simpan mengambang — muncul saat ada perubahan belum tersimpan. */
@Component({
  selector: 'app-save-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (count() > 0) {
      <div class="fade-up fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
        <div class="flex items-center gap-3 rounded-lg bg-ink py-2 pr-2 pl-4 text-paper shadow-xl shadow-ink/25">
          <span class="text-sm">
            <strong class="font-semibold">{{ count() }}</strong>
            {{ count() === 1 ? 'perubahan' : 'perubahan' }} belum disimpan
          </span>
          <span class="rounded border border-white/20 px-1.5 py-0.5 text-[10px] tracking-wide text-paper/70">CTRL+S</span>
          <button type="button" class="btn h-8 !px-2.5 text-xs text-paper/80 hover:text-paper hover:bg-white/10 border-0"
                  (click)="cancel.emit()">Batalkan</button>
          <button type="button" class="btn btn-accent h-8 !py-1" [disabled]="saving()" (click)="save.emit()">
            {{ saving() ? 'Menyimpan…' : 'Simpan' }}
          </button>
        </div>
      </div>
    }
  `
})
export class SaveBar {
  count = input.required<number>();
  saving = input(false);
  save = output<void>();
  cancel = output<void>();
}
