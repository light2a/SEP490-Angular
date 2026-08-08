import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CampaignApi } from '../../../core/api/campaign.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { CampaignSlotResponse } from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/** ISO → giá trị `datetime-local` (giờ máy). */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/**
 * `datetime-local` → ISO UTC (đuôi `Z`).
 *
 * Phải là `Z` chứ không phải offset dạng số: Npgsql từ chối `DateTimeKind.Local` và backend
 * từng trả 500 với `+07:00`. `Date.toISOString()` luôn ra `Z` nên đường này an toàn.
 */
function toIso(local: string | null | undefined): string | null {
  if (!local) return null;
  const d = new Date(local);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

interface SlotDraft {
  startsAt: string;
  endsAt: string;
  capacity: number | null;
}

function emptyDraft(): SlotDraft {
  return { startsAt: '', endsAt: '', capacity: null };
}

/**
 * Khung giờ phỏng vấn của chiến dịch.
 *
 * Backend đã có trần đồng thời + ràng buộc khung giờ từ lâu, nhưng không màn hình nào tạo được
 * slot ⇒ cả tính năng nằm im: `campaign_membership.slot_id` luôn null và mọi lượt Start đều
 * không bị ràng buộc giờ. Đây là chỗ HR khai giờ.
 *
 * Ứng viên được gán khung giờ chỉ vào thi được trong khoảng đó, và hạn của buổi thi =
 * min(giờ kết thúc khung, hạn chiến dịch).
 */
@Component({
  selector: 'app-campaign-slots',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTableModule,
    MatTooltipModule,
    Spinner,
    EmptyState,
  ],
  template: `
    <div class="head">
      <a mat-button [routerLink]="['/employer/campaigns', campaignId()]">
        <mat-icon>arrow_back</mat-icon> Quay lại chiến dịch
      </a>
    </div>

    <h1>Khung giờ phỏng vấn</h1>
    <p class="lead">
      Ứng viên được gán khung giờ chỉ vào thi được trong khoảng thời gian đó. Hạn nộp bài của họ
      là thời điểm sớm hơn giữa <strong>giờ kết thúc khung</strong> và
      <strong>hạn của chiến dịch</strong>. Không tạo khung nào = ứng viên thi bất cứ lúc nào cho
      tới hạn chiến dịch.
    </p>

    @if (loading()) {
      <app-spinner message="Đang tải khung giờ…" />
    } @else {
      <mat-card class="form-card">
        <h2>{{ editingId() ? 'Sửa khung giờ' : 'Thêm khung giờ' }}</h2>
        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Bắt đầu</mat-label>
            <input matInput type="datetime-local" [(ngModel)]="draft.startsAt" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Kết thúc</mat-label>
            <input matInput type="datetime-local" [(ngModel)]="draft.endsAt" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="cap">
            <mat-label>Sức chứa</mat-label>
            <input matInput type="number" min="1" [(ngModel)]="draft.capacity" />
            <mat-hint>Số ứng viên tối đa của khung</mat-hint>
          </mat-form-field>
        </div>
        <div class="form-actions">
          <button mat-flat-button color="primary" [disabled]="busy()" (click)="save()">
            <mat-icon>{{ editingId() ? 'save' : 'add' }}</mat-icon>
            {{ editingId() ? 'Lưu khung giờ' : 'Thêm khung giờ' }}
          </button>
          @if (editingId()) {
            <button mat-button [disabled]="busy()" (click)="cancelEdit()">Huỷ</button>
          }
        </div>
      </mat-card>

      @if (slots().length === 0) {
        <app-empty-state icon="schedule" message="Chưa có khung giờ nào." />
      } @else {
        <mat-card class="tbl-card">
          <table mat-table [dataSource]="slots()">
            <ng-container matColumnDef="time">
              <th mat-header-cell *matHeaderCellDef>Khung giờ</th>
              <td mat-cell *matCellDef="let s">
                {{ s.startsAt | date: 'dd/MM/yyyy HH:mm' }}
                <span class="sep">→</span>
                {{ s.endsAt | date: 'dd/MM/yyyy HH:mm' }}
              </td>
            </ng-container>

            <ng-container matColumnDef="capacity">
              <th mat-header-cell *matHeaderCellDef>Sức chứa</th>
              <td mat-cell *matCellDef="let s">{{ s.capacity }}</td>
            </ng-container>

            <ng-container matColumnDef="assigned">
              <th mat-header-cell *matHeaderCellDef>Đã gán</th>
              <td mat-cell *matCellDef="let s">
                <span [class.full]="s.assignedCount >= s.capacity">
                  {{ s.assignedCount }}/{{ s.capacity }}
                </span>
              </td>
            </ng-container>

            <ng-container matColumnDef="started">
              <th mat-header-cell *matHeaderCellDef>Đang thi</th>
              <td mat-cell *matCellDef="let s">{{ s.startedCount }}</td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef>Thao tác</th>
              <td mat-cell *matCellDef="let s">
                <button mat-button [disabled]="busy()" (click)="startEdit(s)">
                  <mat-icon>edit</mat-icon> Sửa
                </button>
                <button
                  mat-button
                  color="warn"
                  [disabled]="busy()"
                  [matTooltip]="
                    s.startedCount > 0 ? 'Đang có ứng viên thi trong khung này' : 'Xoá khung giờ'
                  "
                  (click)="remove(s)"
                >
                  <mat-icon>delete</mat-icon> Xoá
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols"></tr>
          </table>
        </mat-card>
      }
    }
  `,
  styles: [
    `
      .head {
        margin-bottom: 8px;
      }
      h1 {
        margin: 0 0 8px;
      }
      h2 {
        margin: 0 0 12px;
        font-size: 16px;
      }
      .lead {
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
        max-width: 760px;
        margin: 0 0 16px;
      }
      .form-card {
        padding: 20px;
        margin-bottom: 16px;
      }
      .form-row {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .form-row mat-form-field {
        flex: 1 1 220px;
      }
      .form-row .cap {
        flex: 0 1 160px;
      }
      .form-actions {
        display: flex;
        gap: 8px;
      }
      .tbl-card {
        overflow-x: auto;
      }
      table {
        width: 100%;
      }
      .sep {
        color: var(--mat-sys-on-surface-variant);
        margin: 0 4px;
      }
      .full {
        color: var(--mat-sys-error);
        font-weight: 600;
      }
    `,
  ],
})
export class CampaignSlots implements OnInit {
  private api = inject(CampaignApi);
  private notify = inject(NotifyService);

