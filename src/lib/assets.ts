export function publicAsset(path: string): string {
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  return `${import.meta.env.BASE_URL}${normalized}`;
}

export const PROVISIONAL_PATENT = {
  href: publicAsset('files/bump-provisional-patent.pdf'),
  applicationNumber: '63/686,176',
  title: 'United States Provisional Patent Application',
} as const;

export const RESEARCH_POSTER = {
  src: publicAsset('research/bump-research-poster.png'),
  alt: 'BUMP research poster: A Novel Atropine Pump for Patients with Crashing Bradycardia via Continuous BPM Monitoring',
  peerefUrl:
    'https://www.peeref.com/posters/10753/bump-a-novel-atropine-pump-for-patients-with-crashing-bradycardia-via-continuous-bpm-monitoring',
  title:
    'BUMP: A Novel Atropine Pump for Patients with Crashing Bradycardia via Continuous BPM Monitoring',
} as const;
