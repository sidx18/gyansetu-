
const BANNED_WORDS = [
  'abuse', 'stupid', 'idiot', 'hate', 'trash', 'dumb', 'kill', 'die', 'shut up',
  'hell', 'damn', 'crap', 'garbage', 'worst'
  // In a production app, this would be a much more comprehensive and externalized list
];

/**
 * Replaces banned words with asterisks while maintaining string length.
 */
export function filterContent(text: string): string {
  let filtered = text;
  const regex = new RegExp(`\\b(${BANNED_WORDS.join('|')})\\b`, 'gi');
  
  return filtered.replace(regex, (match) => {
    return '*'.repeat(match.length);
  });
}

/**
 * Checks if content contains excessive repetition or spam-like patterns.
 */
export function isSpam(text: string): boolean {
  if (text.length > 500) return true; // Max length
  const repeatedCharRegex = /(.)\1{5,}/; // Same character more than 5 times
  return repeatedCharRegex.test(text);
}
