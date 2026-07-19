import { MdBlock, parseInline, parseMarkdown } from './mini-markdown';

/**
 * Parser thuần — chỗ test rẻ nhất và đáng nhất của F6b. Ngoài chuyện parse đúng, bộ test này
 * còn KHOÁ RÀNG BUỘC BẢO MẬT: parser trả CHỮ, không trả HTML. Chừng nào các assert về `<` và `&`
 * còn xanh thì không ai lỡ tay chuyển sang sinh HTML + `innerHTML` được.
 */
describe('mini-markdown', () => {
  it('rỗng / null → không có block nào', () => {
    expect(parseMarkdown(null)).toEqual([]);
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('   \n  \n')).toEqual([]);
  });

  it('heading theo số dấu #', () => {
    const blocks = parseMarkdown('# Một\n## Hai\n###### Sáu');

    expect(blocks.map((b) => b.type)).toEqual(['heading', 'heading', 'heading']);
    expect(blocks.map((b) => (b as Extract<MdBlock, { type: 'heading' }>).level)).toEqual([1, 2, 6]);
    expect((blocks[0] as Extract<MdBlock, { type: 'heading' }>).spans[0].text).toBe('Một');
  });

  it('gạch đầu dòng liên tiếp gom thành MỘT danh sách', () => {
    const blocks = parseMarkdown('- Một\n- Hai\n* Ba');

    expect(blocks.length).toBe(1);
    const list = blocks[0] as Extract<MdBlock, { type: 'list' }>;
    expect(list.ordered).toBe(false);
    expect(list.items.length).toBe(3);
    expect(list.items.map((i) => i[0].text)).toEqual(['Một', 'Hai', 'Ba']);
  });

  it('danh sách đánh số tách khỏi danh sách gạch đầu dòng', () => {
    const blocks = parseMarkdown('- Gạch\n1. Số');

    expect(blocks.map((b) => b.type)).toEqual(['list', 'list']);
    expect((blocks[0] as Extract<MdBlock, { type: 'list' }>).ordered).toBe(false);
    expect((blocks[1] as Extract<MdBlock, { type: 'list' }>).ordered).toBe(true);
  });

  it('**đậm** và `code` trở thành span riêng, dấu cú pháp bị nuốt', () => {
    const spans = parseInline('Cần **kiên trì** và `git rebase` nhé');

    expect(spans).toEqual([
      { type: 'text', text: 'Cần ' },
      { type: 'bold', text: 'kiên trì' },
      { type: 'text', text: ' và ' },
      { type: 'code', text: 'git rebase' },
      { type: 'text', text: ' nhé' },
    ]);
  });

  it('dòng trống ngắt đoạn; các dòng liền nhau gộp thành một đoạn', () => {
    const blocks = parseMarkdown('Dòng một\nDòng hai\n\nĐoạn sau');

    expect(blocks.length).toBe(2);
    expect((blocks[0] as Extract<MdBlock, { type: 'paragraph' }>).spans[0].text).toBe(
      'Dòng một Dòng hai',
    );
    expect((blocks[1] as Extract<MdBlock, { type: 'paragraph' }>).spans[0].text).toBe('Đoạn sau');
  });

  // 🔴 RÀNG BUỘC BẢO MẬT — parser trả CHỮ, tuyệt đối không trả HTML.
  it('ký tự < và & giữ NGUYÊN dạng chữ, không bị biến thành thẻ hay entity', () => {
    const blocks = parseMarkdown('So sánh a < b && c > d');

    const text = (blocks[0] as Extract<MdBlock, { type: 'paragraph' }>).spans[0].text;
    expect(text).toBe('So sánh a < b && c > d');
    expect(text).not.toContain('&lt;');
    expect(text).not.toContain('&amp;');
  });

  it('thẻ script trong nội dung AI sinh ra vẫn chỉ là chữ', () => {
    const blocks = parseMarkdown('# <script>alert(1)</script>');

    const spans = (blocks[0] as Extract<MdBlock, { type: 'heading' }>).spans;
    expect(spans).toEqual([{ type: 'text', text: '<script>alert(1)</script>' }]);
  });

  it('cú pháp không hỗ trợ giữ nguyên dạng chữ, không parse sai', () => {
    const spans = parseInline('bảng | cột | và _gạch dưới_');

    expect(spans).toEqual([{ type: 'text', text: 'bảng | cột | và _gạch dưới_' }]);
  });
});
