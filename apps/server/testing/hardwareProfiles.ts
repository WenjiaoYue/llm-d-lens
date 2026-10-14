import fs from 'node:fs';
import { loadHardwareProfiles } from '../src/services/hardwareProfiles.ts';

export const profiles = ['intel_xpu', 'nvidia'].map(name => JSON.parse(fs.readFileSync(new URL(`../../backend/src/llm_d_lens/hardware/profiles/${name}.json`, import.meta.url), 'utf8')));
export async function seedHardwareProfiles() {
    const previous = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ profiles }));
    try { await loadHardwareProfiles(); } finally { globalThis.fetch = previous; }
}
