// Oppsummering og titler med en liten språkmodell som kjører i nettleseren (WebLLM).
// Ingen innlogging, ingen nøkler, og teksten sendes ikke noe sted.
// Modellen er på ca. 1 GB og lastes bare ned når du slår funksjonen på.

import { splitText, cleanAITitle, cleanAISummary } from './text.js';

const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';
const MODEL_F16 = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
const MODEL_F32 = 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC';
export const AI_SIZE = 'ca. 1 GB';
const CHUNK = 3500;

const INSTRUCTIONS =
  'Du hjelper med notater fra et intervju eller en samtale som er tatt opp og gjort om til tekst automatisk. ' +
  'Skriv alltid på norsk bokmål. Teksten kan inneholde hørefeil. Ikke finn på noe som ikke står i teksten. ' +
  'Når teksten bruker Person 1, Person 2 og så videre, bruk de samme betegnelsene.';

let enginePromise = null;

/** null når AI kan brukes på denne enheten, ellers en forklaring. */
export async function aiUnavailableReason() {
  if (!('gpu' in navigator)) {
    return 'Oppsummering krever WebGPU. Bruk Chrome eller Edge på datamaskin, eller Safari på iPhone med iOS 26 eller nyere.';
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return 'Nettleseren fant ikke et grafikkort den kan bruke til AI.';
  } catch {
    return 'Nettleseren fant ikke et grafikkort den kan bruke til AI.';
  }
  return null;
}

async function engine(onProgress) {
  if (!enginePromise) {
    enginePromise = (async () => {
      const adapter = await navigator.gpu.requestAdapter();
      const model = adapter?.features.has('shader-f16') ? MODEL_F16 : MODEL_F32;
      const webllm = await import(WEBLLM_URL);
      return webllm.CreateMLCEngine(model, {
        initProgressCallback: (report) => onProgress?.(report.progress ?? 0, report.text),
      });
    })();
    enginePromise.catch(() => { enginePromise = null; });
  }
  return enginePromise;
}

/** Laster ned modellen på forhånd, med fremdrift (0 til 1). */
export async function prepareAI(onProgress) {
  await engine(onProgress);
}

async function ask(prompt, onProgress) {
  const llm = await engine(onProgress);
  const reply = await llm.chat.completions.create({
    messages: [
      { role: 'system', content: INSTRUCTIONS },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 500,
  });
  return (reply.choices?.[0]?.message?.content || '').trim();
}

export async function summarize(transcript, onProgress) {
  let chunks = splitText(transcript, CHUNK);
  let material = transcript;
  let isNotes = false;

  // Lange samtaler: stikkord for hver bit først, så oppsummering av stikkordene
  for (let round = 0; chunks.length > 1 && round < 3; round++) {
    const notes = [];
    for (const chunk of chunks) {
      notes.push(await ask(
        'Skriv 3 til 6 korte stikkord om hva som blir sagt i denne delen av samtalen. ' +
        `Svar bare med stikkordene, hvert på egen linje med «- » foran.\n\nTekst:\n${chunk}`,
        onProgress,
      ));
    }
    material = notes.join('\n');
    isNotes = true;
    chunks = splitText(material, CHUNK);
  }
  if (chunks.length > 1) material = chunks[0];

  const summary = cleanAISummary(await ask(
    'Skriv en oppsummering av samtalen under. Start med et kort avsnitt på 3 til 5 setninger om hva samtalen handler om. ' +
    'Skriv deretter de viktigste punktene, hvert på egen linje med «- » foran. Ikke bruk overskrifter eller fet skrift.\n\n' +
    `${isNotes ? 'Stikkord fra samtalen' : 'Samtalen'}:\n${material}`,
    onProgress,
  ));
  const title = cleanAITitle(await ask(
    'Lag en kort og beskrivende tittel på norsk, på høyst 6 ord, for samtalen som er oppsummert under. ' +
    `Svar bare med tittelen, uten anførselstegn og uten punktum.\n\n${summary}`,
    onProgress,
  ));
  return { title, summary };
}
