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
  pickFirstUnused,
} from './heuristic';

export type {
  CandidateView,
  CandidateDraftItem,
  ScoreOptions,
  CurateOptions,
  SourceGroup,
} from './heuristic';
