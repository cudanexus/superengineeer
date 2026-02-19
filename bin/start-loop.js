#!/usr/bin/env node

/**
 * Runs build-and-start in a loop for development.
 * When the server exits (e.g., via Development > Shutdown), it rebuilds and restarts.
 * Press Ctrl+C twice quickly to fully exit.
 *
 * Generates login credentials once at startup and passes them to child processes
 * via CLAUDITO_USERNAME and CLAUDITO_PASSWORD environment variables.
 */

const { spawn } = require('child_process');
const { randomBytes } = require('crypto');
const path = require('path');
const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

let lastCtrlCTime = 0;
let lastServerExitTime = 0;
let isExiting = false;

// Word lists for username generation (must match src/utils/word-lists.ts)
const ADJECTIVES = [
  'brave', 'bright', 'calm', 'clever', 'cool', 'dapper', 'eager', 'fancy',
  'fluffy', 'gentle', 'golden', 'happy', 'humble', 'jolly', 'keen', 'kind',
  'lively', 'lucky', 'merry', 'mighty', 'nice', 'noble', 'proud', 'quick',
  'quiet', 'rapid', 'ready', 'royal', 'sharp', 'shiny', 'silent', 'silly',
  'sleek', 'smart', 'smooth', 'snappy', 'speedy', 'steady', 'swift', 'tender',
  'trusty', 'vivid', 'warm', 'wild', 'wise', 'witty', 'zesty', 'zippy'
];

const NOUNS = [
  'badger', 'bear', 'cobra', 'condor', 'coyote', 'crane', 'dolphin', 'dragon',
  'eagle', 'falcon', 'fox', 'gecko', 'hawk', 'heron', 'jaguar', 'koala',
  'leopard', 'lion', 'lynx', 'manta', 'otter', 'owl', 'panda', 'panther',
  'parrot', 'pelican', 'phoenix', 'python', 'raven', 'salmon', 'shark', 'sparrow',
  'sphinx', 'squid', 'swan', 'tiger', 'toucan', 'turtle', 'viper', 'walrus',
  'whale', 'wolf', 'wombat', 'zebra', 'osprey', 'puma', 'raptor', 'mantis'
];

function generateUsername() {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adjective}-${noun}`;
}

function generatePassword() {
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const symbols = '!@#$%&*';
  const allChars = lowercase + uppercase + numbers + symbols;
  const bytes = randomBytes(26);

  // Ensure at least one char from each class
  const required = [
    lowercase[bytes[0] % lowercase.length],
    uppercase[bytes[1] % uppercase.length],
    numbers[bytes[2] % numbers.length],
    symbols[bytes[3] % symbols.length]
  ];

  // Fill remaining with random from all chars
  const remaining = [];

  for (let i = 4; i < 16; i++) {
    remaining.push(allChars[bytes[i] % allChars.length]);
  }

  // Combine and shuffle using Fisher-Yates
  const combined = [...required, ...remaining];

  for (let i = combined.length - 1; i > 0; i--) {
    const j = bytes[i + 4] % (i + 1);
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }

  return combined.join('');
}

function run() {
  console.log('\n=== Starting build and run cycle ===\n');

  // Build command string to avoid DEP0190 deprecation warning
  const command = `${npm} run build-and-start`;
  const child = spawn(command, [], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
    }
  });

  child.on('exit', (code) => {
    if (isExiting) {
      process.exit(code || 0);
    }

    const now = Date.now();

    // Only exit on quick successive server exits (not from Ctrl+C)
    if (now - lastServerExitTime < 2000) {
      console.log('\n=== Quick restart detected (server crashed?), exiting loop ===\n');
      process.exit(code || 0);
    }

    lastServerExitTime = now;
    console.log(`\n=== Server exited with code ${code}, restarting in 1 second... ===\n`);
    setTimeout(run, 1000);
  });

  child.on('error', (err) => {
    console.error('Failed to start process:', err.message);
    setTimeout(run, 2000);
  });
}

process.on('SIGINT', () => {
  const now = Date.now();

  if (now - lastCtrlCTime < 2000) {
    console.log('\n=== Exiting loop ===\n');
    isExiting = true;
    process.exit(0);
  }

  lastCtrlCTime = now;
  console.log('\n=== Press Ctrl+C again within 2 seconds to exit loop ===\n');
});

console.log('Starting build-and-start loop (Ctrl+C twice to exit)...');
run();
