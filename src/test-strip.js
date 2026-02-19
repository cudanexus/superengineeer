"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var claude_workflow_1 = require("./constants/claude-workflow");
var fs_1 = require("fs");
var content = fs_1.default.readFileSync('/home/syed/Pictures/CLAUDE.md', 'utf-8');
console.log("Original starts with:", JSON.stringify(content.substring(0, 100)));
console.log("Stript result wasProtected:", (0, claude_workflow_1.stripProtectedSection)(content).wasProtected);
