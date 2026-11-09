// Sinh data/tarot/cards.json (78 lá, chủ đề "general").
// Chạy: node scripts/build-tarot-cards.mjs
// Ẩn chính (22 lá): lời giải soạn tay. Ẩn phụ (56 lá): ghép từ mẫu theo số và bộ, CẦN NGƯỜI DUYỆT trước khi live thật.
// Quy tắc nội dung: giải trí, nhẹ nhàng, không khẳng định về sức khỏe/pháp lý/tài chính/thai sản/tính mạng.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// [số, name_vi, name_en, từ khóa xuôi, từ khóa ngược, lời giải xuôi (3 câu), lời giải ngược (3 câu)]
const MAJOR = [
  [0, 'Chàng Khờ', 'The Fool', ['khởi đầu mới', 'tự do', 'tin tưởng'], ['liều lĩnh', 'thiếu cân nhắc'],
    ['Một khởi đầu mới đang chờ bạn phía trước.', 'Đôi khi chỉ cần một bước nhẹ nhàng và một trái tim cởi mở.', 'Hãy tin vào sự tò mò của chính mình.'],
    ['Bạn đang muốn lao đi thật nhanh.', 'Một chút cân nhắc sẽ giúp bước chân vững hơn.', 'Hãy nhìn đường trước khi nhảy.']],
  [1, 'Nhà Ảo Thuật', 'The Magician', ['khả năng', 'tập trung', 'sáng tạo'], ['phân tán', 'chưa dùng hết sức'],
    ['Bạn đang có đủ những gì cần thiết trong tay.', 'Sự tập trung sẽ biến ý tưởng thành điều có thật.', 'Hãy bắt đầu từ việc nhỏ nhất.'],
    ['Có thể bạn đang chia sức vào quá nhiều nơi.', 'Thử chọn một điều quan trọng nhất để làm trước.', 'Một việc làm trọn vẹn đáng giá hơn nhiều việc dang dở.']],
  [2, 'Nữ Tư Tế', 'The High Priestess', ['trực giác', 'tĩnh lặng', 'bí ẩn'], ['bỏ qua trực giác', 'ồn ào'],
    ['Câu trả lời đang nằm sâu trong sự tĩnh lặng của bạn.', 'Hãy lắng nghe cảm giác đầu tiên của mình.', 'Không phải điều gì cũng cần nói ra ngay.'],
    ['Tiếng ồn xung quanh có thể che mất tiếng lòng bạn.', 'Dành một chút thời gian yên tĩnh cho riêng mình.', 'Câu trả lời sẽ rõ hơn khi tâm bạn lắng xuống.']],
  [3, 'Nữ Hoàng', 'The Empress', ['nuôi dưỡng', 'dồi dào', 'dịu dàng'], ['chăm sóc quá mức', 'trì trệ'],
    ['Sự dịu dàng và chăm sóc đang nở hoa quanh bạn.', 'Hãy tận hưởng những điều đẹp đẽ đang có.', 'Bạn xứng đáng được nuôi dưỡng như cách bạn nuôi dưỡng người khác.'],
    ['Bạn đang dành nhiều cho người khác hơn cho mình.', 'Hãy nhớ chăm sóc bản thân trước tiên.', 'Nghỉ ngơi cũng là một cách yêu thương.']],
  [4, 'Hoàng Đế', 'The Emperor', ['vững vàng', 'trật tự', 'trách nhiệm'], ['cứng nhắc', 'kiểm soát'],
    ['Một nền tảng vững chắc đang giúp bạn đứng vững.', 'Sự rõ ràng và kỷ luật sẽ mang lại cảm giác an tâm.', 'Hãy đặt ra vài quy tắc nhỏ cho riêng mình.'],
    ['Bạn có thể đang muốn kiểm soát mọi thứ chặt quá.', 'Thử nới lỏng một chút để mọi việc thở được.', 'Sự mềm mỏng cũng là một loại sức mạnh.']],
  [5, 'Giáo Hoàng', 'The Hierophant', ['truyền thống', 'học hỏi', 'cố vấn'], ['phá lệ', 'tự tìm lối riêng'],
    ['Lời khuyên từ người có kinh nghiệm có thể giúp ích cho bạn.', 'Những điều đã được kiểm chứng đáng để tham khảo.', 'Hãy học hỏi với tinh thần cởi mở.'],
    ['Có lẽ bạn đang muốn tự tìm một lối đi riêng.', 'Điều đó cũng ổn, miễn là bạn tự hiểu lý do của mình.', 'Hãy chọn cách phù hợp với giá trị của bạn.']],
  [6, 'Đôi Tình Nhân', 'The Lovers', ['lựa chọn', 'hòa hợp', 'giá trị'], ['phân vân', 'lệch nhịp'],
    ['Bạn đang đứng trước một lựa chọn theo trái tim.', 'Hãy chọn điều hợp với giá trị thật của mình.', 'Sự chân thành luôn là điểm khởi đầu tốt.'],
    ['Có chút lệch nhịp giữa điều bạn nghĩ và điều bạn cảm.', 'Hãy trò chuyện thật lòng, trước hết là với chính mình.', 'Khi rõ ràng, lựa chọn sẽ đến nhẹ nhàng hơn.']],
  [7, 'Cỗ Xe', 'The Chariot', ['quyết tâm', 'tiến lên', 'làm chủ'], ['mất hướng', 'vội vã'],
    ['Bạn có đủ quyết tâm để tiến về phía trước.', 'Giữ vững hướng đi và đừng để mình bị xao nhãng.', 'Một bước tiến đều đặn sẽ đưa bạn tới nơi.'],
    ['Bạn có thể đang bị kéo về nhiều hướng cùng lúc.', 'Dừng lại một nhịp để chọn lại hướng đi.', 'Cầm lại dây cương bằng sự bình tĩnh.']],
  [8, 'Sức Mạnh', 'Strength', ['kiên nhẫn', 'dịu dàng', 'can đảm'], ['nghi ngờ bản thân', 'mệt mỏi'],
    ['Sức mạnh thật sự của bạn nằm ở sự dịu dàng và kiên nhẫn.', 'Bạn mạnh mẽ hơn bạn nghĩ.', 'Hãy đối xử ôn hòa với chính mình.'],
    ['Bạn có thể đang tự nghi ngờ bản thân hơi nhiều.', 'Hãy nhớ lại những lần bạn đã vượt qua.', 'Một lời động viên nhẹ nhàng sẽ giúp bạn đứng dậy.']],
  [9, 'Ẩn Sĩ', 'The Hermit', ['nhìn vào bên trong', 'trầm lắng', 'sáng suốt'], ['cô lập', 'khép mình'],
    ['Đây là lúc thích hợp để lắng lại và nhìn vào bên trong.', 'Một ngọn đèn nhỏ cũng đủ soi đường cho bạn.', 'Thời gian một mình có thể mang lại sự sáng rõ.'],
    ['Bạn đang ở một mình hơi lâu.', 'Thử chia sẻ với một người bạn tin tưởng.', 'Ánh sáng đôi khi đến từ một cuộc trò chuyện.']],
  [10, 'Bánh Xe Vận Mệnh', 'Wheel of Fortune', ['chuyển biến', 'chu kỳ', 'cơ hội'], ['trì hoãn', 'chưa đúng lúc'],
    ['Mọi thứ đang chuyển động và có một cơ hội mới đang xoay tới.', 'Mọi chu kỳ đều có lúc lên lúc xuống.', 'Hãy giữ lòng cởi mở trước sự thay đổi.'],
    ['Thời điểm có vẻ chưa hoàn toàn khớp.', 'Đừng vội, bánh xe vẫn đang quay.', 'Chuẩn bị tốt sẽ giúp bạn đón lấy cơ hội kế tiếp.']],
  [11, 'Công Lý', 'Justice', ['cân bằng', 'công bằng', 'rõ ràng'], ['thiên lệch', 'né tránh'],
    ['Sự cân bằng và trung thực đang là chìa khóa.', 'Hãy nhìn mọi việc bằng con mắt công tâm.', 'Điều bạn gieo bằng sự chân thành sẽ trở lại với bạn.'],
    ['Có điều gì đó chưa thật cân bằng trong cách bạn nhìn nhận.', 'Thử nhìn sự việc từ một góc độ khác.', 'Sự thành thật với bản thân sẽ giúp bạn nhẹ lòng.']],
  [12, 'Người Treo Ngược', 'The Hanged Man', ['góc nhìn mới', 'chờ đợi', 'buông bỏ'], ['bế tắc', 'níu giữ'],
    ['Đôi khi dừng lại để thấy mọi thứ từ một góc nhìn mới.', 'Sự chờ đợi lúc này không phải là lãng phí.', 'Hãy thử buông bớt điều bạn đang nắm chặt.'],
    ['Có cảm giác mắc kẹt, và có thể bạn đang níu giữ quá nhiều.', 'Chọn một điều nhỏ để thay đổi.', 'Chỉ một chút xoay chuyển cũng đủ mở lối.']],
  [13, 'Kết Thúc & Tái Sinh', 'Death', ['kết thúc', 'chuyển hóa', 'làm mới'], ['níu kéo', 'khó buông'],
    ['Một chương cũ khép lại để chương mới được mở ra.', 'Sự thay đổi nào cũng cần một chút can đảm.', 'Bạn đang được làm mới theo cách nhẹ nhàng.'],
    ['Bạn đang giữ lại điều đã đến lúc nên khép lại.', 'Cho phép mình nói lời tạm biệt nhẹ nhàng.', 'Khoảng trống sẽ sớm có điều mới đến lấp đầy.']],
  [14, 'Sự Điều Hòa', 'Temperance', ['cân bằng', 'kiên nhẫn', 'hài hòa'], ['quá đà', 'mất nhịp'],
    ['Hãy pha trộn mọi thứ vừa phải, mỗi điều một chút.', 'Sự kiên nhẫn đang giúp mọi thứ hòa hợp.', 'Bạn đang tìm được nhịp riêng của mình.'],
    ['Có thể bạn đang làm một điều gì đó hơi quá đà.', 'Hãy tìm lại nhịp điệu vừa sức.', 'Đều đặn và nhẹ nhàng thường bền hơn dồn dập.']],
  [15, 'Cám Dỗ', 'The Devil', ['ràng buộc', 'thói quen', 'ham muốn'], ['tự do', 'thoát khỏi thói quen'],
    ['Có thể bạn đang gắn bó với một thói quen khó rời.', 'Nhận ra nó là bước đầu để bạn nhẹ lòng hơn.', 'Bạn luôn có quyền chọn lại.'],
    ['Bạn đang dần thoát khỏi một ràng buộc cũ.', 'Hãy tiếp tục từng bước nhỏ.', 'Sự nhẹ nhõm đang ở rất gần.']],
  [16, 'Tòa Tháp', 'The Tower', ['bất ngờ', 'thay đổi lớn', 'bừng tỉnh'], ['sợ thay đổi', 'trì hoãn'],
    ['Một điều bất ngờ có thể làm xáo trộn nhịp quen thuộc.', 'Từ đó, bạn có thể thấy điều thật sự quan trọng.', 'Hãy giữ bình tĩnh và xây lại thật vững.'],
    ['Bạn đang lo lắng về một thay đổi sắp tới.', 'Việc chuẩn bị tinh thần sẽ giúp bạn nhẹ nhàng hơn.', 'Mỗi thay đổi đều chứa một cơ hội để bắt đầu lại.']],
  [17, 'Ngôi Sao', 'The Star', ['hy vọng', 'chữa lành', 'niềm tin'], ['mất niềm tin', 'mệt mỏi'],
    ['Hy vọng đang sáng lên như một ngôi sao trong đêm.', 'Bạn đang dần lấy lại sự bình yên trong lòng.', 'Hãy tin vào điều tốt đẹp đang đến.'],
    ['Có lúc bạn thấy hy vọng hơi mờ.', 'Hãy làm một điều nhỏ khiến bạn thấy dễ chịu.', 'Ánh sáng nhỏ nhất cũng đủ để bạn đi tiếp.']],
  [18, 'Mặt Trăng', 'The Moon', ['mơ hồ', 'cảm xúc', 'trực giác'], ['sáng tỏ dần', 'bớt lo âu'],
    ['Mọi thứ có thể chưa thật rõ ràng, và điều đó bình thường.', 'Hãy đi chậm và tin vào trực giác của mình.', 'Sự mơ hồ sẽ dần tan khi trời sáng.'],
    ['Mọi thứ đang dần sáng tỏ hơn.', 'Những lo lắng cũng nhẹ đi theo từng ngày.', 'Hãy cho mình thêm một chút thời gian.']],
  [19, 'Mặt Trời', 'The Sun', ['niềm vui', 'rạng rỡ', 'tích cực'], ['niềm vui tạm lắng', 'cần thời gian'],
    ['Niềm vui và sự rạng rỡ đang chiếu vào bạn.', 'Hãy chia sẻ nụ cười của mình với người xung quanh.', 'Một ngày nhiều ánh sáng đang đến.'],
    ['Niềm vui của bạn đang tạm lắng xuống một chút.', 'Hãy làm điều đơn giản khiến bạn mỉm cười.', 'Ánh nắng vẫn ở đó, chỉ là chờ mây tan.']],
  [20, 'Tiếng Gọi Thức Tỉnh', 'Judgement', ['nhìn lại', 'tha thứ', 'bước sang trang'], ['do dự', 'tự trách'],
    ['Đây là lúc nhìn lại chặng đường đã qua với lòng biết ơn.', 'Bạn đã học được nhiều điều đáng quý.', 'Hãy sẵn sàng bước sang một trang mới.'],
    ['Bạn có thể đang hơi khắt khe với chính mình.', 'Hãy tha thứ cho những điều đã qua.', 'Bạn xứng đáng có một khởi đầu nhẹ nhõm hơn.']],
  [21, 'Thế Giới', 'The World', ['trọn vẹn', 'hoàn thành', 'thành tựu'], ['gần xong', 'bước cuối'],
    ['Một chặng đường đang đi đến độ trọn vẹn.', 'Hãy tự hào về những gì bạn đã làm được.', 'Sau niềm vui hoàn thành, một hành trình mới sẽ mở ra.'],
    ['Bạn đang ở gần đích rồi.', 'Chỉ cần một chút chăm chút ở bước cuối.', 'Đừng bỏ qua việc ăn mừng những điều nhỏ.']]
];

