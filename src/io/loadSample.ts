import { readBomFile } from './readFile';
import type { LoadedFile } from './readFile';

async function fetchSample(fileName: string): Promise<LoadedFile> {
  // Relative to the page so the static build works under any base path.
  const res = await fetch(`./samples/${fileName}`);
  if (!res.ok) throw new Error(`Could not load sample ${fileName} (HTTP ${res.status}).`);
  const blob = await res.blob();
  return readBomFile(new File([blob], fileName));
}

export async function loadSamples(): Promise<{ a: LoadedFile; b: LoadedFile }> {
  const [a, b] = await Promise.all([
    fetchSample('sample_version_A.csv'),
    fetchSample('sample_version_B.csv'),
  ]);
  return { a, b };
}
