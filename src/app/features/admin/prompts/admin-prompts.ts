import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { AdminOpsApi } from '../../../core/api/admin-ops.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import {
  PROMPT_BODY_MAX_CHARS,
  PROMPT_FORBIDDEN_FRAGMENTS,
  PromptTemplateItem,
  promptKeyGroup,
  promptKeyLabel,
} from '../../../core/models/admin-ops.models';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/ui/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/**
 * Quản lý prompt đang chạy (F21) — công cụ VẬN HÀNH, không phải màn cấu hình bình thường.
 *
 * Đây là đường đã từng phải dùng tay (gọi API trực tiếp) để vá chất lượng câu hỏi trên production.
 * Ba điều màn hình này bắt buộc phải nói thẳng, vì hiểu sai chỗ nào cũng dẫn tới hỏng thật:
 *
 * 1. **Lưu là có hiệu lực với MỌI người dùng**, ở lần sinh/chấm kế tiếp sau khi cache prompt của
 *    AIService hết hạn (~60s). Không cần deploy, không có bước duyệt. Vì thế có hộp thoại xác nhận.
 * 2. **Bản mặc định KHÔNG hiển thị được ở đây.** Nó nằm trong `prompts.py` phía AIService và cố ý
 *    không chép sang .NET. Ô soạn thảo rỗng nghĩa là "chưa ai tuỳ biến", KHÔNG phải "prompt này
 *    đang trống" — gõ đè vào đó là THAY THẾ bản mặc định bằng đúng những gì vừa gõ.
 * 3. **Reset giữ nguyên lịch sử**; nó chỉ ngừng áp bản tuỳ biến, không xoá dấu vết ai từng đổi gì.
 */
