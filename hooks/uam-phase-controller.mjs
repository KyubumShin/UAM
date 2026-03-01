#!/usr/bin/env node
/**
 * UAM Phase Controller Hook (Stop)
 * Manages phase transitions and loop continuation for the UAM pipeline.
 *
 * Based on: design doc section 9.2 hook 3
 *
 * Phase transitions:
 * - phase2-sprint: checks PLAN.md checkboxes → all done → phase3-gate
 * - phase3-gate: checks gate results → all pass → phase5-finalize, any fail → phase4-fix
 * - phase4-fix: checks fix_loop_count → exceeded → phase5-finalize, else continue
 * - phase5-finalize: completion message + deactivate UAM
 *
 * Always returns continue: true to keep the pipeline loop running until completion.
 */

import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import shared UAM state utility
const { readState, writeState, isUamActive } = await import(
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
 * Check PLAN.md checkbox completion status
 */
function checkPlanStatus(cwd) {
  const planPaths = [
    join(cwd, '.uam', 'PLAN.md'),
    join(cwd, 'PLAN.md'),
  ];

  for (const planPath of planPaths) {
    if (!existsSync(planPath)) continue;

    const content = readFileSync(planPath, 'utf-8');
    const todoPattern = /### \[( |x|X|FAILED)\]/g;
    const matches = [...content.matchAll(todoPattern)];

    if (matches.length === 0) return { total: 0, completed: 0, failed: 0 };

    let completed = 0;
    let failed = 0;
    for (const m of matches) {
      const mark = m[1];
      if (mark === 'x' || mark === 'X') completed++;
      else if (mark === 'FAILED') failed++;
    }

    return { total: matches.length, completed, failed };
  }

  return null;
}

/**
 * Check gate results from state
 */
function checkGateResults(state) {
  const gates = state.gate_results || {};
  const results = [gates.gate1_passed, gates.gate2_passed, gates.gate3_passed];

  // gate3 is optional (only if S-items exist)
  const required = results.filter(r => r !== null && r !== undefined);
  const passed = required.filter(r => r === true);
  const failed = required.filter(r => r === false);

  return {
    allPassed: failed.length === 0 && passed.length > 0,
    anyFailed: failed.length > 0,
    details: {
      gate1: gates.gate1_passed,
      gate2: gates.gate2_passed,
      gate3: gates.gate3_passed,
    }
  };
}

async function main() {
  const input = await readStdin();

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const cwd = data.cwd || data.directory || process.cwd();

  // Check if UAM is active
  if (!isUamActive(cwd)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const state = readState(cwd);
  if (!state) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const phase = state.current_phase;

  switch (phase) {
    case 'phase1-plan': {
      // Phase 1: Quick Plan - orchestrator handles, no auto-transition
      console.log(JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'Stop',
          additionalContext: '[UAM] Phase 1: Quick Plan in progress. Complete planning and HITL before proceeding.'
        }
      }));
      break;
    }

    case 'phase2-sprint': {
      // Check PLAN.md completion
      const planStatus = checkPlanStatus(cwd);
      if (!planStatus || planStatus.total === 0) {
        console.log(JSON.stringify({
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'Stop',
            additionalContext: '[UAM] Phase 2: Sprint in progress. No PLAN.md found or no TODOs defined.'
          }
        }));
        break;
      }

      const { total, completed, failed } = planStatus;
      const remaining = total - completed - failed;

      if (remaining === 0) {
        // All TODOs resolved (completed or failed) → Phase 3
        writeState(cwd, { current_phase: 'phase3-gate' });
        console.log(JSON.stringify({
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'Stop',
            additionalContext: `[UAM] All TODOs resolved (${completed} completed, ${failed} failed). Transitioning to Phase 3: Quality Gate.`
          }
        }));
      } else {
        console.log(JSON.stringify({
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'Stop',
            additionalContext: `[UAM] Phase 2: Sprint in progress. ${completed}/${total} TODOs completed, ${failed} failed, ${remaining} remaining.`
          }
        }));
      }
      break;
    }

    case 'phase3-gate': {
      // Check gate results
      const gateResults = checkGateResults(state);

      if (gateResults.allPassed) {
        // All gates passed → Phase 5
        writeState(cwd, { current_phase: 'phase5-finalize' });
        console.log(JSON.stringify({
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'Stop',
            additionalContext: '[UAM] All Quality Gates passed! Transitioning to Phase 5: Finalize.'
          }
        }));
      } else if (gateResults.anyFailed) {
        // Gate failed → Phase 4
        writeState(cwd, { current_phase: 'phase4-fix', fix_loop_count: 0 });
        console.log(JSON.stringify({
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'Stop',
            additionalContext: `[UAM] Quality Gate failed. Gate results: G1=${gateResults.details.gate1}, G2=${gateResults.details.gate2}, G3=${gateResults.details.gate3}. Transitioning to Phase 4: Fix Loop.`
          }
        }));
      } else {
        // Gates not yet evaluated
        console.log(JSON.stringify({
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'Stop',
            additionalContext: '[UAM] Phase 3: Quality Gate in progress. Run all 3 gates before proceeding.'
          }
        }));
      }
      break;
    }

    case 'phase4-fix': {
      const fixCount = state.fix_loop_count || 0;
      const maxFix = state.max_fix_loops || 10;

      if (fixCount >= maxFix) {
        // Fix loop limit reached → Phase 5 (partial completion)
        writeState(cwd, { current_phase: 'phase5-finalize' });
        console.log(JSON.stringify({
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'Stop',
            additionalContext: `[UAM] Fix loop limit reached (${fixCount}/${maxFix}). Transitioning to Phase 5: Finalize (partial completion).`
          }
        }));
      } else {
        // Continue fix loop
        console.log(JSON.stringify({
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'Stop',
            additionalContext: `[UAM] Phase 4: Fix Loop ${fixCount}/${maxFix}. Continue fixing or re-run Quality Gate.`
          }
        }));
      }
      break;
    }

    case 'phase5-finalize': {
      // Finalize: complete UAM
      writeState(cwd, { current_phase: 'completed' });
      console.log(JSON.stringify({
        continue: false,
        hookSpecificOutput: {
          hookEventName: 'Stop',
          additionalContext: '[UAM] Phase 5: Finalize complete. UAM pipeline finished. Extract learnings and commit.'
        }
      }));
      break;
    }

    // === Small Pipeline Phases (3-Phase Lightweight) ===

    case 'small-plan': {
      // Small Plan: orchestrator handles, no auto-transition
      console.log(JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'Stop',
          additionalContext: '[UAM-Small] Phase 1: Small Plan in progress. Complete planning and HITL before proceeding.'
        }
      }));
      break;
    }

    case 'small-sprint': {
      // Check PLAN.md completion (reuse checkPlanStatus)
      const smallPlanStatus = checkPlanStatus(cwd);
      if (!smallPlanStatus || smallPlanStatus.total === 0) {
        console.log(JSON.stringify({
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'Stop',
            additionalContext: '[UAM-Small] Phase 2: Sprint in progress. No PLAN.md found or no TODOs defined.'
          }
        }));
        break;
      }

      const { total: sTotal, completed: sCompleted, failed: sFailed } = smallPlanStatus;
      const sRemaining = sTotal - sCompleted - sFailed;

      if (sRemaining === 0) {
        // All TODOs resolved → small-verify
        writeState(cwd, { current_phase: 'small-verify' });
        console.log(JSON.stringify({
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'Stop',
            additionalContext: `[UAM-Small] All TODOs resolved (${sCompleted} completed, ${sFailed} failed). Transitioning to Phase 3: Verify.`
          }
        }));
      } else {
        console.log(JSON.stringify({
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'Stop',
            additionalContext: `[UAM-Small] Phase 2: Sprint in progress. ${sCompleted}/${sTotal} TODOs completed, ${sFailed} failed, ${sRemaining} remaining.`
          }
        }));
      }
      break;
    }

    case 'small-verify': {
      // Simplified verification: only gate2 (code review)
      const smallGate = state.gate_results || {};

      if (smallGate.gate2_passed === true) {
        // Code review passed → completed
        writeState(cwd, { current_phase: 'completed' });
        console.log(JSON.stringify({
          continue: false,
          hookSpecificOutput: {
            hookEventName: 'Stop',
            additionalContext: '[UAM-Small] Verification passed. Pipeline complete. Extract learnings and commit.'
          }
        }));
      } else if (smallGate.gate2_passed === false) {
        const smallFixCount = state.fix_loop_count || 0;
        const smallMaxFix = state.max_fix_loops || 3;

        if (smallFixCount >= smallMaxFix) {
          // Fix loop limit reached → completed (partial)
          writeState(cwd, { current_phase: 'completed' });
          console.log(JSON.stringify({
            continue: false,
            hookSpecificOutput: {
              hookEventName: 'Stop',
              additionalContext: `[UAM-Small] Fix loop limit reached (${smallFixCount}/${smallMaxFix}). Completing with partial results. Extract learnings.`
            }
          }));
        } else {
          // Review failed, retries remaining → back to small-sprint
          writeState(cwd, { current_phase: 'small-sprint', fix_loop_count: smallFixCount + 1 });
          console.log(JSON.stringify({
            continue: true,
            hookSpecificOutput: {
              hookEventName: 'Stop',
              additionalContext: `[UAM-Small] Code review failed. Retry ${smallFixCount + 1}/${smallMaxFix}. Returning to Sprint for fixes.`
            }
          }));
        }
      } else {
        // Gate not yet evaluated
        console.log(JSON.stringify({
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'Stop',
            additionalContext: '[UAM-Small] Phase 3: Verify in progress. Run code review before proceeding.'
          }
        }));
      }
      break;
    }

    default: {
      // Unknown or completed phase
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    }
  }
}

main().catch(() => {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
});
