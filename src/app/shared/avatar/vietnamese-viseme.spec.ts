import {
  cuesToTimeline,
  frameAt,
  textToVisemeCues,
  visemeAt,
  type VisemeCue,
} from './vietnamese-viseme';

/**
 * Khoá bảng quy tắc chữ → khẩu hình.
 *
 * Đây là phần DUY NHẤT của tính năng avatar mà máy kiểm được: hình ảnh 3D có khớp giọng hay không
 * thì chỉ mắt người mới thấy (jsdom không có WebGL). Nên test ở đây bám vào những chỗ SAI ĐƯỢC MÀ
 * KHÔNG AI HAY: nhịp lệch dần sau một con số, nguyên âm đôi bị tách rời, từ tiếng Anh bị ép theo
 * quy tắc tiếng Việt.
 */

/** Bỏ tiền tố cho dễ đọc assert: 'viseme_aa' → 'aa'. */
const shape = (cues: VisemeCue[]) => cues.map((c) => c.viseme.replace('viseme_', '')).join(' ');

/** Bỏ hai `sil` bao ngoài để assert đúng phần lõi. */
const core = (text: string) => {
  const parts = shape(textToVisemeCues(text)).split(' ');
  return parts.slice(1, -1).join(' ');
};

describe('textToVisemeCues — âm tiết tiếng Việt', () => {
  it('tách đúng [phụ âm đầu][âm chính][phụ âm cuối]', () => {
    expect(core('làm')).toBe('nn aa PP');
    expect(core('đẹp')).toBe('DD E PP');
  });

  it('khép môi ở phụ âm cuối m/p — khẩu hình dễ thấy nhất nếu sai', () => {
    expect(core('làm').endsWith('PP')).toBe(true);
    expect(core('đẹp').endsWith('PP')).toBe(true);
  });

  it('khớp phụ âm đầu 3 ký tự trước 2 và 1 ký tự ("ngh" không được đọc thành "n" + "gh")', () => {
    expect(core('nghiêng')).toBe('kk I E kk');
  });

  it('gom nguyên âm đôi thành chuỗi liền thay vì các khẩu hình rời', () => {
    expect(core('người')).toBe('kk U O I');
    expect(core('chuyên')).toBe('CH U I E DD');
  });

  it('"qu" sinh thêm âm đệm /w/', () => {
    expect(core('quy')).toBe('kk U I');
  });

  it('phân biệt ơ/ư với o/u — bỏ hết dấu sẽ làm hai chữ này trùng khẩu hình', () => {
    expect(core('cơm')).toBe('kk O PP');
    expect(core('cưa')).toBe('kk U aa');
    // "cam" dùng nguyên âm mở, khác hẳn "cơm" tròn môi.
    expect(core('cam')).toBe('kk aa PP');
  });

  it('bỏ dấu thanh nhưng không đổi khẩu hình (thanh điệu đổi cao độ, không đổi hình miệng)', () => {
    expect(core('ma')).toBe(core('mà'));
    expect(core('ma')).toBe(core('mạ'));
    expect(core('ma')).toBe(core('mã'));
  });
});

describe('textToVisemeCues — chữ số', () => {
  // HỒI QUY: có lúc số được đổi thành chữ SAU khi bỏ dấu thanh, nên "mốt"/"một" còn nguyên dấu,
  // tra bảng nguyên âm trượt và rơi nhầm sang nhánh từ ngoại lai. Triệu chứng ngoài đời chỉ là
  // miệng lệch dần sau mỗi con số — không lỗi, không cảnh báo.
  it('đọc số thành chữ để nhịp khớp với thứ TTS thật sự đọc', () => {
    expect(core('5 năm')).toBe('nn aa PP nn aa PP'); // "năm năm"
  });

  it('giữ biến âm bắt buộc: "mốt", "lăm"', () => {
    expect(core('21')).toBe('kk aa I PP U O I PP O DD'); // hai mươi mốt
    expect(core('15')).toBe('PP U O I nn aa PP'); // mười lăm
  });

  it('thêm "lẻ" ở hàng trăm để không hụt âm tiết', () => {
    expect(core('105')).toBe('PP O DD CH aa PP nn E nn aa PP'); // một trăm lẻ năm
  });

  it('số sinh ra chữ KHÔNG còn dấu thanh sót lại làm hỏng phân tích', () => {
    // Nếu thứ tự chuẩn hoá sai, "một" rơi vào nhánh ngoại lai và chỉ ra đúng 1 khẩu hình.
    expect(core('100').startsWith('PP O DD')).toBe(true);
  });
});

