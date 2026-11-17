// Đoán chủ đề từ câu hỏi (0 token): từ khóa nguyên chữ, cụm nhiều chữ nặng hơn.
import { describe, expect, it } from 'bun:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { detectTopic } = require('../lib/tarot-topic.js');

describe('detectTopic', () => {
  it('nhận đúng các chủ đề thường gặp', () => {
    expect(detectTopic('Tháng này mình có nên đổi việc không?').topic).toBe('career');
    expect(detectTopic('Người ấy có còn nhớ mình không?').topic).toBe('love');
    expect(detectTopic('Người yêu cũ có quay lại không?').topic).toBe('love');
    expect(detectTopic('Năm nay tài chính của mình ra sao?').topic).toBe('finance');
    expect(detectTopic('Kỳ thi đại học sắp tới thế nào?').topic).toBe('study');
    expect(detectTopic('Sếp mới có quý mình không?').topic).toBe('career');
  });

  it('không rõ → null; khớp nguyên chữ (không bắt "thi" trong "thích" hay "ny" trong "nyc")', () => {
    expect(detectTopic('Dạo này mình thấy thế nào?')).toBeNull();
    expect(detectTopic('')).toBeNull();
    expect(detectTopic('Mình thích màu xanh')?.topic).toBe('love');   // "thích" là từ khóa tình cảm, không phải "thi"
    expect(detectTopic('Đi nyc chơi')).toBeNull();
  });

  it('chỉ trả chủ đề được phép (tab có trong sheet); cụm nhiều chữ thắng chữ đơn', () => {
    expect(detectTopic('Có nên đổi việc không?', ['love', 'finance'])).toBeNull();
    // "đổi việc"(2) + "lương"(1 finance) → career
    expect(detectTopic('Đổi việc để lương cao hơn?').topic).toBe('career');
  });
});
