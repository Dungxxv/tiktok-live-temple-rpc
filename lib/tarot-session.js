'use strict';
// Máy trạng thái phiên Tarot. Server là nguồn sự thật; client chỉ vẽ theo `phase` + `phaseStartedAt`.
// Đồng hồ và hẹn giờ được tiêm vào (clock = { now, setTimeout, clearTimeout }) nên test được bằng đồng hồ giả.
const { draw, withKeywords, pickReading } = require('./tarot-deck');

const ALL_PHASES = ['CALLING', 'SHUFFLING', 'DRAWING', 'REVEALING', 'READING', 'FAREWELL'];
const SPEECH_PHASES = ['CALLING', 'SHUFFLING', 'DRAWING', 'REVEALING', 'READING', 'FAREWELL'];
// Giọng sẵn sàng khi pha mới chạy chưa quá chừng này giây → màn live đọc lại từ câu đầu (khớp public/js/tarot/reading.js).
const LATE_START_SEC = 4;

/**
 * @param scripts  (tùy chọn) nội dung từ Google Sheet: { picker: createReadingPicker(...), build(reservation, entry) → script }.
 *                 Có dữ liệu thì bài + lời đọc lấy từ lượt bốc đã chọn (phiên "gift" 3 lá theo chủ đề / "join" 1 lá);
 *                 không có thì rút ngẫu nhiên như cũ.
 */
