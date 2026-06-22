// ---------------------------------------------------------------------------
// @digest/curation — LLM-free curation (manual picker + heuristic backup)
// ---------------------------------------------------------------------------

export {
  recencyScore,
  sourceTierScore,
  topicScore,
  scoreCandidate,
  heuristicCurate,
  candidateToDraftItem,
  groupBySourceTopN,
} from './heuristic.js';

export type {
  CandidateView,
  CandidateDraftItem,
  ScoreOptions,
  CurateOptions,
  SourceGroup,
} from './heuristic.js';