  readonly campaignId = input.required<string>();

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly slots = signal<CampaignSlotResponse[]>([]);
  readonly editingId = signal<string | null>(null);
  readonly cols = ['time', 'capacity', 'assigned', 'started', 'actions'];

  draft: SlotDraft = emptyDraft();

  /** Khung đang sửa (để so sức chứa với số đã gán trước khi gửi). */
  private readonly editingSlot = computed(() => {
    const id = this.editingId();
    return id ? (this.slots().find((s) => s.id === id) ?? null) : null;
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getSlots(this.campaignId()).subscribe({
      next: (s) => {
        this.slots.set(s);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được khung giờ.');
      },
    });
  }

  startEdit(s: CampaignSlotResponse): void {
    this.editingId.set(s.id);
    this.draft = {
      startsAt: toLocalInput(s.startsAt),
      endsAt: toLocalInput(s.endsAt),
      capacity: s.capacity,
    };
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.draft = emptyDraft();
  }

  save(): void {
    const startsAt = toIso(this.draft.startsAt);
    const endsAt = toIso(this.draft.endsAt);
    const capacity = Number(this.draft.capacity);

    if (!startsAt || !endsAt) {
      this.notify.warn('Nhập cả giờ bắt đầu và giờ kết thúc.');
      return;
    }
    if (new Date(endsAt) <= new Date(startsAt)) {
      this.notify.warn('Giờ kết thúc phải sau giờ bắt đầu.');
      return;
    }
    if (!Number.isFinite(capacity) || capacity < 1) {
      this.notify.warn('Sức chứa phải từ 1 trở lên.');
      return;
    }
    // Backend cũng chặn (400), nhưng nói trước để HR biết PHẢI thu hồi bớt lời mời chứ không
    // phải "hệ thống lỗi".
    const editing = this.editingSlot();
    if (editing && capacity < editing.assignedCount) {
      this.notify.warn(
        `Sức chứa không thể nhỏ hơn ${editing.assignedCount} lời mời đã gán vào khung này.`,
      );
      return;
    }

    const body = { startsAt, endsAt, capacity };
    this.busy.set(true);
    const id = this.editingId();
    const req = id
      ? this.api.updateSlot(this.campaignId(), id, body)
      : this.api.createSlot(this.campaignId(), body);

    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.success(id ? 'Đã lưu khung giờ.' : 'Đã thêm khung giờ.');
        this.cancelEdit();
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        // 409 ở đây luôn là chồng lấn giờ — nói thẳng cách sửa thay vì hiện thông điệp thô.
        if (e.status === 409) {
          this.notify.warn(
            extractErrorMessage(e) ??
              'Khung giờ bị chồng lấn với khung khác — chọn khoảng thời gian không trùng.',
          );
          return;
        }
        this.notify.error(extractErrorMessage(e) ?? 'Lưu khung giờ thất bại.');
      },
    });
  }

  remove(s: CampaignSlotResponse): void {
    if (!confirm(`Xoá khung giờ ${new Date(s.startsAt).toLocaleString()}?`)) return;
    this.busy.set(true);
    this.api.deleteSlot(this.campaignId(), s.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.success('Đã xoá khung giờ.');
        if (this.editingId() === s.id) this.cancelEdit();
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        if (e.status === 409) {
          this.notify.warn(
            extractErrorMessage(e) ??
              'Không xoá được: đang có ứng viên thi trong khung giờ này.',
          );
          return;
        }
        this.notify.error(extractErrorMessage(e) ?? 'Xoá khung giờ thất bại.');
      },
    });
  }
}
