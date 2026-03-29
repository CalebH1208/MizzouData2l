export interface SearchCondition {
  channel: string;
  operator: string;
  value: number;
}

export interface SearchGroup {
  conditions: SearchCondition[];
  minDurationSec: number;
}

export interface SearchRequest {
  groups: SearchGroup[];
  tagFilters: Record<string, string>;
  paddingSec: number;
  resultName: string;
}

export interface SearchMatch {
  sourceFile: string;
  sourceName: string;
  startTime: number;
  endTime: number;
  duration: number;
  groupIndex: number;
}

export interface SearchResult {
  matches: SearchMatch[];
  resultPath: string;
  totalFiles: number;
  filesWithMatches: number;
}

export interface SearchProgress {
  phase: string;
  fileIndex: number;
  fileCount: number;
  fileName: string;
  percent: number;
}
