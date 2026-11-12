import { Collaboration, type Graph } from './controller';
import { invoke } from '../native';
let graph = (): Graph | null => null;
export const collaboration = new Collaboration(invoke, () => graph());
export function configureCollaboration(get: () => Graph | null) {
  graph = get;
}
