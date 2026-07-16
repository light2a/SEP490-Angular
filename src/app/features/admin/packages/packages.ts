import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { PaymentApi } from '../../../core/api/payment.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import {
  CreatePackageRequest,
  PACKAGE_TYPE_LABEL,
  PackageResponse,
  PackageType,
  UpdatePackageRequest,
} from '../../../core/models';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/** Quản lý gói credit (PlatformAdmin) — CRUD gói mua credit. */
@Component({
  selector: 'app-admin-packages',
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTableModule,
    Spinner,
    EmptyState,
  ],
  template: `
    <div class="page">
      <mat-card class="card">
        <mat-card-header>
          <mat-card-title>Thêm gói credit</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form class="add-form" [formGroup]="form" (ngSubmit)="create()">
            <mat-form-field appearance="outline" class="f-name">
              <mat-label>Tên gói</mat-label>
              <input matInput formControlName="name" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="f-type">
              <mat-label>Loại</mat-label>
              <mat-select formControlName="type">
                <mat-option [value]="OneTime">{{ label(OneTime) }}</mat-option>
                <mat-option [value]="Subscription">{{ label(Subscription) }}</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" class="f-num">
              <mat-label>Giá (VND)</mat-label>
              <input matInput type="number" formControlName="priceVnd" min="0" />
            </mat-form-field>
            @if (isOneTime()) {
              <mat-form-field appearance="outline" class="f-num">
                <mat-label>Số credit</mat-label>
                <input matInput type="number" formControlName="interviewCredits" min="1" />
              </mat-form-field>
            } @else {
              <mat-form-field appearance="outline" class="f-num">
                <mat-label>Số ngày</mat-label>
                <input matInput type="number" formControlName="durationDays" min="1" />
              </mat-form-field>
            }
            <button mat-flat-button color="primary" type="submit" [disabled]="creating() || form.invalid">
              <mat-icon>add</mat-icon> Thêm gói
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <mat-card class="card">
        <mat-card-header>
          <mat-card-title>Danh sách gói</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (loading()) {
            <app-spinner [diameter]="32" message="Đang tải danh sách gói..." />
          } @else if (!packages().length) {
            <app-empty-state icon="inventory_2" message="Chưa có gói nào." />
          } @else {
            <table mat-table [dataSource]="packages()" class="tbl">
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>Tên</th>
                <td mat-cell *matCellDef="let p">
                  @if (editId() === p.id) {
                    <input class="edit-in" [value]="editName()" (input)="editName.set($any($event.target).value)" />
                  } @else {
                    {{ p.name }}
                  }
                </td>
              </ng-container>
              <ng-container matColumnDef="type">
                <th mat-header-cell *matHeaderCellDef>Loại</th>
                <td mat-cell *matCellDef="let p">{{ label(p.type) }}</td>
              </ng-container>
              <ng-container matColumnDef="priceVnd">
                <th mat-header-cell *matHeaderCellDef>Giá (VND)</th>
                <td mat-cell *matCellDef="let p">
                  @if (editId() === p.id) {
                    <input
                      class="edit-in num"
                      type="number"
                      [value]="editPrice()"
                      (input)="editPrice.set($any($event.target).valueAsNumber)"
                    />
                  } @else {
                    {{ p.priceVnd | number: '1.0-0' }}
                  }
                </td>
              </ng-container>
              <ng-container matColumnDef="interviewCredits">
                <th mat-header-cell *matHeaderCellDef>Credit</th>
                <td mat-cell *matCellDef="let p">
                  @if (editId() === p.id) {
                    <input
                      class="edit-in num"
                      type="number"
                      [value]="editCredits() ?? ''"
                      (input)="editCredits.set($any($event.target).valueAsNumber)"
                    />
                  } @else {
                    {{ p.interviewCredits ?? '—' }}
                  }
                </td>
              </ng-container>
              <ng-container matColumnDef="durationDays">
                <th mat-header-cell *matHeaderCellDef>Số ngày</th>
                <td mat-cell *matCellDef="let p">{{ p.durationDays ?? '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="isActive">
                <th mat-header-cell *matHeaderCellDef>Trạng thái</th>
                <td mat-cell *matCellDef="let p">
                  <mat-slide-toggle
                    [checked]="p.isActive"
                    [disabled]="busyId() === p.id || editId() === p.id"
                    (change)="toggleActive(p, $event.checked)"
                  />
                </td>
              </ng-container>
              <ng-container matColumnDef="createdAt">
                <th mat-header-cell *matHeaderCellDef>Ngày tạo</th>
                <td mat-cell *matCellDef="let p">{{ p.createdAt | date: 'short' }}</td>
              </ng-container>
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let p">
                  @if (editId() === p.id) {
                    <button mat-icon-button color="primary" [disabled]="busyId() === p.id" (click)="saveEdit(p)" title="Lưu">
                      <mat-icon>check</mat-icon>
                    </button>
                    <button mat-icon-button [disabled]="busyId() === p.id" (click)="cancelEdit()" title="Huỷ">
                      <mat-icon>close</mat-icon>
                    </button>
                  } @else {
                    <button mat-icon-button [disabled]="busyId() === p.id" (click)="startEdit(p)" title="Sửa">
                      <mat-icon>edit</mat-icon>
                    </button>
                    <button mat-icon-button color="warn" [disabled]="busyId() === p.id" (click)="remove(p)" title="Xoá">
                      <mat-icon>delete</mat-icon>
                    </button>
                  }
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="cols"></tr>
              <tr mat-row *matRowDef="let row; columns: cols"></tr>
            </table>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .page {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .card {
        width: 100%;
      }
      .add-form {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .f-name {
        width: 220px;
      }
      .f-type {
        width: 160px;
      }
      .f-num {
        width: 140px;
      }
      .tbl {
        width: 100%;
      }
      .edit-in {
        width: 100%;
        box-sizing: border-box;
        padding: 4px 6px;
        border: 1px solid var(--mat-sys-outline);
        border-radius: 4px;
        background: var(--mat-sys-surface);
        color: var(--mat-sys-on-surface);
      }
      .edit-in.num {
        width: 100px;
      }
    `,
  ],
})
export class AdminPackages {
  private fb = inject(FormBuilder);
  private api = inject(PaymentApi);
  private notify = inject(NotifyService);