const SUITS = [
  { key: 'wands', vi: 'Gậy', en: 'Wands', area: 'hành động và đam mê của bạn',
    adviceUp: 'Hãy giữ ngọn lửa nhiệt huyết, và nhớ nghỉ ngơi khi cần.',
    adviceRev: 'Hãy chọn một việc nhỏ để bắt đầu thay vì làm tất cả cùng lúc.' },
  { key: 'cups', vi: 'Cốc', en: 'Cups', area: 'cảm xúc và các mối quan hệ của bạn',
    adviceUp: 'Hãy lắng nghe trái tim mình và nói ra điều bạn cảm nhận.',
    adviceRev: 'Dành cho mình một khoảng lặng để cảm xúc được nghỉ ngơi.' },
  { key: 'swords', vi: 'Kiếm', en: 'Swords', area: 'suy nghĩ và cách bạn trò chuyện',
    adviceUp: 'Hãy chọn lời nói nhẹ nhàng và rõ ràng với chính mình lẫn người khác.',
    adviceRev: 'Thử viết ra những suy nghĩ rối để mọi thứ sáng rõ hơn.' },
  { key: 'pentacles', vi: 'Tiền Xu', en: 'Pentacles', area: 'công việc và những thói quen hằng ngày',
    adviceUp: 'Từng bước nhỏ và đều đặn sẽ giúp bạn đi xa.',
    adviceRev: 'Hãy sắp xếp lại thói quen để bạn đỡ mệt hơn.' }
];