function createSession({ config, queue, deck, rng = Math.random, clock, tts = null, scripts = null, onChange = () => {}, onEvent = () => {} }) {
  let version = 0;
  let enabled = true;
  let phase = 'IDLE';
  let phaseStartedAt = 0;
  let phaseEndsAt = null;
  let seat = null;
  let cards = [];
  let reading = null;
  let recent = [];            // id các lá của vài phiên gần nhất (mảng các mảng)
  let phaseTimer = null;
  let welcome = null;      // câu chào người đầu tiên trong lúc chờ: { viewerId, name, line, at, ttsUrls, durations, ready }
  let graceTimer = null;   // chờ vài giây sau khi người đầu tiên vào (xem có tặng quà không) rồi mới mời lên ghế
  let lockTimer = null;
  let sessionToken = 0;       // vô hiệu hóa callback cũ khi phiên đổi
  let prepared = null;
  let ttsWaiting = false;      // đang giữ REVEALING chờ TTS xong để đọc trọn từ câu đầu
  let speech = null;           // lời nói theo pha (chế độ sheet): { ready, failed, phases: { CALLING: {lines, sections, ttsUrls, durations}, ... } }
  const jobs = new Map();      // viewerId → lượt bốc + TTS đã chuẩn bị trước (khi khách thành người kế tiếp)
  let currentJob = null;
  // Phiên nghỉ: nữ tư tế nói một đoạn riêng (xin quà, tâm sự…), không có khách. Admin lên lịch "sau N khách nữa":
  // đếm số phiên BẮT ĐẦU sau lúc lên lịch; khi đã đọc xong đủ N phiên thì phát ngay sau phiên đó (trước khi gọi khách kế).
  // { id, lines, after, started, scheduledAt, tts: { status, urls, durations } }
  let pendingBreak = null;
  let breakSeq = 0;

  const sheetMode = () => !!(scripts && scripts.picker && scripts.picker.hasData());
  // Chủ đề chọn bằng mã bình luận (vd. "02") → 3 lá theo chủ đề đó (Figma); riêng quà "Hỏi cụ thể" vẫn ưu tiên hơn.
  // Quà → 3 lá theo chủ đề quà. Còn lại → 1 lá Tổng quan.
  // singleCardSessions = false: không còn phiên 1 lá — ai không chọn chủ đề thì trải 3 lá Tổng quan.
  // giftSetsTopic = false: quà không đổi chủ đề (chỉ ưu tiên hàng chờ).
  const wantFor = (e) => {
    const giftTopic = e.lane === 'gift' && config.giftSetsTopic !== false && e.topic && e.topic !== 'general' ? e.topic : null;
    if (e.commentTopic && giftTopic !== 'specific') return { type: 'triple', topic: e.commentTopic, via: 'comment' };
    if (giftTopic) return { type: 'triple', topic: giftTopic };
    if (e.lane === 'gift' || config.singleCardSessions === false) return { type: 'triple', topic: 'overview' };
    return { type: 'single' };
  };
  const sameWant = (a, b) => a.type === b.type && (a.type === 'single' || (a.topic === b.topic && a.via === b.via));

  /** Chọn sẵn lượt bốc + bắt đầu tạo giọng đọc cho một khách (gọi khi họ thành người kế tiếp hoặc vào ghế). */
  function prepareFor(entry) {
    if (!sheetMode() || !entry) return null;
    const want = wantFor(entry);
    const old = jobs.get(entry.viewerId);
    if (old && sameWant(old.want, want)) return old;
    jobs.delete(entry.viewerId);
    // Phiên riêng (admin ghi câu hỏi đặc biệt, Claude soạn lời + bộ lá riêng): không lấy dòng sheet, trả dòng đã giữ.
    const own = scripts.customReservation ? scripts.customReservation(entry) : null;
    if (own) scripts.picker.release(entry.viewerId);
    const reservation = own || scripts.picker.reserve(entry.viewerId, want);   // đổi chủ đề thì picker tự trả dòng cũ
    if (!reservation) return null;
    const script = scripts.build(reservation, entry);
    const enabled = !!(tts && config.ttsEnabled);
    // Giọng tạo THEO TỪNG PHA, đúng thứ tự phát: pha nào xong là nói được ngay (không chờ cả phiên).
    const job = { viewerId: entry.viewerId, want, reservation, script, status: enabled ? 'pending' : 'none', phase: {} };
    for (const ph of SPEECH_PHASES) job.phase[ph] = { status: enabled ? 'pending' : 'none', urls: [], durations: [] };
    jobs.set(entry.viewerId, job);
    if (enabled) {
      (async () => {
        for (const ph of SPEECH_PHASES) {
          if (jobs.get(job.viewerId) !== job && currentJob !== job) return;   // khách đã rời hàng
          const lines = script.speech[ph].lines;
          const slot = job.phase[ph];
          try {
            const res = lines.length ? await tts.prepare(lines) : { urls: [], durations: [] };
            if (res) Object.assign(slot, { status: 'ready', urls: res.urls, durations: res.durations });
            else slot.status = 'failed';
          } catch (_) { slot.status = 'failed'; }
          if (currentJob === job) applyJob(job, ph);
        }
        const all = SPEECH_PHASES.map((ph) => job.phase[ph].status);
        job.status = all.every((x) => x === 'ready') ? 'ready' : 'failed';
        if (currentJob === job) applyJob(job, null);
      })();
    }
    return job;
  }

  // Giọng vừa sẵn sàng giữa chừng một pha có lời: kéo dài pha cho đủ nói hết (không cắt câu).
  function extendForSpeech(fromNow = false) {
    const sp = speech?.phases?.[phase];
    if (!sp || !sp.ready || !sp.lines.length || !phaseEndsAt || ttsWaiting || phase === 'READING') return;
    const now = clock.now();
    const sec = sp.durations.reduce((a, b) => a + b, 0) + (config.speechBufferSec ?? 1.2);
    const startAt = fromNow || (now - phaseStartedAt) / 1000 < LATE_START_SEC ? now : phaseStartedAt;   // đọc từ câu đầu hay tiếp tục
    // speechLeadSec: màn live chỉ bắt đầu nói sau khoảng chờ đầu pha
    const lead = Math.max(0, Number(config.speechLeadSec?.[phase]) || 0) * 1000;
    const needEnd = Math.round(Math.max(startAt, phaseStartedAt + lead) + sec * 1000);
    if (needEnd <= phaseEndsAt) return;
    phaseEndsAt = needEnd;
    if (phaseTimer) clock.clearTimeout(phaseTimer);
    const token = sessionToken;
    phaseTimer = clock.setTimeout(() => { if (token === sessionToken) advance(); }, needEnd - now);
  }

  // Cảm ơn chung những bạn tặng quà trong phiên: chuẩn bị câu (có tên) lúc bắt đầu đọc bài, nói ở cuối FAREWELL.
  // Chưa kịp tạo giọng trước FAREWELL thì để dành cho lần cảm ơn sau (không nói câu không có tiếng).
  function requestThanks() {
    if (!scripts?.thanks || !currentJob || !tts || !config.ttsEnabled) return;
    const t = scripts.thanks();
    if (!t) return;
    const job = currentJob;
    Promise.resolve()
      .then(() => tts.prepare([t.text]))
      .then((res) => {
        if (!res || currentJob !== job || !speech || phase === 'FAREWELL') { scripts.thanksRestore?.(t); return; }
        const fw = speech.phases.FAREWELL;
        if (fw.ttsUrls.length !== fw.lines.length) { scripts.thanksRestore?.(t); return; }
        speech.phases.FAREWELL = { lines: [...fw.lines, t.text], sections: [...fw.sections, 'thanks'], ttsUrls: [...fw.ttsUrls, res.urls[0]], durations: [...fw.durations, res.durations[0]] };
        emit('thanks-ready');
      })
      .catch(() => scripts.thanksRestore?.(t));
  }

  /**
   * Gắn kết quả TTS của lượt bốc vào phiên đang ngồi. Mỗi pha có cờ `ready` riêng: pha nào có đủ tiếng là phát được.
   * @param justDone  pha vừa tạo xong giọng (null = cập nhật chung / lần đầu)
   */
  function applyJob(job, justDone = null) {
    const phases = {};
    for (const ph of SPEECH_PHASES) {
      const { lines, sections } = job.script.speech[ph];
      const slot = job.phase[ph];
      const ok = slot.status === 'ready';
      phases[ph] = {
        lines, sections, ready: ok,
        ttsUrls: ok ? slot.urls : [],
        durations: ok ? slot.durations : lines.map((l) => Math.max(1, l.length / config.ttsCharsPerSec))
      };
    }
    // Giữ câu cảm ơn đã thêm vào FAREWELL (nếu có).
    if (speech?.phases?.FAREWELL?.sections?.includes('thanks') && phases.FAREWELL.ready) phases.FAREWELL = speech.phases.FAREWELL;
    const rd = job.phase.READING.status;
    speech = { ready: job.status === 'ready', failed: rd === 'failed', phases };
    const r = phases.READING;
    const total = r.durations.reduce((a, b) => a + b, 0);
    reading = { lines: r.lines, sections: r.sections, ttsUrls: r.ttsUrls, durations: r.ready ? r.durations : [], totalSec: Math.round(total * 10) / 10, ready: r.ready, failed: rd === 'failed' };
    if (justDone === phase) extendForSpeech(true);    // giọng của pha hiện tại vừa xong muộn → màn live đọc từ câu đầu
    else if (justDone === null) extendForSpeech();
    if (justDone) emit(`tts-ready:${justDone}`);
    if (r.ready && ttsWaiting && phase === 'REVEALING') enter('READING');
    if (rd === 'failed') ttsFailed();
  }

  // Thời gian chuyển khách (đếm ngược trên màn hình) giữa hai phiên; 0 = gọi người kế tiếp ngay.
  const intermissionSec = () => Math.max(0, Number(config.phaseSec.INTERMISSION) || 0);
  const phases = () => ALL_PHASES.filter((p) => !config.skipPhases.includes(p) || p === 'CALLING' || p === 'READING' || p === 'FAREWELL');

  function emit(reason) {
    version += 1;
    onChange(reason);
  }

  function clearTimers() {
    if (phaseTimer) clock.clearTimeout(phaseTimer);
    if (lockTimer) clock.clearTimeout(lockTimer);
    phaseTimer = lockTimer = null;
  }

  function estimateSec(lines) {
    return lines.reduce((s, l) => s + Math.max(1, l.length / config.ttsCharsPerSec), 0);
  }

  function ensureCards() {
    if (cards.length || !seat || currentJob) return;
    const exclude = new Set(recent.flat());
    cards = withKeywords(deck, draw(deck, seat.cardsPlanned, { rng, exclude, reversedChance: config.reversedChance }));
    const lines = pickReading(deck, cards, seat.topic);
    reading = { lines, ttsUrls: [], durations: [], totalSec: Math.round(estimateSec(lines) * 10) / 10, ready: false };
    prepareTts(lines);
  }

  function prepareTts(lines) {
    if (!tts || !config.ttsEnabled) return;
    const token = sessionToken;
    prepared = Promise.resolve()
      .then(() => tts.prepare(lines))
      .then((res) => {
        if (token !== sessionToken || !reading) return;
        if (!res) { ttsFailed(); return; }
        const total = res.durations.reduce((s, d) => s + d, 0);
        reading.ttsUrls = res.urls;
        reading.durations = res.durations;
        reading.totalSec = Math.round(total * 10) / 10;
        reading.ready = true;
        emit('tts-ready');
        // Đang giữ màn lật bài chờ giọng đọc: vào READING ngay.
        if (ttsWaiting && phase === 'REVEALING') enter('READING');
      })
      .catch(() => { if (token === sessionToken) ttsFailed(); });
  }

  // TTS lỗi: đọc bằng phụ đề (thời lượng ước tính), không chờ nữa.
  function ttsFailed() {
    if (reading) reading.failed = true;
    if (ttsWaiting && phase === 'REVEALING') enter('READING');
  }

  // Có nên giữ REVEALING thêm để chờ TTS không (tối đa ttsWaitMaxSec giây).
  function shouldWaitTts() {
    return !!(tts && config.ttsEnabled && reading && !reading.ready && !reading.failed && (config.ttsWaitMaxSec || 0) > 0 && !ttsWaiting);
  }

  function waitForTts() {
    ttsWaiting = true;
    const ms = Math.round(config.ttsWaitMaxSec * 1000);
    phaseEndsAt = clock.now() + ms;
    const token = sessionToken;
    phaseTimer = clock.setTimeout(() => { if (token === sessionToken && ttsWaiting) enter('READING'); }, ms);
    emit('tts-wait');
  }

  function enter(next) {
    const now = clock.now();
    phase = next;
    phaseStartedAt = now;
    ttsWaiting = false;
    if (phaseTimer) clock.clearTimeout(phaseTimer);

    if (next === 'IDLE') {
      phaseEndsAt = null;
      phaseTimer = null;
      emit('phase:IDLE');
      return;
    }

    // Phiên nghỉ: ghế trống, nữ tư tế nói đoạn riêng; xong thì quay lại mời khách như thường.
    if (next === 'BREAK') {
      const b = pendingBreak;
      const ok = b.tts.status === 'ready';
      const durations = ok ? b.tts.durations : b.lines.map((l) => Math.max(1, l.length / config.ttsCharsPerSec));
      speech = { ready: ok, phases: { BREAK: { lines: b.lines, sections: b.lines.map(() => 'break'), ttsUrls: ok ? b.tts.urls : [], durations, ready: ok } } };
      const sec = durations.reduce((a, d) => a + d, 0) + (config.speechBufferSec ?? 1.2) + 0.6;
      phaseEndsAt = now + Math.round(sec * 1000);
      const token = sessionToken;
      phaseTimer = clock.setTimeout(() => { if (token === sessionToken) endBreak(); }, Math.round(sec * 1000));
      onEvent('break.start', { id: b.id });
      emit('phase:BREAK');
      return;
    }

    // Chuyển khách: ghế trống, đếm ngược rồi mới gọi người kế tiếp.
    // Người kế tiếp được khóa ở ô 1 (không ai chen nữa) và nữ tư tế nói "… chuẩn bị vào phòng xem bài nha" (Figma).
    if (next === 'INTERMISSION') {
      if (queue.size() > 0) {
        if (!queue.getLockedId()) { const nx = queue.lockNext(); if (nx) prepareFor(nx); }
        const head = queue.snapshot(1).queue[0];
        if (head) startWelcome(head);
      }
      const ms = Math.round(intermissionSec() * 1000);
      phaseEndsAt = now + ms;
      const token = sessionToken;
      phaseTimer = clock.setTimeout(() => {
        if (token !== sessionToken) return;
        if (enabled && queue.size() > 0) beginSession();
        else enter('IDLE');
      }, ms);
      emit('phase:INTERMISSION');
      return;
    }

    if (next === 'DRAWING' || next === 'REVEALING' || next === 'READING') ensureCards();
    // Số lá đã tối đa (quà không thể thêm lá): bốc bài ngay khi mời khách để TTS có thêm thời gian chuẩn bị.
    // Bài chỉ hiện trên màn hình từ pha DRAWING.
    if (next === 'CALLING' && seat && seat.cardsPlanned >= config.maxCardsPerSession && config.drawOnCalling) ensureCards();
    if (next === 'REVEALING' || next === 'READING') cards = cards.map((c) => ({ ...c, revealed: true }));

    let durMs;
    // Pha có lời (chế độ sheet): kéo dài cho đủ nói hết câu, không cắt ngang (thêm speechBufferSec để nghỉ).
    const spoken = speech?.phases?.[next];
    const speechSec = spoken && spoken.lines.length ? spoken.durations.reduce((a, b) => a + b, 0) + (config.speechBufferSec ?? 1.2) : 0;
    if (next === 'READING') {
      const total = reading ? reading.totalSec : 0;
      // Có lời đọc thật (sheet): đọc trọn, không áp trần readingMaxSec. Cách cũ: giữ trần như trước.
      const cap = currentJob ? Infinity : config.readingMaxSec;
      const sec = Math.min(cap, Math.max(config.readingMinSec, total + config.readingBufferSec, speechSec));
      durMs = Math.round(sec * 1000);
      scheduleLock(durMs);
      requestThanks();
    } else {
      // speechLeadSec: chờ trước khi nói (vd. CALLING: đợi avatar bay vào bệ đá rồi mới chào) → pha dài thêm ngần ấy.
      const lead = spoken && spoken.lines.length ? Math.max(0, Number(config.speechLeadSec?.[next]) || 0) : 0;
      durMs = Math.round(Math.max(config.phaseSec[next] ?? 5, speechSec + lead) * 1000);
    }
    phaseEndsAt = now + durMs;
    const token = sessionToken;
    phaseTimer = clock.setTimeout(() => { if (token === sessionToken) advance(); }, durMs);
    emit(`phase:${next}`);
  }

  // Khóa người kế tiếp khi phiên hiện tại còn <= lockBeforeEndSec (D2).
  function scheduleLock(readingMs) {
    if (lockTimer) clock.clearTimeout(lockTimer);
    const remainingAfterReadingStart = readingMs + (config.phaseSec.FAREWELL ?? 5) * 1000;
    const lockAt = Math.max(0, remainingAfterReadingStart - config.lockBeforeEndSec * 1000);
    const token = sessionToken;
    lockTimer = clock.setTimeout(() => {
      if (token !== sessionToken) return;
      if (queue.size() > 0 && !queue.getLockedId()) {
        const next = queue.lockNext();
        prepareFor(next);   // chọn sẵn lượt bốc + tạo giọng đọc trước khi khách lên ghế
        if (next) startWelcome(next);   // tạo sẵn giọng câu "… chuẩn bị vào phòng xem bài nha" cho lúc đếm ngược
        emit('lock');
      }
    }, lockAt);
  }

  function advance() {
    const list = phases();
    const i = list.indexOf(phase);
    const next = list[i + 1];
    if (next === 'READING' && shouldWaitTts()) { waitForTts(); return; }
    if (next) enter(next);
    else finishSession();
  }

  function finishSession() {
    clearTimers();
    const now = clock.now();
    if (pendingBreak && seat?.breakId === pendingBreak.id) pendingBreak.done += 1;   // khách bắt đầu sau lúc lên lịch: tính
    if (cards.length) {
      recent.push(cards.map((c) => c.id));
      recent = recent.slice(-config.recentSessionsNoRepeat);
    }
    if (config.requeueAfterSession) queue.requeueSeat(now, config.idleAfterSec * 1000);
    queue.endSeat(now);
    onEvent('session.end', { viewerId: seat?.viewerId });
    sessionToken += 1;
    if (seat) jobs.delete(seat.viewerId);
    seat = null; cards = []; reading = null; prepared = null; speech = null; currentJob = null;
    if (breakDue()) { enter('BREAK'); return; }
    continueAfterSeat();
  }

  /** Sau phiên (hoặc phiên nghỉ): gọi khách kế tiếp (có đếm ngược) hoặc về IDLE. */
  function continueAfterSeat() {
    if (enabled && queue.size() > 0) {
      if (intermissionSec() > 0) enter('INTERMISSION');
      else beginSession();
    } else enter('IDLE');
  }

  /** Đã đến lúc phát phiên nghỉ chưa (đủ số khách đã đọc xong kể từ lúc lên lịch). */
  const breakDue = () => !!(enabled && pendingBreak && pendingBreak.done >= pendingBreak.after);

  function endBreak() {
    clearTimers();
    onEvent('break.end', { id: pendingBreak?.id });
    pendingBreak = null; speech = null;
    sessionToken += 1;
    continueAfterSeat();
  }

  /** Tạo giọng cho đoạn phiên nghỉ ngay khi lên lịch (thường xong từ lâu trước lúc phát). */
  function prepareBreakTts(b) {
    if (!tts || !config.ttsEnabled) { b.tts.status = 'none'; return; }
    Promise.resolve().then(() => tts.prepare(b.lines)).then((res) => {
      if (pendingBreak !== b) return;
      if (res) Object.assign(b.tts, { status: 'ready', urls: res.urls, durations: res.durations });
      else b.tts.status = 'failed';
      emit('break-tts');
    }).catch(() => { if (pendingBreak === b) { b.tts.status = 'failed'; emit('break-tts'); } });
  }

  const breakInfo = () => (pendingBreak ? {
    id: pendingBreak.id, lines: pendingBreak.lines, after: pendingBreak.after, done: pendingBreak.done,
    scheduledAt: pendingBreak.scheduledAt, ttsStatus: pendingBreak.tts.status, playing: phase === 'BREAK'
  } : null);

  // Chào người đầu tiên ngay khi họ vào (tạo giọng song song), nói "chuẩn bị ngồi vào ghế" trước khi mời ngồi.
  function startWelcome(head) {
    if (welcome && welcome.viewerId === head.viewerId) return;
    const line = scripts?.welcome ? scripts.welcome(head) : null;
    if (!line) { welcome = null; return; }
    const w = { viewerId: head.viewerId, name: head.name, line, at: clock.now(), ttsUrls: [], durations: [], ready: false };
    welcome = w;
    if (tts && config.ttsEnabled) {
      Promise.resolve().then(() => tts.prepare([line])).then((res) => {
        if (welcome !== w || !res) return;
        w.ttsUrls = res.urls; w.durations = res.durations; w.ready = true;
        emit('welcome-ready');
      }).catch(() => {});
    }
  }

  function beginSession() {
    welcome = null;
    const e = queue.popNext();
    if (!e) { enter('IDLE'); return; }
    sessionToken += 1;
    seat = {
      viewerId: e.viewerId, name: e.name, avatar: e.avatar, since: clock.now(),
      topic: e.topic || 'general', lane: e.lane,
      cardsPlanned: Math.min(config.maxCardsPerSession, config.defaultCards), bonusUsed: false,
      breakId: pendingBreak ? pendingBreak.id : null
    };
    cards = []; reading = null; speech = null; currentJob = null;
    const job = prepareFor(e);
    if (job) {
      if (!job.reservation.custom) scripts.picker.take(e.viewerId, job.want);   // dòng sheet đã dùng: bỏ đặt chỗ (phiên riêng không dùng sheet)
      currentJob = job;
      const sc = job.script;
      Object.assign(seat, { sessionType: sc.sessionType, topic: sc.topic, topicLabel: sc.topicLabel, cardsPlanned: sc.cards.length, sheetRow: sc.sheetRow, bonusUsed: true });
      cards = sc.cards.map((c) => ({ ...c }));
      applyJob(job);
    }
    onEvent('session.start', { viewerId: e.viewerId, sessionType: seat.sessionType || null, topic: seat.topic });
    enter('CALLING');
  }

  return {
    /** Gọi sau mỗi lần có người vào hàng: nếu đang rảnh thì bắt đầu phiên. */
    kick() {
      // Phòng đang rảnh mà phiên nghỉ đã đến lượt (vd. "ngay", hoặc hết khách): phát luôn.
      if (phase === 'IDLE' && breakDue()) {
        if (graceTimer) { clock.clearTimeout(graceTimer); graceTimer = null; }
        enter('BREAK');
        return;
      }
      if (enabled && phase === 'IDLE' && queue.size() > 0) {
        // Người đầu tiên vào lúc đang rảnh: chờ firstJoinGraceSec giây để xem họ (hoặc ai đó) có tặng quà không.
        // Có người ở làn quà thì không cần chờ.
        const head = queue.snapshot(1).queue[0];
        const graceMs = Math.round((config.firstJoinGraceSec || 0) * 1000);
        const waitMs = head && head.lane !== 'gift' ? head.joinedAt + graceMs - clock.now() : 0;
        if (waitMs > 0) {
          startWelcome(head);
          if (!graceTimer) graceTimer = clock.setTimeout(() => { graceTimer = null; this.kick(); }, waitMs);
          emit('queue');
          return;
        }
        if (graceTimer) { clock.clearTimeout(graceTimer); graceTimer = null; }
        // Có đếm ngược chuyển khách (INTERMISSION > 0) thì người đầu tiên cũng được đếm ngược trước khi vào bệ.
        if (intermissionSec() > 0) enter('INTERMISSION');
        else beginSession();
      } else emit('queue');
    },

    start() { enabled = true; this.kick(); },
    stop() { enabled = false; emit('stopped'); },
    isEnabled: () => enabled,

    /** Quà lớn khi đang ngồi ghế: thêm lá bài, chỉ khi chưa rút (D4/D9), tối đa 1 lần mỗi phiên. */
    onSeatGift(viewerId, coins) {
      if (!seat || seat.viewerId !== String(viewerId)) return { ok: false, reason: 'not_seated' };
      if (coins < config.bigGiftCoins) return { ok: false, reason: 'small_gift' };
      if (seat.bonusUsed) return { ok: false, reason: 'already_bonus' };
      if (!['CALLING', 'SHUFFLING'].includes(phase)) return { ok: false, reason: 'too_late' };
      seat.bonusUsed = true;
      seat.cardsPlanned = Math.min(config.maxCardsPerSession, seat.cardsPlanned + config.bonusCardsOnBigGift);
      emit('bonus-card');
      return { ok: true, cardsPlanned: seat.cardsPlanned };
    },

    /**
     * (admin) Lên lịch phiên nghỉ: nữ tư tế nói `lines` sau khi đọc xong cho `after` khách nữa (0 = ngay sau phiên đang đọc,
     * hoặc ngay lập tức nếu phòng đang rảnh). Chỉ một phiên nghỉ chờ tại một lúc: lên lịch mới thay cái cũ.
     */
    scheduleBreak({ lines, after = 2 }) {
      if (phase === 'BREAK') throw new Error('Phiên nghỉ đang phát, chờ xong rồi lên lịch tiếp');
      const list = (lines || []).map((l) => String(l).trim()).filter(Boolean);
      if (!list.length) throw new Error('Chưa có lời cho phiên nghỉ');
      pendingBreak = { id: ++breakSeq, lines: list, after: Math.max(0, Math.min(10, Math.floor(Number(after) || 0))), done: 0, scheduledAt: clock.now(), tts: { status: 'pending', urls: [], durations: [] } };
      prepareBreakTts(pendingBreak);
      emit('break-scheduled');
      this.kick();
      return breakInfo();
    },

    /** (admin) Hủy phiên nghỉ đang chờ; nếu đang phát thì dừng và gọi khách tiếp. */
    cancelBreak() {
      if (!pendingBreak) return { ok: false, reason: 'no_break' };
      if (phase === 'BREAK') endBreak();
      else { pendingBreak = null; emit('break-cancel'); }
      return { ok: true };
    },

    breakInfo,

    /** (admin) kết thúc phiên hiện tại ngay. */
    skip() {
      if (!seat) return { ok: false, reason: 'no_session' };
      finishSession();
      return { ok: true };
    },

    /** Khôi phục sau khởi động lại: người đang ngồi (nếu có) về đầu hàng, pha về IDLE. */
    restore(saved) {
      queue.importState(saved?.queue);
      if (saved?.seat && saved.seat.viewerId && !queue.has(saved.seat.viewerId)) {
        queue.requeueFront({
          viewerId: saved.seat.viewerId, name: saved.seat.name, avatar: saved.seat.avatar || '',
          lane: saved.seat.lane || 'free', topic: saved.seat.topic || 'general', joinedAt: 0, boost: 0
        });
      }
      recent = Array.isArray(saved?.recent) ? saved.recent.slice(-config.recentSessionsNoRepeat) : [];
      enabled = saved?.enabled !== false;
      if (scripts?.picker && saved?.readings) scripts.picker.importState(saved.readings);
      phase = 'IDLE'; phaseStartedAt = clock.now(); phaseEndsAt = null;
      seat = null; cards = []; reading = null; speech = null; currentJob = null;
      const pb = saved?.pendingBreak;
      if (pb && Array.isArray(pb.lines) && pb.lines.length) {
        pendingBreak = { id: ++breakSeq, lines: pb.lines.map(String), after: Number(pb.after) || 0, done: Number(pb.done) || 0, scheduledAt: clock.now(), tts: { status: 'pending', urls: [], durations: [] } };
        prepareBreakTts(pendingBreak);
      }
    },

    exportState() {
      return { queue: queue.exportState(), seat: seat ? { ...seat } : null, recent, enabled, readings: scripts?.picker ? scripts.picker.exportState() : undefined,
        pendingBreak: pendingBreak ? { lines: pendingBreak.lines, after: pendingBreak.after, done: pendingBreak.done } : null };
    },

    /** Khách rời hàng trước khi lên ghế: trả lại dòng sheet đã giữ. */
    release(viewerId) {
      jobs.delete(String(viewerId));
      return scripts?.picker ? scripts.picker.release(viewerId) : false;
    },

    /** Khách đã được chuẩn bị trước vừa tặng thêm quà (có thể đổi làn/chủ đề): chuẩn bị lại nếu cần. */
    refreshPrepared(entry) {
      if (entry && jobs.has(String(entry.viewerId)) && (!seat || seat.viewerId !== String(entry.viewerId))) prepareFor(entry);
    },

    /**
     * Kế hoạch trả lời của một khách (trang admin): đang ngồi → kịch bản đang đọc; đã giữ bài → kịch bản đã chuẩn bị;
     * còn lại → xem trước dòng sheet kế tiếp (chưa giữ, có thể đổi nếu người khác tới lượt trước).
     */
    planOf(entry) {
      if (!entry) return null;
      const id = String(entry.viewerId);
      if (seat && seat.viewerId === id) return currentJob ? { source: 'seated', custom: !!currentJob.reservation.custom, want: currentJob.want, reservation: currentJob.reservation, script: currentJob.script } : { source: 'seated' };
      const job = jobs.get(id);
      if (job) return { source: job.reservation.custom ? 'custom' : 'reserved', want: job.want, reservation: job.reservation, script: job.script };
      if (!sheetMode()) return { source: 'none' };
      const want = wantFor(entry);
      return { source: 'preview', want, reservation: scripts.picker.preview(want) };
    },

    /** (admin) Giữ bài ngay cho khách trong hàng và dựng lại kịch bản (vd. vừa sửa câu hỏi / lời giải riêng). */
    prepareNow(entry) {
      if (!entry || (seat && seat.viewerId === String(entry.viewerId))) return null;
      jobs.delete(String(entry.viewerId));   // lượt bốc trong picker vẫn giữ nguyên (cùng chủ đề) → cùng bộ lá
      return prepareFor(entry);
    },

    getState() {
      const q = queue.snapshot();
      return {
        version,
        serverTime: clock.now(),
        enabled,
        phase,
        phaseStartedAt,
        phaseEndsAt,
        seat: seat ? {
          viewerId: seat.viewerId, name: seat.name, avatar: seat.avatar, since: seat.since, topic: seat.topic, cardsPlanned: seat.cardsPlanned,
          sessionType: seat.sessionType || null, topicLabel: seat.topicLabel || null, lane: seat.lane
        } : null,
        cards,
        reading: currentJob || (reading && ['READING', 'FAREWELL'].includes(phase)) ? reading : (reading ? { totalSec: reading.totalSec, lines: [], ttsUrls: [], durations: [], ready: reading.ready } : null),
        speech,
        welcome: welcome && (phase === 'IDLE' || phase === 'INTERMISSION') && queue.size() > 0 ? { ...welcome } : null,
        break: breakInfo(),
        queue: q.queue,
        queueMore: q.queueMore,
        queueTotal: q.queueTotal,
        config: { sessionTargetSec: config.sessionTargetSec, queueVisible: config.queueVisible, speechLeadSec: config.speechLeadSec || {} }
      };
    },

    /** Phát lại trạng thái (khi hàng chờ đổi ngoài máy trạng thái). */
    touch(reason = 'touch') { emit(reason); },
    getPhase: () => phase,
    getSeat: () => seat,
    getVersion: () => version
  };
}

module.exports = { createSession, ALL_PHASES };
