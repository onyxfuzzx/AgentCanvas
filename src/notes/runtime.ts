import { invoke } from '../native';
import { Notes } from './store';
export const notes = new Notes(invoke);