@Component({
  selector: 'app-admin-prompts',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTableModule,
    Spinner,
    EmptyState,
  ],
  template: `
    <div class="page">
      <mat-card class="card">
        <mat-card-header>
          <mat-card-title>Prompt AI đang chạy</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <p class="warn-banner">
            <mat-icon inline>warning</mat-icon>
            Sửa ở đây <strong>áp dụng ngay cho mọi người dùng</strong> (lần sinh/chấm kế tiếp, sau
            khi cache AIService hết hạn ~60 giây) — không qua deploy, không có bước duyệt.
          </p>

          @if (loading()) {
            <app-spinner [diameter]="32" message="Đang tải danh sách prompt..." />
          } @else if (!items().length) {
            <app-empty-state icon="edit_note" message="Không lấy được danh sách prompt." />
          } @else {
            <p class="hint" data-testid="override-summary">
              <mat-icon inline>tune</mat-icon>
              <strong>{{ overriddenCount() }}</strong> / {{ items().length }} mảnh đang dùng bản
              tuỳ biến; phần còn lại chạy bản mặc định trong mã nguồn.
            </p>

            <table mat-table [dataSource]="items()" class="tbl">
              <ng-container matColumnDef="key">
                <th mat-header-cell *matHeaderCellDef>Mảnh prompt</th>
                <td mat-cell *matCellDef="let p">
                  <div class="k-label">{{ label(p.key) }}</div>
                  <code class="k-raw">{{ p.key }}</code>
                </td>
              </ng-container>
              <ng-container matColumnDef="group">
                <th mat-header-cell *matHeaderCellDef>Nhóm</th>
                <td mat-cell *matCellDef="let p">{{ group(p.key) }}</td>
              </ng-container>
              <ng-container matColumnDef="state">
                <th mat-header-cell *matHeaderCellDef>Trạng thái</th>
                <td mat-cell *matCellDef="let p">
                  @if (isOverridden(p)) {
                    <span class="chip on">Đã tuỳ biến · v{{ p.version }}</span>
                  } @else {
                    <span class="chip off">Mặc định</span>
                  }
                </td>
              </ng-container>
              <ng-container matColumnDef="updated">
                <th mat-header-cell *matHeaderCellDef>Sửa lần cuối</th>
                <td mat-cell *matCellDef="let p">
                  @if (p.createdAt) {
                    {{ p.createdAt | date: 'dd/MM/yyyy HH:mm' }}
                    @if (p.changeNote) {
                      <div class="k-raw">{{ p.changeNote }}</div>
                    }
                  } @else {
                    —
                  }
                </td>
              </ng-container>
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef>Thao tác</th>
                <td mat-cell *matCellDef="let p">
                  <button mat-stroked-button (click)="edit(p)">
                    <mat-icon>edit</mat-icon> Sửa
                  </button>
                  <button mat-button (click)="showHistory(p)">
                    <mat-icon>history</mat-icon> Lịch sử
                  </button>
                  @if (isOverridden(p)) {
                    <button
                      mat-button
                      color="warn"
                      [disabled]="busyKey() === p.key"
                      (click)="reset(p)"
                    >
                      <mat-icon>restart_alt</mat-icon> Reset
                    </button>
                  }
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="cols"></tr>
              <tr mat-row *matRowDef="let row; columns: cols"></tr>
            </table>
          }

          @if (selected(); as sel) {
            <h3 data-testid="editor-title">Sửa: {{ label(sel.key) }}</h3>
            <p class="hint"><code>{{ sel.key }}</code></p>

            @if (!isOverridden(sel)) {
              <!--
                Điểm dễ hiểu sai nhất của cả màn: ô rỗng KHÔNG có nghĩa prompt đang trống.
                Bản mặc định nằm ở prompts.py (AIService) và cố ý không chép sang .NET, nên ở đây
                không có gì để hiện. Gõ đè = thay thế toàn bộ bản mặc định bằng đúng những gì gõ.
              -->
              <p class="note" data-testid="default-notice">
                <mat-icon inline>info</mat-icon>
                Mảnh này <strong>chưa ai tuỳ biến</strong> nên đang chạy bản mặc định trong mã
                nguồn AIService. Nội dung bản mặc định <strong>không hiển thị được ở đây</strong> —
                những gì bạn gõ vào ô dưới sẽ <strong>thay thế hoàn toàn</strong> bản mặc định đó,
                chứ không phải bổ sung vào nó.
              </p>
            }

            <mat-form-field appearance="outline" class="full">
              <mat-label>Nội dung prompt</mat-label>
              <textarea
                matInput
                rows="12"
                [(ngModel)]="bodyDraft"
                name="bodyDraft"
                [maxlength]="maxChars"
                data-testid="body-input"
              ></textarea>
              <mat-hint>{{ bodyDraft.length }} / {{ maxChars }} ký tự</mat-hint>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full">
              <mat-label>Lý do sửa (hiện trên lịch sử)</mat-label>
              <input matInput [(ngModel)]="changeNote" name="changeNote" />
            </mat-form-field>

            <p class="hint">
              Backend từ chối nội dung chứa các delimiter khung dữ liệu:
              @for (f of forbidden; track f) {
                <code class="k-raw">{{ f }}</code>
              }
              — chúng là hàng rào chống prompt-injection, dùng lại sẽ phá khung.
            </p>

            <div class="actions">
              <button
                mat-flat-button
                color="primary"
                [disabled]="!canSave() || saving()"
                (click)="save()"
              >
                <mat-icon>save</mat-icon> Lưu version mới
              </button>
              <button mat-button (click)="cancelEdit()">Đóng</button>
            </div>
          }

          @if (historyKey(); as hk) {
            <h3>Lịch sử: {{ label(hk) }}</h3>
            @if (historyLoading()) {
              <app-spinner [diameter]="28" message="Đang tải lịch sử..." />
            } @else if (!history().length) {
              <app-empty-state
                icon="history"
                message="Mảnh này chưa từng được sửa — không có version nào."
              />
            } @else {
              <table mat-table [dataSource]="history()" class="tbl">
                <ng-container matColumnDef="version">
                  <th mat-header-cell *matHeaderCellDef>Version</th>
                  <td mat-cell *matCellDef="let h">v{{ h.version }}</td>
                </ng-container>
                <ng-container matColumnDef="createdAt">
                  <th mat-header-cell *matHeaderCellDef>Thời điểm</th>
                  <td mat-cell *matCellDef="let h">
                    {{ h.createdAt ? (h.createdAt | date: 'dd/MM/yyyy HH:mm') : '—' }}
                  </td>
                </ng-container>
                <ng-container matColumnDef="updatedBy">
                  <th mat-header-cell *matHeaderCellDef>Người sửa</th>
                  <td mat-cell *matCellDef="let h">
                    <code class="k-raw">{{ h.updatedBy ?? '—' }}</code>
                  </td>
                </ng-container>
                <ng-container matColumnDef="changeNote">
                  <th mat-header-cell *matHeaderCellDef>Lý do</th>
                  <td mat-cell *matCellDef="let h">{{ h.changeNote || '—' }}</td>
                </ng-container>
                <ng-container matColumnDef="body">
                  <th mat-header-cell *matHeaderCellDef>Nội dung</th>
                  <td mat-cell *matCellDef="let h">
                    <pre class="body-cell">{{ h.body }}</pre>
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="histCols"></tr>
                <tr mat-row *matRowDef="let row; columns: histCols"></tr>
              </table>
            }
            <div class="actions">
              <button mat-button (click)="closeHistory()">Đóng lịch sử</button>
            </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .page {
        padding: 8px;
      }
      .card {
        width: 100%;
      }
      .full {
        width: 100%;
      }
      .hint,
      .note {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
      }
      .note {
        margin: 12px 0;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--mat-sys-surface-variant);
      }
      .warn-banner {
        margin: 0 0 12px;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
        font-size: 13px;
      }
      .tbl {
        width: 100%;
      }
      .k-label {
        font-weight: 500;
      }
      .k-raw {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .chip {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 12px;
        font-size: 12px;
        white-space: nowrap;
      }
      .chip.on {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .chip.off {
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      h3 {
        margin: 24px 0 8px;
        font-size: 16px;
      }
      .actions {
        display: flex;
        gap: 8px;
        align-items: center;
        margin: 8px 0 4px;
      }
      .body-cell {
        margin: 6px 0;
        max-width: 420px;
        max-height: 160px;
        overflow: auto;
        white-space: pre-wrap;
        font-size: 12px;
      }
    `,
  ],
})
export class AdminPrompts implements OnInit {
  private api = inject(AdminOpsApi);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);

  readonly cols = ['key', 'group', 'state', 'updated', 'actions'];
  readonly histCols = ['version', 'createdAt', 'updatedBy', 'changeNote', 'body'];
  readonly maxChars = PROMPT_BODY_MAX_CHARS;
  readonly forbidden = PROMPT_FORBIDDEN_FRAGMENTS;

  readonly items = signal<PromptTemplateItem[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly busyKey = signal<string | null>(null);

  readonly selected = signal<PromptTemplateItem | null>(null);
  bodyDraft = '';
  changeNote = '';

  readonly historyKey = signal<string | null>(null);
  readonly history = signal<PromptTemplateItem[]>([]);
  readonly historyLoading = signal(false);

  readonly overriddenCount = computed(() => this.items().filter((p) => this.isOverridden(p)).length);

  ngOnInit(): void {
    this.load();
  }

  label(key: string): string {
    return promptKeyLabel(key);
  }

  group(key: string): string {
    return promptKeyGroup(key);
  }

  /**
   * "Đang bị override" = có thân prompt tuỳ biến. Xét `body`, KHÔNG xét riêng `version`:
   * reset giữ lịch sử nên một mảnh đã reset vẫn có version cũ trong bảng — dựa vào version sẽ
   * báo là đang override trong khi nó đã quay về mặc định.
   */
  isOverridden(p: PromptTemplateItem): boolean {
    return p.body != null;
  }

  canSave(): boolean {
    // `changeNote` bắt buộc ở UI dù backend cho trống: lịch sử không có lý do thì nó chỉ còn là
    // một đống văn bản, không trả lời được câu "vì sao hồi đó đổi" — đúng lúc cần nhất.
    return this.bodyDraft.trim().length > 0 && this.changeNote.trim().length > 0;
  }

  load(): void {
    this.loading.set(true);
    this.api.prompts().subscribe({
      next: (list) => {
        this.items.set(list);
        this.loading.set(false);
        // Giữ đồng bộ ô đang mở với dữ liệu vừa tải (version/body mới sau khi lưu hoặc reset).
        const sel = this.selected();
        if (sel) {
          const fresh = list.find((p) => p.key === sel.key);
          this.selected.set(fresh ?? null);
        }
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được danh sách prompt.');
      },
    });
  }

  edit(p: PromptTemplateItem): void {
    this.selected.set(p);
    this.bodyDraft = p.body ?? '';
    this.changeNote = '';
  }

  cancelEdit(): void {
    this.selected.set(null);
    this.bodyDraft = '';
    this.changeNote = '';
  }

  save(): void {
    const sel = this.selected();
    if (!sel || !this.canSave()) return;

    const scoring = sel.key.startsWith('scoring.');
    const data: ConfirmDialogData = {
      title: `Áp bản mới cho "${this.label(sel.key)}"?`,
      message: 'Bản mới có hiệu lực với mọi người dùng ở lần sinh/chấm kế tiếp.',
      bullets: [
        'Không cần deploy — AIService nạp lại trong khoảng 60 giây.',
        'Bản cũ vẫn nằm trong lịch sử; muốn quay lại thì dùng Reset hoặc dán lại nội dung cũ.',
        ...(this.isOverridden(sel)
          ? []
          : ['Mảnh này đang dùng bản mặc định — lưu sẽ THAY THẾ hoàn toàn bản mặc định đó.']),
      ],
      warning: scoring
        ? 'Đây là mảnh thuộc prompt CHẤM ĐIỂM: đổi nó là đổi thước đo, điểm sau thời điểm này không so sánh trực tiếp được với điểm cũ.'
        : undefined,
      confirmLabel: 'Áp dụng',
      danger: scoring,
    };

    this.dialog
      .open(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.saving.set(true);
        this.api
          .updatePrompt(sel.key, {
            body: this.bodyDraft.trim(),
            changeNote: this.changeNote.trim() || null,
          })
          .subscribe({
            next: (updated) => {
              this.saving.set(false);
              this.notify.success(`Đã lưu v${updated.version} cho "${this.label(sel.key)}".`);
              this.changeNote = '';
              this.load();
              if (this.historyKey() === sel.key) this.loadHistory(sel.key);
            },
            error: (e: HttpErrorResponse) => {
              this.saving.set(false);
              this.notify.error(extractErrorMessage(e) ?? 'Không lưu được prompt.');
            },
          });
      });
  }

  reset(p: PromptTemplateItem): void {
    const data: ConfirmDialogData = {
      title: `Quay về bản mặc định cho "${this.label(p.key)}"?`,
      message: 'Bản tuỳ biến hiện tại sẽ ngừng được áp dụng.',
      bullets: [
        'AIService quay lại dùng bản mặc định trong mã nguồn.',
        'Lịch sử được GIỮ NGUYÊN — không xoá dấu vết ai từng sửa gì.',
        'Có hiệu lực với mọi người dùng trong khoảng 60 giây.',
      ],
      confirmLabel: 'Reset',
      danger: true,
    };

    this.dialog
      .open(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.busyKey.set(p.key);
        this.api.resetPrompt(p.key).subscribe({
          next: () => {
            this.busyKey.set(null);
            this.notify.success(`Đã quay về bản mặc định cho "${this.label(p.key)}".`);
            if (this.selected()?.key === p.key) this.cancelEdit();
            this.load();
            if (this.historyKey() === p.key) this.loadHistory(p.key);
          },
          error: (e: HttpErrorResponse) => {
            this.busyKey.set(null);
            this.notify.error(extractErrorMessage(e) ?? 'Không reset được prompt.');
          },
        });
      });
  }

  showHistory(p: PromptTemplateItem): void {
    this.historyKey.set(p.key);
    this.loadHistory(p.key);
  }

  closeHistory(): void {
    this.historyKey.set(null);
    this.history.set([]);
  }

  private loadHistory(key: string): void {
    this.historyLoading.set(true);
    this.history.set([]);
    this.api.promptHistory(key).subscribe({
      next: (list) => {
        this.history.set(list);
        this.historyLoading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.historyLoading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được lịch sử.');
      },
    });
  }
}
