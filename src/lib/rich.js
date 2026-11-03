// Turns the coach's light markdown into simple blocks. Text only, so nothing it says can run as code.
export const parseInline = (line) => {
  const out = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0; let m;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ t: line.slice(last, m.index) });
    out.push({ t: m[1], b: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ t: line.slice(last) });
  return out;
};
export const parseRich = (text) => {
  const blocks = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const num = /^(\d+)[.)]\s+(.*)$/.exec(line);
    const head = /^#{1,6}\s+(.*)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last?.type === 'ul') last.items.push(parseInline(bullet[1])); else blocks.push({ type: 'ul', items: [parseInline(bullet[1])] });
    } else if (num) {
      if (last?.type === 'ol') last.items.push(parseInline(num[2])); else blocks.push({ type: 'ol', items: [parseInline(num[2])] });
    } else if (head) {
      blocks.push({ type: 'h', parts: parseInline(head[1].replace(/\*\*/g, '')) });
    } else {
      blocks.push({ type: 'p', parts: parseInline(line) });
    }
  }
  return blocks;
};
