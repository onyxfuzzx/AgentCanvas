import { invoke } from '../native';
import { TaskMutations } from '../tasks/runtime';
export const areaMutations = new TaskMutations(invoke, 'area_action');
