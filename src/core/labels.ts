// Agent label layer. Separate from the base graph; never overwrites base labels.
import { cmpStr, pretty } from "./ir";

export interface AgentLabel {
  text: string;
  /** Who produced it (model id, tool, person). */
  author: string;
  /** Graph node content hash the label was written against, to detect staleness. */
  node_hash?: string;
}

export interface LabelLayer { labels: Map<string, AgentLabel> }

export function labelsToJson(l: LabelLayer): string {
  const labels: Record<string, AgentLabel> = {};
  for (const k of [...l.labels.keys()].sort(cmpStr)) {
    const v = l.labels.get(k)!;
    labels[k] = v.node_hash === undefined ? { text: v.text, author: v.author } : { text: v.text, author: v.author, node_hash: v.node_hash };
  }
  return pretty({ labels });
}
