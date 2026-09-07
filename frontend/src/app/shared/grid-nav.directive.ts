import { Directive, ElementRef, HostListener } from '@angular/core';

/**
 * Navigasi grid ala Excel untuk sel <input data-row data-col> di dalam host:
 *   Enter / ↓        -> sel di bawah (kolom sama)
 *   Shift+Enter / ↑  -> sel di atas
 *   → -> kanan, ← -> kiri
 *   Tab              -> native (urutan DOM)
 * Fokus selalu select-all agar langsung bisa menimpa nilai.
 */
@Directive({
  selector: '[gridNav]'
})
export class GridNavDirective {
  constructor(private el: ElementRef<HTMLElement>) {}

  private cell(row: number, col: number): HTMLInputElement | null {
    return this.el.nativeElement.querySelector<HTMLInputElement>(
      `input[data-row="${row}"][data-col="${col}"]`
    );
  }

  /** Cari sel berikutnya yang tidak disabled di arah (dr, dc). */
  private nextEnabled(row: number, col: number, dr: number, dc: number): HTMLInputElement | null {
    const max = 500;
    for (let i = 1; i <= max; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (r < 0 || c < 0) return null;
      const next = this.cell(r, c);
      if (!next) return null; // melewati ujung grid
      if (!next.disabled && !next.readOnly) return next;
    }
    return null;
  }

  private go(target: HTMLElement, dr: number, dc: number) {
    const row = Number(target.getAttribute('data-row'));
    const col = Number(target.getAttribute('data-col'));
    if (!Number.isFinite(row) || !Number.isFinite(col)) return;
    const next = this.nextEnabled(row, col, dr, dc);
    if (next) next.focus();
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.getAttribute('data-row') == null) return;

    switch (event.key) {
      case 'Enter':
        if (event.shiftKey) {
          event.preventDefault();
          this.go(target, -1, 0);
        } else {
          event.preventDefault();
          this.go(target, 1, 0);
        }
        break;
      case 'ArrowDown': event.preventDefault(); this.go(target, 1, 0); break;
      case 'ArrowUp': event.preventDefault(); this.go(target, -1, 0); break;
      case 'ArrowRight': event.preventDefault(); this.go(target, 0, 1); break;
      case 'ArrowLeft': event.preventDefault(); this.go(target, 0, -1); break;
      default: return;
    }
  }

  @HostListener('focusin', ['$event'])
  onFocusin(event: FocusEvent) {
    const target = event.target as HTMLElement;
    // Select-all untuk sel grid (angka/rupiah) agar langsung bisa menimpa nilai
    if (target instanceof HTMLInputElement && target.hasAttribute('data-row') && !target.readOnly) {
      target.select();
    }
  }
}