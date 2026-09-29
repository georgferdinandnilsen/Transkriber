// Tekst, filnavn og personer. Brukes både i appen og i transkriberings-workeren.

export const AUTHOR = 'Georg Ferdinand Nilsen';
export const EMAIL = 'georgferdinandnilsen@gmail.com';
export const SUMMARY_SUFFIX = ' - oppsummering.txt';

const pad = (n) => String(n).padStart(2, '0');

/** «2026-09-29 14.41» til filnavn. Kolon og skråstrek kan ikke brukes i filnavn. */
export function stamp(time) {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

/** «29.09.2026 kl. 14.41» til visning */
export function displayDate(time) {
  const d = new Date(time);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} kl. ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

/** 01:23, eller 1:02:03 når det går over en time */
export function clock(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function cleanTitle(title) {
  let text = String(title || '')
    .replace(/[\/\\]/g, '-')
    .replace(/:/g, ' -')
    .replace(/[<>"|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  if (text.length > 80) text = text.slice(0, 80).trim();
  return text || 'Uten tittel';
}

export function baseName(time, title) {
  return `${stamp(time)} ${cleanTitle(title)}`;
}

// MARK: Falske linjer fra Whisper

// Whisper er delvis trent på teksting fra NRK og YouTube, og legger av og til inn
// linjer som «Teksting av Nicolai Winther» der det er stille eller bare støy.
const SENTENCE_PATTERNS = [
  /[^.!?\n]*\bnicolai\s+winther\b[^.!?\n]*[.!?]?/gi,
  /[^.!?\n]*\bamara\.org\b[^.!?\n]*[.!?]?/gi,
  /\b(teksting|tekstet|undertekster|undertekst|norske tekster|oversatt|oversettelse)\s*(av|ved|:)\s*[^.!?\n]{0,40}\b(nrk|tv 2|tv2)\b[^.!?\n]*[.!?]?/gi,
];
const STANDALONE = new Set([
  'teksting', 'tekst', 'undertekster', 'undertekst', 'tekst nrk', 'teksting nrk',
  'norske tekster', 'takk for at du så på', 'takk for at dere så på',
  'takk for at du så', 'takk for at dere så', 'abonner på kanalen',
]);
const PREFIXES = [
  'teksting av', 'teksting ved', 'tekstet av', 'tekst av', 'undertekster av',
  'undertekst av', 'oversatt av', 'oversettelse av', 'norske tekster av',
];

export function cleanLine(text) {
  let result = String(text || '').replace(/<\|[^|>]*\|>/g, '');
  for (const pattern of SENTENCE_PATTERNS) result = result.replace(pattern, '');
  return result.replace(/\s+/g, ' ').trim();
}

export function isFake(text) {
  const normalized = cleanLine(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return true;
  if (STANDALONE.has(normalized)) return true;
  return normalized.split(' ').length <= 8 && PREFIXES.some((p) => normalized.startsWith(p));
}

// MARK: Personer

// pyannote-segmentation-3.0 gir sju klasser: ingen, person A, B, C og overlapp mellom to av dem.
const POWERSET = { 1: [0], 2: [1], 3: [2], 4: [0, 1], 5: [0, 2], 6: [1, 2] };

/** Gjør om rå resultat fra pyannote til tidsrom per person. */
export function turnsFromDiarization(segments) {
  const turns = [];
  for (const seg of segments || []) {
    const speakers = POWERSET[seg.id];
    if (!speakers) continue;
    for (const speaker of speakers) {
      turns.push({ start: seg.start, end: seg.end, speaker, weight: 1 / speakers.length });
    }
  }
  return turns;
}

function speakerFor(start, end, turns) {
  const overlap = new Map();
  for (const t of turns) {
    const shared = Math.min(end, t.end) - Math.max(start, t.start);
    if (shared > 0) overlap.set(t.speaker, (overlap.get(t.speaker) || 0) + shared * t.weight);
  }
  if (overlap.size) return [...overlap.entries()].sort((a, b) => b[1] - a[1])[0][0];
  // Ingen snakker akkurat da: velg den nærmeste
  const middle = (start + end) / 2;
  let best = null;
  let bestDistance = Infinity;
  for (const t of turns) {
    const d = middle < t.start ? t.start - middle : middle > t.end ? middle - t.end : 0;
    if (d < bestDistance) { bestDistance = d; best = t.speaker; }
  }
  return best;
}

/**
 * Setter person på hver linje. `wanted` er -1 (finn ut selv) eller antall personer.
 * Personene nummereres 0, 1, 2 … i den rekkefølgen de først snakker.
 * Er det bare én person, fjernes navnene.
 */
export function assignSpeakers(lines, turns, wanted) {
  if (!turns.length) return lines.map((l) => ({ ...l, speaker: null }));
  let raw = lines.map((l) => ({ ...l, speaker: speakerFor(l.start, l.end, turns) }));

  // Færre personer enn funnet: slå sammen de som snakker minst med personen rett før
  if (wanted > 0) {
    const talk = new Map();
    for (const l of raw) talk.set(l.speaker, (talk.get(l.speaker) || 0) + (l.end - l.start));
    const keep = new Set([...talk.entries()].sort((a, b) => b[1] - a[1]).slice(0, wanted).map((e) => e[0]));
    let previous = null;
    raw = raw.map((l) => {
      const speaker = keep.has(l.speaker) ? l.speaker : previous ?? [...keep][0];
      previous = speaker;
      return { ...l, speaker };
    });
  }

  const mapping = new Map();
  let previous = null;
  const result = raw.map((l) => {
    let who = previous;
    if (l.speaker !== null && l.speaker !== undefined) {
      if (!mapping.has(l.speaker)) mapping.set(l.speaker, mapping.size);
      who = mapping.get(l.speaker);
    }
    if (who !== null) previous = who;
    return { ...l, speaker: who };
  });
  if (mapping.size < 2) return result.map((l) => ({ ...l, speaker: null }));
  const first = result.find((l) => l.speaker !== null)?.speaker ?? 0;
  return result.map((l) => (l.speaker === null ? { ...l, speaker: first } : l));
}

// MARK: Tekst til filer og skjerm

export function speakerCount(transcript) {
  if (!transcript) return 0;
  let max = -1;
  for (const l of transcript.lines) if (typeof l.speaker === 'number' && l.speaker > max) max = l.speaker;
  return max + 1;
}

export const defaultName = (i) => `Person ${i + 1}`;

export function speakerName(i, names) {
  const name = (names?.[i] || '').trim();
  return name || defaultName(i);
}

/** Linjen som pågikk da flagget ble satt, får 🚩 */
export function flaggedIndices(lines, flags) {
  if (!lines.length) return [];
  const result = new Set();
  for (const flag of flags || []) {
    let index = lines.findIndex((l) => l.end > flag);
    if (index < 0) index = lines.length - 1;
    result.add(index);
  }
  return [...result].sort((a, b) => a - b);
}

/** Ren tekst. Når flere snakker, får hver person et avsnitt med navnet på egen linje. */
export function renderText(transcript, names = []) {
  if (!transcript) return '';
  const flagged = new Set(transcript.flagged || []);
  const lines = transcript.lines.map((l, i) => ({ ...l, text: flagged.has(i) ? `🚩 ${l.text}` : l.text }));
  if (speakerCount(transcript) < 2) return lines.map((l) => l.text).join('\n');

  const paragraphs = [];
  let current = [];
  let who = null;
  const flush = () => {
    if (current.length) paragraphs.push(`${speakerName(who ?? 0, names)}:\n${current.join(' ')}`);
    current = [];
  };
  for (const l of lines) {
    if (l.speaker !== who) { flush(); who = l.speaker; }
    current.push(l.text);
  }
  flush();
  return paragraphs.join('\n\n');
}

/** Oppsummeringen lages med «Person 1», «Person 2» … og får navnene satt inn når den vises. */
export function renderSummary(summary, names, count) {
  let text = summary || '';
  for (let i = count - 1; i >= 0; i--) {
    const name = speakerName(i, names);
    const label = defaultName(i);
    if (name !== label) text = text.split(label).join(name);
  }
  return text;
}

export function summaryFile(title, time, summary) {
  return `${title}\n${displayDate(time)}\n\n${summary}\n`;
}

// MARK: Opprydding i AI-svar

export function cleanAITitle(raw) {
  const line = String(raw || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean) || '';
  let title = line
    .replace(/^(tittel|title)\s*:\s*/i, '')
    .replace(/^[«»"'*#`“”‘’ .]+|[«»"'*#`“”‘’ .]+$/g, '');
  if (title.length > 60) title = title.slice(0, 60).trim();
  return title;
}

export function cleanAISummary(raw) {
  return String(raw || '')
    .replace(/\*\*/g, '')
    .split(/\r?\n/)
    .map((line) => {
      let t = line.trim().replace(/^#+\s*/, '');
      if (t.startsWith('* ') || t.startsWith('• ')) t = `- ${t.slice(2)}`;
      return t;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    // Fjern en overskrift som «Oppsummering:» øverst
    .replace(/^(oppsummering|sammendrag|summary)\s*:?\s*\n+/i, '');
}

/** Deler lang tekst i biter som får plass i AI-modellens minne. */
export function splitText(text, limit) {
  const pieces = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    if (line.length <= limit) { pieces.push(line); continue; }
    let current = '';
    for (const word of line.split(' ')) {
      if (current.length + word.length + 1 > limit && current) { pieces.push(current); current = ''; }
      current += current ? ` ${word}` : word;
    }
    if (current) pieces.push(current);
  }
  const chunks = [];
  let current = '';
  for (const piece of pieces) {
    if (current.length + piece.length + 1 > limit && current) { chunks.push(current); current = ''; }
    current += current ? `\n${piece}` : piece;
  }
  if (current) chunks.push(current);
  return chunks;
}
