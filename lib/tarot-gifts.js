'use strict';
// Quà → chủ đề phiên bói (data/tarot/gift-topics.json). Khớp giftId trước, sau đó tên quà (regex 'match').
// Quà không có luật → defaultTopic, kèm cờ `unmapped` để ghi log.

function createGiftTopics(cfg = {}) {
  const topics = cfg.topics || {};
  const defaultTopic = cfg.defaultTopic || 'overview';
  const rules = (cfg.gifts || []).map((g) => {
    let re = null;
    try { re = g.match ? new RegExp(g.match, 'i') : null; } catch (_) { re = null; }
    return { ...g, re };
  });

  function topicFor({ giftId = null, giftName = '' } = {}) {
    const id = giftId === null || giftId === undefined || giftId === '' ? null : String(giftId);
    let rule = id ? rules.find((r) => r.giftId !== null && r.giftId !== undefined && String(r.giftId) === id) : null;
    const name = String(giftName || '').trim();
    if (!rule && name) rule = rules.find((r) => (r.re && r.re.test(name)) || (r.name && r.name.toLowerCase() === name.toLowerCase()));
    const topic = rule?.topic || defaultTopic;
    return { topic, label: topics[topic] || topic, rule: rule || null, unmapped: !rule };
  }

  return {
    topicFor,
    label: (topic) => topics[topic] || topic,
    defaultTopic,
    /** Dữ liệu cột quà cho màn live: thứ tự slot, nhãn chủ đề. */
    menu: () => rules.slice().sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99))
      .map((r) => ({ slot: r.slot, name: r.name, coins: r.coins ?? null, topic: r.topic || null, label: r.topic ? (topics[r.topic] || r.topic) : (cfg.unassignedLabel || 'Sắp có') }))
  };
}

module.exports = { createGiftTopics };
