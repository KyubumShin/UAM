#!/usr/bin/env node
/**
 * UAM Output Validation Hook (PostToolUse)
 * Inserts validation reminder when a validate_prompt-enabled agent completes.
 *
 * Based on: design doc section 9.2 hook 2
 *
 * Agents with validate_prompt: gap-analyzer, tradeoff-analyzer, verification-planner, worker
 * When these agents complete via Task tool, this hook inserts a [UAM VALIDATION] reminder
 * so the orchestrator checks the output against the agent's Output_Schema.
 */

import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import shared UAM state utility
const { isUamActive } = await import(
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

// Agents that require output validation
const VALIDATE_AGENTS = new Set([
  'uam-gap-analyzer',
  'uam-tradeoff-analyzer',
  'uam-verification-planner',
  'uam-worker',
]);

// Expected output sections per agent
const EXPECTED_SECTIONS = {
  'uam-gap-analyzer': [
    '1. Missing Requirements',
    '2. AI Pitfalls',
    '3. Must NOT Do',
    '4. Recommended Questions',
  ],
  'uam-tradeoff-analyzer': [
    'Overall Risk Assessment',
    'Change-Level Analysis',
    'Recommended Execution Order',
  ],
  'uam-verification-planner': [
    '1. Test Infrastructure',
    '2. A-items',
    '3. S-items',
    '4. H-items',
    '5. Verification Gaps',
    '6. External Dependencies',
  ],
  'uam-worker': [
    'todo_id',
    'status',
    'outputs',
    'acceptance_criteria',
  ],
};

async function main() {
  const input = await readStdin();

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const toolName = data.tool_name || data.toolName || '';

  // Only intercept Task tool completions
  if (!['Task', 'task'].includes(toolName)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  // Check if UAM is active
  const cwd = data.cwd || data.directory || process.cwd();
  if (!isUamActive(cwd)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  // Extract agent type from tool input
  const toolInput = data.tool_input || data.toolInput || {};
  const agentType = toolInput.subagent_type || toolInput.subagentType || '';

  // Check if this agent requires validation
  if (!VALIDATE_AGENTS.has(agentType)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  // Get expected sections for this agent
  const sections = EXPECTED_SECTIONS[agentType] || [];
  const sectionList = sections.map(s => `  - ${s}`).join('\n');

  const message = `[UAM VALIDATION] Agent "${agentType}" output requires schema validation.

Verify the output contains ALL required sections:
${sectionList}

If any section is missing or malformed, re-run the agent with clarified instructions.
Do NOT proceed to the next phase until validation passes.`;

  console.log(JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: message
    }
  }));
}

main().catch(() => {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
});
