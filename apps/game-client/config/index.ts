import diagnostics from './diagnostics.json';
import ui from './ui.json';

if (typeof diagnostics.logging.actions !== 'boolean' || !Number.isInteger(ui.savedDeckPageSize) || ui.savedDeckPageSize < 1 || ui.savedDeckPageSize > 100)
  throw new Error('Invalid player interface configuration');
if (!Number.isInteger(ui.gameLogMaxEntries) || ui.gameLogMaxEntries < 1 || ui.gameLogMaxEntries > 500 ||
    !Number.isInteger(ui.gameLogSummaryMaxLength) || ui.gameLogSummaryMaxLength < 100 || ui.gameLogSummaryMaxLength > 8000)
  throw new Error('Invalid game log configuration');
export const clientFlags = structuredClone(diagnostics);
export const clientUi = Object.freeze(ui);