// [vi, en, từ khóa xuôi, từ khóa ngược, câu xuôi, câu ngược] — {a} là lĩnh vực của bộ.
const RANKS = [
  ['Át', 'Ace', ['khởi đầu', 'hạt giống'], ['chậm trễ', 'chưa rõ'], 'Một khởi đầu mới đang mở ra trong {a}.', 'Khởi đầu còn chậm hoặc chưa rõ ràng trong {a}.'],
  ['Hai', 'Two', ['lựa chọn', 'cân bằng'], ['phân vân', 'lưỡng lự'], 'Bạn đang cân nhắc giữa hai hướng đi trong {a}.', 'Sự phân vân kéo dài trong {a} có thể làm bạn mệt.'],
  ['Ba', 'Three', ['phát triển', 'hợp tác'], ['lệch nhịp', 'thiếu phối hợp'], 'Có sự phát triển và hợp tác tốt đẹp trong {a}.', 'Mọi thứ trong {a} chưa thật khớp nhịp với nhau.'],
  ['Bốn', 'Four', ['ổn định', 'nghỉ ngơi'], ['trì trệ', 'bám víu'], 'Đây là lúc ổn định và nghỉ ngơi trong {a}.', 'Bạn có thể đang bám quá chặt vào sự quen thuộc trong {a}.'],
  ['Năm', 'Five', ['thử thách', 'học hỏi'], ['dịu lại', 'hòa giải'], 'Có chút va chạm hoặc thử thách trong {a}, nhưng đều giúp bạn học hỏi.', 'Căng thẳng trong {a} đang dịu dần nếu bạn chịu lắng nghe.'],
  ['Sáu', 'Six', ['hài hòa', 'tiến về phía trước'], ['buông cái cũ', 'chưa trôi chảy'], 'Mọi thứ trong {a} đang dần hài hòa và tiến về phía trước.', 'Bạn có thể cần buông một điều cũ trong {a} để đi tiếp.'],
  ['Bảy', 'Seven', ['kiên trì', 'giữ vững'], ['nghi ngờ', 'chùn bước'], 'Bạn đang cần kiên trì và giữ vững lập trường trong {a}.', 'Đừng để sự nghi ngờ làm bạn chùn bước trong {a}.'],
  ['Tám', 'Eight', ['chuyển động', 'tiến triển'], ['quá vội', 'cần chăm chút'], 'Mọi việc trong {a} đang chuyển động nhanh và có tiến triển.', 'Hãy chậm lại một chút, vì {a} cần được chăm chút kỹ hơn.'],
  ['Chín', 'Nine', ['gần thành quả', 'bền bỉ'], ['áp lực', 'tự đòi hỏi'], 'Bạn đã đi được một chặng dài trong {a}, thành quả đang ở gần.', 'Bạn có thể đang tự đặt áp lực quá nhiều lên {a}.'],
  ['Mười', 'Ten', ['trọn vẹn', 'hoàn tất chu kỳ'], ['gánh nặng', 'chia sẻ bớt'], 'Một chu kỳ trong {a} đang đi đến độ trọn vẹn.', 'Bạn đang mang nhiều hơn mức cần thiết trong {a}, hãy chia sẻ bớt.'],
  ['Thị Đồng', 'Page', ['tò mò', 'tin mới'], ['non nớt', 'kiên nhẫn'], 'Một ý tưởng hoặc tin mới đáng để bạn tò mò trong {a}.', 'Hãy kiên nhẫn hơn với những điều còn non nớt trong {a}.'],
  ['Kỵ Sĩ', 'Knight', ['năng lượng', 'tiến tới'], ['vội vàng', 'cân nhắc'], 'Bạn đang đầy năng lượng để tiến tới trong {a}.', 'Đừng vội vàng, hãy cân nhắc kỹ hơn trong {a}.'],
  ['Nữ Hoàng', 'Queen', ['dịu dàng', 'trưởng thành'], ['chăm sóc bản thân', 'nuôi dưỡng'], 'Sự dịu dàng và trưởng thành đang dẫn lối bạn trong {a}.', 'Hãy dành thời gian chăm sóc bản thân trước khi lo cho {a}.'],
  ['Vua', 'King', ['chủ động', 'vững vàng'], ['mềm mỏng', 'bớt cứng nhắc'], 'Bạn có thể chủ động và vững vàng dẫn dắt {a}.', 'Mềm mỏng hơn một chút sẽ giúp {a} thuận lợi hơn.']
];

