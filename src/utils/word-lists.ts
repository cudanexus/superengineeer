/**
 * Word lists for random username generation
 * Used for authentication - generates memorable usernames like "happy-tiger"
 */

export const ADJECTIVES = [
  'brave', 'bright', 'calm', 'clever', 'cool', 'dapper', 'eager', 'fancy',
  'fluffy', 'gentle', 'golden', 'happy', 'humble', 'jolly', 'keen', 'kind',
  'lively', 'lucky', 'merry', 'mighty', 'nice', 'noble', 'proud', 'quick',
  'quiet', 'rapid', 'ready', 'royal', 'sharp', 'shiny', 'silent', 'silly',
  'sleek', 'smart', 'smooth', 'snappy', 'speedy', 'steady', 'swift', 'tender',
  'trusty', 'vivid', 'warm', 'wild', 'wise', 'witty', 'zesty', 'zippy'
];

export const NOUNS = [
  'badger', 'bear', 'cobra', 'condor', 'coyote', 'crane', 'dolphin', 'dragon',
  'eagle', 'falcon', 'fox', 'gecko', 'hawk', 'heron', 'jaguar', 'koala',
  'leopard', 'lion', 'lynx', 'manta', 'otter', 'owl', 'panda', 'panther',
  'parrot', 'pelican', 'phoenix', 'python', 'raven', 'salmon', 'shark', 'sparrow',
  'sphinx', 'squid', 'swan', 'tiger', 'toucan', 'turtle', 'viper', 'walrus',
  'whale', 'wolf', 'wombat', 'zebra', 'osprey', 'puma', 'raptor', 'mantis'
];

/**
 * Generate a random username in adjective-noun format
 * Example: "happy-tiger", "clever-falcon"
 */
export function generateRandomUsername(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adjective}-${noun}`;
}
