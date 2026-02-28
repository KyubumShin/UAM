#!/usr/bin/env node
/**
 * UAM Keyword Detector Hook (UserPromptSubmit)
 * Detects "uam" keyword in user input and initializes UAM pipeline state.
 *
 * Based on: design doc section 9.2 hook 4 + OMC keyword-detector.mjs pattern
 *
 * When "uam" is detected:
 * 1. Initialize .uam/state.json with default state
 * 2. Return [MAGIC KEYWORD: UAM] message to trigger UAM skill
 */

import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import shared UAM state utility
const { initState, isUamActive } = await import(
  pathToFileURL(join(__dirname, 'lib', 'uam-state.mjs')).href
);

// Import shared stdin reader
const { readStdin } = await import(
  pathToFileURL(join(__dirname, 'lib', 'stdin.mjs')).href
).catch(() => {
  return {
    readStdin: () => new Promise((resolve) => {
      const chunks = [];
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) { settled = true; process.stdin.removeAllListeners(); process.stdin.destroy(); resolve(Buffer.concat(chunks).toString('utf-8')); }
      }, 5000);
      process.stdin.on('data', (chunk) => chunks.push(chunk));
      process.stdin.on('end', () => { if (!settled) { settled = true; clearTimeout(timeout); resolve(Buffer.concat(chunks).toString('utf-8')); } });
      process.stdin.on('error', () => { if (!settled) { settled = true; clearTimeout(timeout); resolve(''); } });
      if (process.stdin.readableEnded) { if (!settled) { settled = true; clearTimeout(timeout); resolve(Buffer.concat(chunks).toString('utf-8')); } }
    })
  };
});

/**
 * Extract prompt text from hook input JSON
 */
function extractPrompt(input) {
  try {
    const data = JSON.parse(input);
    if (data.prompt) return data.prompt;
    if (data.message?.content) return data.message.content;
    if (Array.isArray(data.parts)) {
      return data.parts
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join(' ');
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Sanitize text for keyword detection (strip code blocks, URLs, paths)
 */
function sanitize(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/https?:\/\/[^\s)>\]]+/g, '')
    .replace(/(?<=^|[\s"'`(])(?:\/)?(?:[\w.-]+\/)+[\w.-]+/gm, '');
}

/**
 * Extract feature name from user prompt
 */
function extractFeatureName(prompt) {
  // Try to extract a meaningful name from the prompt
  const cleaned = prompt.replace(/\buam\b/gi, '').trim();
  if (!cleaned) return 'unnamed';

  // Take first few meaningful words
  const words = cleaned
    .split(/\s+/)
    .filter(w => w.length > 2 && !/^(the|and|for|with|this|that|from|into)$/i.test(w))
    .slice(0, 4);

  return words.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'task';
}

async function main() {
  try {
    const input = await readStdin();
    if (!input.trim()) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    let data = {};
    try { data = JSON.parse(input); } catch {}
    const cwd = data.cwd || data.directory || process.cwd();

    const prompt = extractPrompt(input);
    if (!prompt) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const cleanPrompt = sanitize(prompt).toLowerCase();

    // Detect "uam" keyword (word boundary to avoid false positives)
    if (!/\buam\b/i.test(cleanPrompt)) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    // Check if UAM is already active
    if (isUamActive(cwd)) {
      // UAM already running - don't re-initialize
      console.log(JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: '[UAM] Pipeline already active. Use current session or cancel first.'
        }
      }));
      return;
    }

    // Detect small/quick/light variant
    const isSmallRun = /\buam[\s-]*(small|quick|light)\b/i.test(cleanPrompt);

    // Initialize UAM state with appropriate run mode
    const featureName = extractFeatureName(prompt);
    const runMode = isSmallRun ? 'small' : 'full';
    initState(cwd, featureName, runMode);

    // Return magic keyword to trigger appropriate UAM skill
    const skillName = isSmallRun ? 'uam-small' : 'uam';
    const commandName = isSmallRun ? 'uam-small-run' : 'uam-run';
    const pipelineDesc = isSmallRun
      ? 'UAM 3-Phase Lightweight Pipeline'
      : 'UAM 5-Phase Pipeline';
    const phaseDesc = isSmallRun
      ? 'Phase 1: Small Plan'
      : 'Phase 1: Quick Plan';

    const message = `[MAGIC KEYWORD: UAM]

${pipelineDesc} activated. State initialized at .uam/state.json (run_mode: "${runMode}").

You MUST invoke the skill using the Skill tool:

Skill: ${skillName}

User request:
${prompt}

IMPORTANT: Load the UAM orchestration protocol via /uam:${commandName} command, then begin ${phaseDesc}.`;

    console.log(JSON.stringify({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: message
      }
    }));

  } catch (error) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