const pad = (n) => String(n).padStart(2, '0');
const cards = [];

for (const [num, vi, en, ku, kr, up, rev] of MAJOR) {
  cards.push({
    id: `major-${pad(num)}`, arcana: 'major', suit: null, number: num,
    name_vi: vi, name_en: en, keywords_up: ku, keywords_rev: kr,
    readings: { general: { up, rev } }
  });
}

for (const s of SUITS) {
  RANKS.forEach(([rvi, ren, ku, kr, up, rev], i) => {
    const num = i + 1;
    const nameVi = num === 1 ? `Át ${s.vi}` : `${rvi} ${s.vi}`;
    cards.push({
      id: `${s.key}-${pad(num)}`, arcana: 'minor', suit: s.key, number: num,
      name_vi: nameVi, name_en: `${ren} of ${s.en}`,
      keywords_up: ku, keywords_rev: kr,
      readings: {
        general: {
          up: [up.replace('{a}', s.area), s.adviceUp],
          rev: [rev.replace('{a}', s.area), s.adviceRev]
        }
      }
    });
  });
}

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'data', 'tarot', 'cards.json');
fs.writeFileSync(out, JSON.stringify({
  _note: 'Sinh bởi scripts/build-tarot-cards.mjs. Ẩn phụ ghép theo mẫu, cần người duyệt trước khi live thật.',
  cards
}, null, 2) + '\n', 'utf8');
console.log(`Đã ghi ${cards.length} lá vào ${out}`);
