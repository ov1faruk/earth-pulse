// Parse CelesTrak 3-line TLE text into { name, line1, line2, norad }.
export function parseTle(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length - 2; i++) {
    if (lines[i + 1]?.startsWith('1 ') && lines[i + 2]?.startsWith('2 ')) {
      out.push({ name: lines[i].trim(), line1: lines[i + 1], line2: lines[i + 2], norad: Number(lines[i + 1].slice(2, 7)) });
      i += 2;
    }
  }
  return out;
}
