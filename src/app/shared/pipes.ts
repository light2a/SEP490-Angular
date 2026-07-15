import { Pipe, PipeTransform } from '@angular/core';
import {
  ANSWER_STATUS_LABEL,
  CANDIDATE_INTERVIEW_STATUS_LABEL,
  JOB_CATEGORY_LABEL,
  ORDER_STATUS_LABEL,
  PACKAGE_TYPE_LABEL,
  SESSION_STATUS_LABEL,
} from '../core/models';

@Pipe({ name: 'vnd' })
export class VndPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value == null) return '—';
    return new Intl.NumberFormat('vi-VN').format(value) + ' ₫';
  }
}

@Pipe({ name: 'sessionStatus' })
export class SessionStatusPipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    return v ? ((SESSION_STATUS_LABEL as Record<string, string>)[v] ?? v) : '';
  }
}

@Pipe({ name: 'answerStatus' })
export class AnswerStatusPipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    return v ? ((ANSWER_STATUS_LABEL as Record<string, string>)[v] ?? v) : '';
  }
}

@Pipe({ name: 'jobCategory' })
export class JobCategoryPipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    return v ? ((JOB_CATEGORY_LABEL as Record<string, string>)[v] ?? v) : '';
  }
}

@Pipe({ name: 'interviewStatus' })
export class InterviewStatusPipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    return v ? ((CANDIDATE_INTERVIEW_STATUS_LABEL as Record<string, string>)[v] ?? v) : '';
  }
}

@Pipe({ name: 'orderStatus' })
export class OrderStatusPipe implements PipeTransform {
  transform(v: number | null | undefined): string {
    return v == null ? '' : (ORDER_STATUS_LABEL[v] ?? String(v));
  }
}

@Pipe({ name: 'packageType' })
export class PackageTypePipe implements PipeTransform {
  transform(v: number | null | undefined): string {
    return v == null ? '' : (PACKAGE_TYPE_LABEL[v] ?? String(v));
  }
}
