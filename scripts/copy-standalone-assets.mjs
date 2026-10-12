import { cpSync, existsSync, mkdirSync } from 'node:fs';

const standaloneDirectory = '.next/standalone';
const standaloneNextDirectory = `${standaloneDirectory}/.next`;

mkdirSync(standaloneNextDirectory, { recursive: true });
cpSync('.next/static', `${standaloneNextDirectory}/static`, { recursive: true });

if (existsSync('public')) {
  cpSync('public', `${standaloneDirectory}/public`, { recursive: true });
}