  readonly OneTime = PackageType.OneTime;
  readonly Subscription = PackageType.Subscription;

  readonly cols = ['name', 'type', 'priceVnd', 'interviewCredits', 'durationDays', 'isActive', 'createdAt', 'actions'];

  readonly packages = signal<PackageResponse[]>([]);
  readonly loading = signal(true);
  readonly creating = signal(false);
  readonly busyId = signal<string | null>(null);

  // Inline edit state
  readonly editId = signal<string | null>(null);
  readonly editName = signal('');
  readonly editPrice = signal(0);
  readonly editCredits = signal<number | null>(null);

  readonly form = this.fb.group({
    name: ['', [Validators.required]],
    type: [PackageType.OneTime, [Validators.required]],
    priceVnd: [0, [Validators.required, Validators.min(0)]],
    interviewCredits: [null as number | null],
    durationDays: [null as number | null],
  });

  constructor() {
    this.load();
  }

  isOneTime(): boolean {
    return this.form.controls.type.value === PackageType.OneTime;
  }

  label(t: PackageType): string {
    return PACKAGE_TYPE_LABEL[t] ?? String(t);
  }

  load(): void {
    this.loading.set(true);
    this.api.packages().subscribe({
      next: (list) => {
        this.packages.set(list);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được danh sách gói.');
      },
    });
  }

  create(): void {
    const v = this.form.getRawValue();
    const name = (v.name ?? '').trim();
    if (!name) {
      this.notify.warn('Nhập tên gói.');
      return;
    }
    const oneTime = v.type === PackageType.OneTime;
    if (oneTime && !v.interviewCredits) {
      this.notify.warn('Gói mua lẻ cần số credit.');
      return;
    }
    if (!oneTime && !v.durationDays) {
      this.notify.warn('Gói định kỳ cần số ngày.');
      return;
    }
    const body: CreatePackageRequest = {
      name,
      type: v.type ?? PackageType.OneTime,
      priceVnd: v.priceVnd ?? 0,
      interviewCredits: oneTime ? v.interviewCredits : null,
      durationDays: oneTime ? null : v.durationDays,
    };
    this.creating.set(true);
    this.api.createPackage(body).subscribe({
      next: () => {
        this.creating.set(false);
        this.notify.success('Đã tạo gói.');
        this.form.reset({ name: '', type: PackageType.OneTime, priceVnd: 0, interviewCredits: null, durationDays: null });
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.creating.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Tạo gói thất bại.');
      },
    });
  }

  startEdit(p: PackageResponse): void {
    this.editId.set(p.id);
    this.editName.set(p.name);
    this.editPrice.set(p.priceVnd);
    this.editCredits.set(p.interviewCredits ?? null);
  }

  cancelEdit(): void {
    this.editId.set(null);
  }

  saveEdit(p: PackageResponse): void {
    const name = this.editName().trim();
    if (!name) {
      this.notify.warn('Tên gói không được trống.');
      return;
    }
    const body: UpdatePackageRequest = {
      name,
      priceVnd: this.editPrice(),
      interviewCredits: p.type === PackageType.OneTime ? this.editCredits() : null,
    };
    this.busyId.set(p.id);
    this.api.updatePackage(p.id, body).subscribe({
      next: () => {
        this.busyId.set(null);
        this.editId.set(null);
        this.notify.success('Đã cập nhật gói.');
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.busyId.set(null);
        this.notify.error(extractErrorMessage(e) ?? 'Cập nhật gói thất bại.');
      },
    });
  }

  toggleActive(p: PackageResponse, isActive: boolean): void {
    this.busyId.set(p.id);
    this.api.updatePackage(p.id, { isActive }).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notify.success(isActive ? 'Đã bật gói.' : 'Đã tắt gói.');
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.busyId.set(null);
        this.notify.error(extractErrorMessage(e) ?? 'Đổi trạng thái thất bại.');
        this.load();
      },
    });
  }

  remove(p: PackageResponse): void {
    if (!confirm(`Xoá gói "${p.name}"?`)) return;
    this.busyId.set(p.id);
    this.api.deletePackage(p.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notify.success('Đã xoá gói.');
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.busyId.set(null);
        this.notify.error(extractErrorMessage(e) ?? 'Xoá gói thất bại.');
      },
    });
  }
}
