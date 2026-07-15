import { Component, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface RecordedAudio {
  blob: Blob;
  durationSec: number;
}

/** Ghi âm câu trả lời bằng MediaRecorder → phát ra { blob, durationSec }. */
@Component({
  selector: 'app-audio-recorder',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="rec">
      @if (!recording() && !blobUrl()) {
        <button mat-flat-button color="warn" type="button" (click)="start()">
          <mat-icon>mic</mat-icon> Ghi âm
        </button>
      }
      @if (recording()) {
        <button mat-flat-button color="primary" type="button" (click)="stop()">
          <mat-icon>stop</mat-icon> Dừng ({{ elapsed() }}s)
        </button>
        <span class="dot"></span>
      }
      @if (blobUrl(); as url) {
        <audio [src]="url" controls></audio>
        <button mat-button type="button" (click)="reset()">
          <mat-icon>refresh</mat-icon> Ghi lại
        </button>
      }
    </div>
  `,
  styles: [
    `
      .rec {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      audio {
        height: 36px;
      }
      .dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--mat-sys-error);
        animation: pulse 1s infinite;
      }
      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.3;
        }
      }
    `,
  ],
})
export class AudioRecorder {
  readonly recorded = output<RecordedAudio>();

  readonly recording = signal(false);
  readonly blobUrl = signal<string | null>(null);
  readonly elapsed = signal(0);

  private mediaRecorder?: MediaRecorder;
  private chunks: BlobPart[] = [];
  private startedAt = 0;
  private timer?: ReturnType<typeof setInterval>;

  async start(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.chunks = [];
      const mr = new MediaRecorder(stream);
      this.mediaRecorder = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size) this.chunks.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(this.chunks, { type: mr.mimeType || 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        const durationSec = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));
        const url = this.blobUrl();
        if (url) URL.revokeObjectURL(url);
        this.blobUrl.set(URL.createObjectURL(blob));
        this.recorded.emit({ blob, durationSec });
      };
      this.startedAt = Date.now();
      this.elapsed.set(0);
      this.timer = setInterval(
        () => this.elapsed.set(Math.round((Date.now() - this.startedAt) / 1000)),
        500,
      );
      mr.start();
      this.recording.set(true);
    } catch {
      alert('Không truy cập được micro. Vui lòng cấp quyền micro cho trình duyệt.');
    }
  }

  stop(): void {
    this.mediaRecorder?.stop();
    this.recording.set(false);
    if (this.timer) clearInterval(this.timer);
  }

  reset(): void {
    const url = this.blobUrl();
    if (url) URL.revokeObjectURL(url);
    this.blobUrl.set(null);
    this.elapsed.set(0);
  }
}
