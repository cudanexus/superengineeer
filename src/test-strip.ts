import { stripProtectedSection } from './constants/claude-workflow';
import fs from 'fs';

const content = fs.readFileSync('/home/syed/Pictures/CLAUDE.md', 'utf-8');
console.log("Original starts with:", JSON.stringify(content.substring(0, 100)));
console.log("Stript result wasProtected:", stripProtectedSection(content).wasProtected);
