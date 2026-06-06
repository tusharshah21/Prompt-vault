export function computeSpecificity(prompt: string): number {
  let score = 0;
  if (prompt.length > 100) score += 20;
  if (prompt.length > 300) score += 10;
  if (/you are a/i.test(prompt)) score += 20;
  if (/never|do not|avoid|must not/i.test(prompt)) score += 15;
  if (/respond in|format:|output:/i.test(prompt)) score += 20;
  if (/example:|for instance|e\.g\./i.test(prompt)) score += 15;
  return Math.min(score, 100);
}

export function computeComplexity(prompt: string): number {
  const words = prompt.split(' ').length;
  const uniqueWords = new Set(prompt.toLowerCase().split(' ')).size;
  const vocabularyRichness = uniqueWords / words;
  const sentences = prompt.split(/[.!?]/).length;
  const avgSentenceLength = words / sentences;
  return Math.min(
    Math.round((vocabularyRichness * 50) + (Math.min(avgSentenceLength, 20) / 20 * 50)),
    100
  );
}

export function computeConfidence(
  specificity: number,
  avgRating: number,       // 1–5 stars (pass 0 if no ratings yet)
  sellerAvgRating: number  // 1–5 stars (pass 0 if no data)
): number {
  return Math.round(
    (specificity * 0.4) +
    ((avgRating / 5 * 100) * 0.4) +
    ((sellerAvgRating / 5 * 100) * 0.2)
  );
}

export function getStructureBadges(prompt: string): string[] {
  const badges: string[] = [];
  if (/you are a/i.test(prompt)) badges.push('Has role definition');
  if (/never|do not|avoid|must not/i.test(prompt)) badges.push('Has constraints');
  if (/respond in|format:|output:/i.test(prompt)) badges.push('Output format specified');
  if (/example:|for instance|e\.g\./i.test(prompt)) badges.push('Has examples');
  return badges;
}

// Converts badge list to a uint8 bitmask for on-chain storage.
// bit0=role, bit1=constraints, bit2=format, bit3=examples
export function getStructureBadgesMask(prompt: string): number {
  let mask = 0;
  if (/you are a/i.test(prompt)) mask |= 1;
  if (/never|do not|avoid|must not/i.test(prompt)) mask |= 2;
  if (/respond in|format:|output:/i.test(prompt)) mask |= 4;
  if (/example:|for instance|e\.g\./i.test(prompt)) mask |= 8;
  return mask;
}

export function maskToBadges(mask: number): string[] {
  const badges: string[] = [];
  if (mask & 1) badges.push('Has role definition');
  if (mask & 2) badges.push('Has constraints');
  if (mask & 4) badges.push('Output format specified');
  if (mask & 8) badges.push('Has examples');
  return badges;
}
