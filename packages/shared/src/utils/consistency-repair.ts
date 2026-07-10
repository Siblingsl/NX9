export interface ConsistencyIssue {
  shotIds: string[];
  category: 'wardrobe' | 'lighting' | 'axis' | 'prop';
  suggestion: string;
  repairAction: 'regenerate-keyframe' | 'inpaint' | 'manual';
}

export interface ConsistencyReport {
  issues: ConsistencyIssue[];
  summary: string;
}
