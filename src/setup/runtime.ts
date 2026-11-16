import { editorInvoke, isEditor } from '../editor';
import { setupStatus, type SetupStatus } from './status';
const key = 'agentcanvas.setup.v1';
export async function readSetupStatus(): Promise<SetupStatus> {
  return isEditor()
    ? setupStatus(await editorInvoke('editor_setup_get'))
    : setupStatus(JSON.parse(localStorage.getItem(key) || 'null'));
}
export async function completeSetup() {
  if (isEditor()) await editorInvoke('editor_setup_complete');
  else
    localStorage.setItem(key, JSON.stringify({ version: 1, completed: true }));
}
