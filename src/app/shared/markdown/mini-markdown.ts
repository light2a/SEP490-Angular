/**
 * Bộ parse Markdown TỐI GIẢN — đủ cho nội dung lý thuyết do AI sinh, không hơn.
 *
 * TẠI SAO tự viết thay vì kéo thư viện markdown về:
 * Mọi thư viện markdown đều trả ra CHUỖI HTML, mà muốn hiển thị chuỗi HTML thì phải đi qua
 * `innerHTML` / `DomSanitizer`. Repo này chưa từng dùng `innerHTML` ở đâu cả, và nội dung ở đây
 * do LLM sinh ra (tức là chịu ảnh hưởng gián tiếp từ CV/JD người dùng nhập) — mở đúng một chỗ
 * `innerHTML` cho loại nội dung đó là mở một bề mặt XSS mới.
 *
 * Cách làm ở đây: parse ra CẤU TRÚC (block + span), không sinh HTML. Template Angular render
 * bằng `@switch` + interpolation `{{ }}` ⇒ Angular tự escape mọi ký tự. XSS đóng THEO THIẾT KẾ,
 * không nhờ sanitizer chạy đúng. `<script>` hay `&` trong nội dung sẽ hiện ra đúng dạng chữ.
 *
 * Cú pháp hỗ trợ (cố ý hẹp): heading `#`..`######`, danh sách `-`/`*`/`+` và `1.`, `**đậm**`,
 * `` `code` ``, đoạn văn. Cú pháp khác giữ nguyên dạng chữ — thà hiện thô còn hơn parse sai.
 */

/** Một mẩu chữ trong dòng: chữ thường, chữ đậm, hoặc code inline. */
export interface MdSpan {
  type: 'text' | 'bold' | 'code';
  text: string;
}

export type MdBlock =
  | { type: 'heading'; level: number; spans: MdSpan[] }
  | { type: 'list'; ordered: boolean; items: MdSpan[][] }
  | { type: 'paragraph'; spans: MdSpan[] };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
/** `**đậm**` hoặc `` `code` `` — quét một lượt để thứ tự xuất hiện được giữ nguyên. */
const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`/g;

/** Tách một dòng thành các span chữ thường / đậm / code. */
export function parseInline(line: string): MdSpan[] {
  const spans: MdSpan[] = [];
  let last = 0;

  // `exec` trong vòng lặp cần regex có cờ `g` và con trỏ sạch giữa các lần gọi.
  INLINE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE.exec(line)) !== null) {
    if (m.index > last) spans.push({ type: 'text', text: line.slice(last, m.index) });
    if (m[1] !== undefined) spans.push({ type: 'bold', text: m[1] });
    else spans.push({ type: 'code', text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < line.length) spans.push({ type: 'text', text: line.slice(last) });

  return spans.length ? spans : [{ type: 'text', text: line }];
}

/**
 * Parse Markdown thành danh sách block. Không sinh HTML, không đụng DOM — hàm thuần,
 * test được thẳng bằng so sánh giá trị.
 */
export function parseMarkdown(src: string | null | undefined): MdBlock[] {
  if (!src) return [];

  const blocks: MdBlock[] = [];
  /** Các dòng đoạn văn đang gom dở — markdown nối chúng thành MỘT đoạn. */
  let para: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    blocks.push({ type: 'paragraph', spans: parseInline(para.join(' ')) });
    para = [];
  };

  /** Gom các gạch đầu dòng LIÊN TIẾP vào 1 block để render ra `<ul>`/`<ol>` hợp lệ. */
  const pushItem = (ordered: boolean, text: string) => {
    const last = blocks[blocks.length - 1];
    if (last?.type === 'list' && last.ordered === ordered) {
      last.items.push(parseInline(text));
    } else {
      blocks.push({ type: 'list', ordered, items: [parseInline(text)] });
    }
  };

  for (const raw of src.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flushPara();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushPara();
      blocks.push({ type: 'heading', level: heading[1].length, spans: parseInline(heading[2]) });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      flushPara();
      pushItem(false, bullet[1]);
      continue;
    }

    const ordered = ORDERED.exec(line);
    if (ordered) {
      flushPara();
      pushItem(true, ordered[1]);
      continue;
    }

    para.push(line.trim());
  }

  flushPara();
  return blocks;
}
