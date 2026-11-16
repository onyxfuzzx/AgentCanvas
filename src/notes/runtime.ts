import { invoke } from '../native';
import { Notes } from './store';
import { checkpoint, isEditor } from '../editor';
export const notes = new Notes(invoke, isEditor() ? checkpoint : undefined);
