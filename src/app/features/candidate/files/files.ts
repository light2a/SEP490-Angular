import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { FilesApi } from '../../../core/api/files.api';
import { NotifyService } from '../../../core/notify.service';
import { FileRecord, UploadFileType } from '../../../core/models';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

@Component({
  selector: 'app-files',
  imports: [
    DatePipe,
    MatCardModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    Spinner,
    EmptyState,
  ],
  templateUrl: './files.html',
  styleUrl: './files.scss',
})
export class Files {
  private filesApi = inject(FilesApi);
  private notify = inject(NotifyService);

  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly cvFiles = signal<FileRecord[]>([]);
  readonly jdFiles = signal<FileRecord[]>([]);
  /** Loại đang chọn để upload (đặt trước khi mở hộp thoại). */
  readonly pendingType = signal<UploadFileType>('cv');

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.filesApi.list().subscribe({
      next: (all) => {
        this.cvFiles.set(all.filter((f) => f.fileType === 'cv'));
        this.jdFiles.set(all.filter((f) => f.fileType === 'jd'));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf') {
      this.notify.error('Chỉ chấp nhận file PDF.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.notify.error('File vượt quá 10MB.');
      return;
    }
    this.uploading.set(true);
    this.filesApi.upload(file, this.pendingType()).subscribe({
      next: () => {
        this.uploading.set(false);
        this.notify.success('Tải lên thành công.');
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.uploading.set(false);
        this.notify.error(e.status === 400 ? 'File không hợp lệ.' : 'Tải lên thất bại.');
      },
    });
  }

  remove(f: FileRecord): void {
    if (!confirm(`Xoá "${f.originalName}"?`)) return;
    this.filesApi.remove(f.id).subscribe({
      next: () => this.load(),
      error: () => this.notify.error('Xoá thất bại.'),
    });
  }

  download(f: FileRecord): void {
    this.filesApi.download(f.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => this.notify.error('Không tải được file.'),
    });
  }
}
