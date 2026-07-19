import { thresholdSeriesValues } from './radar-chart';

/**
 * Mốc đối chiếu chỉ phủ MỘT PHẦN tiêu chí là chuyện thường (BE chỉ có dữ liệu cho tiêu chí nào đủ
 * mẫu). Trục thiếu mốc phải để KHUYẾT, không được vẽ 0 — vẽ 0 là dìm đường mốc xuống đáy, và người
 * xem sẽ đọc ra "mình vượt mốc" ở đúng tiêu chí chưa hề có mốc nào để so.
 *
 * Đây là hạng bug im lặng: biểu đồ vẫn vẽ đẹp, không có lỗi nào, chỉ kết luận là sai.
 */
describe('thresholdSeriesValues — lớp mốc của radar', () => {
  it('trục thiếu mốc để KHUYẾT ("-"), KHÔNG vẽ 0', () => {
    const values = thresholdSeriesValues([
      { name: 'Kiến thức', percentage: 80, threshold: 50 },
      { name: 'Giao tiếp', percentage: 40, threshold: null },
      { name: 'Tư duy', percentage: 60, threshold: 70 },
    ]);

    expect(values).toEqual([50, '-', 70]);
    // Chốt thẳng điều dễ bị "sửa nhầm" nhất.
    expect(values).not.toContain(0);
  });

  it('mốc 0 THẬT vẫn là 0 — không bị nhầm thành khuyết', () => {
    // `?? ` (nullish) chứ không phải `||`: dùng `||` thì mốc 0 hợp lệ sẽ biến thành "-".
    expect(thresholdSeriesValues([{ name: 'A', percentage: 10, threshold: 0 }])).toEqual([0]);
  });

  it('không có mốc nào → toàn khuyết', () => {
    expect(
      thresholdSeriesValues([
        { name: 'A', percentage: 10, threshold: null },
        { name: 'B', percentage: 20, threshold: null },
      ]),
    ).toEqual(['-', '-']);
  });
});
