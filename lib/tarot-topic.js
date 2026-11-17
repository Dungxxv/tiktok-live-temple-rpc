'use strict';
// Đoán chủ đề từ câu hỏi admin ghi cho khách (không tốn token, không gọi mạng): đếm từ khóa, chủ đề nhiều điểm nhất thắng.
// Chủ đề = tên tab 3 lá trong readings.json: love / career / finance / study (overview = không rõ).

const KEYWORDS = {
  love: ['tình yêu', 'tình cảm', 'người yêu', 'người ấy', 'người cũ', 'ny', 'crush', 'yêu', 'thích', 'chia tay', 'quay lại', 'tái hợp',
    'kết hôn', 'cưới', 'hôn nhân', 'vợ', 'chồng', 'bạn trai', 'bạn gái', 'nửa kia', 'duyên', 'độc thân', 'hẹn hò', 'thả thính', 'nhớ mình',
    'ghen', 'ngoại tình', 'tỏ tình', 'mập mờ', 'đối phương'],
  career: ['công việc', 'việc làm', 'sự nghiệp', 'đổi việc', 'nghỉ việc', 'chuyển việc', 'xin việc', 'tìm việc', 'thăng tiến', 'thăng chức',
    'sếp', 'đồng nghiệp', 'công ty', 'phỏng vấn', 'làm ăn', 'kinh doanh', 'khởi nghiệp', 'dự án', 'nghề', 'đi làm', 'cơ quan', 'job', 'offer'],
  finance: ['tiền', 'tài chính', 'tài lộc', 'thu nhập', 'lương', 'thưởng', 'nợ', 'vay', 'tiết kiệm', 'chi tiêu', 'đầu tư', 'mua nhà',
    'mua xe', 'giàu', 'kiếm tiền', 'của cải', 'buôn bán', 'lộc'],
  study: ['học', 'thi', 'kỳ thi', 'điểm', 'trường', 'đại học', 'du học', 'bài vở', 'ôn thi', 'tốt nghiệp', 'học bổng', 'luận văn',
    'đồ án', 'chứng chỉ', 'ielts', 'toeic', 'thầy cô', 'lớp']
};

const norm = (s) => ` ${String(s || '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

/**
 * @param {string} question
 * @param {string[]} [allowed]  chỉ trả chủ đề có trong danh sách này (vd. các tab có trong sheet)
 * @returns {{ topic: string, hits: string[] } | null}
 */
function detectTopic(question, allowed = null) {
  const q = norm(question);
  if (q.trim() === '') return null;
  let best = null;
  for (const [topic, words] of Object.entries(KEYWORDS)) {
    if (allowed && !allowed.includes(topic)) continue;
    const hits = words.filter((w) => q.includes(` ${w} `));
    // Cụm nhiều chữ đáng tin hơn một chữ đơn ("đổi việc" > "lộc").
    const score = hits.reduce((s, w) => s + (w.includes(' ') ? 2 : 1), 0);
    if (score > 0 && (!best || score > best.score)) best = { topic, hits, score };
  }
  return best ? { topic: best.topic, hits: best.hits } : null;
}

module.exports = { detectTopic, KEYWORDS };