describe('textToVisemeCues — từ không phải tiếng Việt', () => {
  it('KHÔNG ép thuật ngữ tiếng Anh theo quy tắc âm tiết tiếng Việt', () => {
    // Chỉ ước lượng nhịp theo cụm nguyên âm; hình miệng để sóng âm quyết định.
    expect(core('framework')).toBe('aa E O');
    expect(core('database')).toBe('aa aa aa E');
  });

  it('từ viết tắt không có nguyên âm vẫn ra một khẩu hình trung tính, không rỗng', () => {
    expect(core('SQL')).toBe('aa');
  });

  it('câu trộn Việt–Anh vẫn liền mạch', () => {
    const s = core('Giải thích về REST API');
    expect(s.startsWith('CH aa I')).toBe(true); // "giải"
    expect(s.length).toBeGreaterThan(10);
  });

  // Đây là cơ chế duy nhất cho phép phía phát giọng biết khi nào nên nghe sóng âm thay vì tin chữ.
  // Mất cờ này thì câu trộn Việt–Anh lại quay về tạo hình miệng sai một cách tự tin — và sai âm
  // thầm, vì mọi thứ khác vẫn chạy bình thường.
  it('ĐÁNH DẤU những đoạn suy từ chữ không đáng tin (từ ngoại lai)', () => {
    const cues = textToVisemeCues('Giải thích về REST API');
    const foreign = cues.filter((c) => c.uncertain);
    const vietnamese = cues.filter((c) => !c.uncertain);

    expect(foreign.length).toBeGreaterThan(0);
    expect(vietnamese.length).toBeGreaterThan(0);
    // Âm tiết tiếng Việt thuần thì KHÔNG được đánh dấu — nếu không sẽ vứt bỏ nguồn chính xác nhất.
    expect(textToVisemeCues('xin chào các bạn').every((c) => !c.uncertain)).toBe(true);
    // Ngược lại, câu toàn tiếng Anh thì mọi khẩu hình đều phải nhường cho sóng âm.
    expect(
      textToVisemeCues('framework database')
        .filter((c) => c.viseme !== 'viseme_sil')
        .every((c) => c.uncertain),
    ).toBe(true);
  });

  it('cờ không-đáng-tin đi được qua bước gắn mốc thời gian', () => {
    const frames = cuesToTimeline(textToVisemeCues('về REST API'), 3);
    expect(frames.some((f) => f.uncertain)).toBe(true);
    expect(frames.some((f) => !f.uncertain)).toBe(true);
  });
});

describe('textToVisemeCues — ngắt nghỉ và biên', () => {
  it('luôn mở và đóng bằng sil để miệng khép lúc chưa nói và sau khi nói xong', () => {
    const s = shape(textToVisemeCues('xin chào')).split(' ');
    expect(s[0]).toBe('sil');
    expect(s[s.length - 1]).toBe('sil');
  });

  it('dấu cuối câu nghỉ lâu hơn dấu giữa câu', () => {
    const long = textToVisemeCues('a. b').find((c) => c.viseme === 'viseme_sil' && c.weight > 2);
    const short = textToVisemeCues('a, b').find((c) => c.viseme === 'viseme_sil' && c.weight > 2);
    expect(long).toBeDefined();
    expect(short).toBeUndefined();
  });

  it('chuỗi rỗng / khoảng trắng vẫn trả chuỗi hợp lệ, không ném lỗi', () => {
    expect(shape(textToVisemeCues(''))).toBe('sil sil');
    expect(shape(textToVisemeCues('   '))).toBe('sil sil');
  });

  it('ký hiệu lạ không sinh khẩu hình rác', () => {
    expect(core('@#$%^&*')).toBe('');
  });

  it('mọi khẩu hình đều có trọng số dương (0 sẽ làm mốc thời gian trùng nhau)', () => {
    for (const cue of textToVisemeCues('Bạn hãy giải thích về REST API?')) {
      expect(cue.weight).toBeGreaterThan(0);
    }
  });
});

describe('cuesToTimeline', () => {
  it('co giãn theo thời lượng audio thật — không phụ thuộc tốc độ đọc của giọng TTS', () => {
    const cues = textToVisemeCues('xin chào các bạn');
    const short = cuesToTimeline(cues, 2);
    const long = cuesToTimeline(cues, 6);
    expect(short.length).toBe(long.length);
    // Cùng chuỗi, audio dài gấp 3 thì mọi mốc giãn ra đúng gấp 3.
    for (let i = 0; i < short.length; i++) {
      expect(long[i].at).toBeCloseTo(short[i].at * 3, 5);
    }
  });

  it('mốc thời gian tăng dần và nằm trong thời lượng audio', () => {
    const frames = cuesToTimeline(textToVisemeCues('Bạn có bao nhiêu năm kinh nghiệm?'), 4);
    expect(frames[0].at).toBe(0);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].at).toBeGreaterThan(frames[i - 1].at);
      expect(frames[i].at).toBeLessThan(4);
    }
  });

  it('thời lượng không hợp lệ → mảng rỗng, không chia cho 0', () => {
    const cues = textToVisemeCues('xin chào');
    expect(cuesToTimeline(cues, 0)).toEqual([]);
    expect(cuesToTimeline(cues, Number.NaN)).toEqual([]);
    expect(cuesToTimeline([], 5)).toEqual([]);
  });
});

describe('visemeAt', () => {
  it('trả đúng khẩu hình đang có hiệu lực tại mốc thời gian', () => {
    const frames = cuesToTimeline(textToVisemeCues('làm'), 1);
    expect(visemeAt(frames, 0)).toBe('viseme_sil');
    expect(visemeAt(frames, 0.99)).toBe('viseme_sil'); // sil đóng ở cuối
    const mid = frames[2].at;
    expect(visemeAt(frames, mid)).toBe(frames[2].viseme);
  });

  it('thời điểm trước khung đầu và sau khung cuối đều an toàn', () => {
    const frames = cuesToTimeline(textToVisemeCues('xin chào'), 2);
    expect(visemeAt(frames, -5)).toBe(frames[0].viseme);
    expect(visemeAt(frames, 999)).toBe(frames[frames.length - 1].viseme);
    expect(visemeAt([], 1)).toBe('viseme_sil');
  });

  it('frameAt trả cả cờ độ tin cậy, không chỉ khẩu hình', () => {
    const frames = cuesToTimeline(textToVisemeCues('về framework'), 2);
    const uncertainFrame = frames.find((f) => f.uncertain);
    expect(uncertainFrame).toBeDefined();
    expect(frameAt(frames, uncertainFrame!.at)?.uncertain).toBe(true);
    expect(frameAt([], 0)).toBeNull();
  });
});
