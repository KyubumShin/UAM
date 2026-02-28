#!/usr/bin/env node
/**
 * UAM State Management Utility
 * Shared helpers for reading/writing .uam/state.json
 * Based on design document section 12.2
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const STATE_DIR = '.uam';
const STATE_FILE = 'state.json';

/**
 * Default state schema (design doc section 12.2)
 */
const DEFAULT_STATE = {
  pipeline_id: null,
  run_mode: 'full',
  current_phase: 'phase1-plan',
  started_at: null,
  plan_approved: false,
  plan_approved_at: null,
  sprint_status: {
    total_todos: 0,
    completed_todos: 0,
    in_progress_todos: 0,
    failed_todos: 0
  },
  gate_results: {
    gate1_passed: null,
    gate2_passed: null,
    gate3_passed: null
  },
  fix_loop_count: 0,
  max_fix_loops: 10,
  cost: {
    total_tokens: 0,
    max_total_tokens: 500000,
    estimated_usd: 0
  },
  convergence: {
    pass_rate_history: [],
    stagnation_window: 3,
    min_improvement: 0.05,
    regression_threshold: -0.10
  },
  fix_memory: {
    mode: 'summary',        // 'summary' | 'hybrid' | 'raw'
    max_raw_lines: 50,      // raw output truncation limit
    include_diff: false      // include worker change diff
  },
  fix_history: []            // per-loop classification history
};

/**
 * Read UAM state from .uam/state.json
 * @param {string} cwd - Working directory
 * @returns {object|null} State object or null if not found
 */
export function readState(cwd) {
  try {
    const statePath = join(cwd, STATE_DIR, STATE_FILE);
    if (!existsSync(statePath)) return null;
    return JSON.parse(readFileSync(statePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Write/merge UAM state to .uam/state.json
 * @param {string} cwd - Working directory
 * @param {object} patch - Fields to merge into state
 * @returns {object} Merged state
 */
export function writeState(cwd, patch) {
  const stateDir = join(cwd, STATE_DIR);
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }

  const current = readState(cwd) || { ...DEFAULT_STATE };
  const merged = deepMerge(current, patch);

  writeFileSync(
    join(stateDir, STATE_FILE),
    JSON.stringify(merged, null, 2),
    { mode: 0o600 }
  );

  return merged;
}

/**
 * Check if UAM is currently active
 * @param {string} cwd - Working directory
 * @returns {boolean}
 */
export function isUamActive(cwd) {
  const state = readState(cwd);
  if (!state) return false;
  if (!state.current_phase) return false;
  // Active if phase is not null and not finalized
  return state.current_phase !== 'completed' && state.current_phase !== 'cancelled';
}

/**
 * Initialize UAM state for a new pipeline run
 * @param {string} cwd - Working directory
 * @param {string} featureName - Name of the feature being built
 * @param {string} runMode - Pipeline mode: 'full' (5-phase) or 'small' (3-phase lightweight)
 * @returns {object} Initial state
 */
export function initState(cwd, featureName, runMode = 'full', fixMemoryMode = 'summary') {
  const now = new Date().toISOString();
  const dateStr = now.slice(0, 10).replace(/-/g, '');
  const slug = featureName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);

  const isSmall = runMode === 'small';

  return writeState(cwd, {
    ...DEFAULT_STATE,
    pipeline_id: `uam-${isSmall ? 'small-' : ''}${dateStr}-${slug}`,
    run_mode: runMode,
    current_phase: isSmall ? 'small-plan' : 'phase1-plan',
    max_fix_loops: isSmall ? 3 : 10,
    cost: {
      ...DEFAULT_STATE.cost,
      max_total_tokens: isSmall ? 150000 : 500000
    },
    started_at: now,
    fix_memory: {
      ...DEFAULT_STATE.fix_memory,
      mode: fixMemoryMode
    },
    fix_history: []
  });
}

/**
 * Deep merge two objects (shallow for arrays)
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
