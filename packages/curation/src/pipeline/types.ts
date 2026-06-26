// ---------------------------------------------------------------------------
// Pipeline-level types (separate from ingest types)
// ---------------------------------------------------------------------------

import type { CandidateArticle } from '@digest/db';
import type { Logger } from '../ingest/types.js';
import type { PipelineStage } from './config.js';
import type Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// Scored candidate (post Stage 1 RANK)
// ---------------------------------------------------------------------------

export interface ScoredCandidate {
  readonly candidateId: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly sourceName: string;
  readonly rawExcerpt: string | undefined;
  readonly importanceScore: number;
  readonly relevanceScore: number;
}

// ---------------------------------------------------------------------------
// Stage 2 CURATE output
// ---------------------------------------------------------------------------

export interface CurateSelection {
  readonly selectedIds: readonly string[];
  readonly justification: string;
}

// ---------------------------------------------------------------------------
// Stage 3 COPYWRITE output per item
// ---------------------------------------------------------------------------

export interface CopiedItem {
  readonly candidateId: string;
  readonly titleTr: string;
  readonly summaryTr: string;
  readonly sourceUrl: string;
  readonly sourceName: string;
}

export interface CopywriteOutput {
  readonly items: readonly CopiedItem[];
  readonly subject: string;
  readonly preheader: string;
}

// ---------------------------------------------------------------------------
// Stage 4 EDITOR/QA output per item
// ---------------------------------------------------------------------------

export interface QaFlag {
  readonly itemIndex: number;
  readonly field: 'titleTr' | 'summaryTr' | 'factual';
  readonly issue: string;
  readonly severity: 'warn' | 'block';
}

export interface QaOutput {
  readonly passed: boolean;
  readonly flags: readonly QaFlag[];
  readonly factCheckNotes: readonly string[];
  /** Structured feedback for Stage 3 retry, if !passed. */
  readonly feedbackForCopywrite?: string;
}

// ---------------------------------------------------------------------------
// Stage 5 RENDER output
// ---------------------------------------------------------------------------

export interface RenderOutput {
  readonly issueId: string;
  readonly isoWeek: string;
  readonly bodyHtml: string;
  readonly bodyJson: unknown;
}

// ---------------------------------------------------------------------------
// Orchestrator result
// ---------------------------------------------------------------------------

export interface PipelineResult {
  readonly issueId: string;
  readonly isoWeek: string;
  readonly itemCount: number;
  readonly qaFlags: readonly QaFlag[];
  readonly pipelineRuns: readonly PipelineRunRecord[];
  readonly costUsd: number;
}

/**
 * In-memory representation of a PipelineRun before/after persistence.
 * Mirrors the Prisma PipelineRun model.
 */
export interface PipelineRunRecord {
  readonly stage: PipelineStage;
  readonly model: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly costUsd: number;
  readonly status: 'ok' | 'error';
  readonly error: string | undefined;
  readonly startedAt: Date;
  readonly finishedAt: Date;
}

// ---------------------------------------------------------------------------
// Pipeline repository — injectable, mockable
// ---------------------------------------------------------------------------

export interface PipelineRepository {
  /** Load pending (status='candidate') articles for a topic, ordered by fetchedAt desc, limited. */
  findCandidates(opts: {
    topicId: string;
    isoWeek: string;
    limit?: number;
  }): Promise<readonly CandidateArticle[]>;

  /** Update importanceScore + relevanceScore on a batch of candidates. */
  updateScores(
    updates: readonly { id: string; importanceScore: number; relevanceScore: number }[],
  ): Promise<void>;

  /** Mark candidates as 'selected'. */
  selectCandidates(ids: readonly string[]): Promise<void>;

  /**
   * Upsert an Issue for the given isoWeek.
   * If one already exists, update subject/preheader/status.
   * Returns the issue id.
   */
  upsertIssue(opts: {
    topicId: string;
    isoWeek: string;
    subject: string;
    preheader: string;
    status: 'draft';
  }): Promise<string>;

  /**
   * Upsert IssueItems for a given issue (idempotent by issueId+order).
   */
  upsertIssueItems(
    issueId: string,
    items: readonly {
      candidateArticleId: string | undefined;
      order: number;
      titleTr: string;
      summaryTr: string;
      sourceUrl: string;
      sourceName: string;
      factCheckNotes: string | undefined;
      qaFlags: unknown;
    }[],
  ): Promise<void>;

  /** Persist bodyHtml + bodyJson on an issue. */
  updateIssueBody(issueId: string, bodyHtml: string, bodyJson: unknown): Promise<void>;

  /** Write a PipelineRun row. Returns the row id. */
  logPipelineRun(
    opts: Omit<PipelineRunRecord, 'startedAt' | 'finishedAt'> & {
      topicId: string;
      issueId?: string;
      startedAt: Date;
      finishedAt: Date;
    },
  ): Promise<string>;

  /**
   * Find an existing Issue for the given topic + isoWeek.
   * Returns null if not found.
   */
  findIssueByWeek(
    topicId: string,
    isoWeek: string,
  ): Promise<{ id: string; status: string } | null>;
}

// ---------------------------------------------------------------------------
// Anthropic client type alias (used for injection in stages)
// ---------------------------------------------------------------------------

export type AnthropicClient = Pick<Anthropic, 'messages'>;

// ---------------------------------------------------------------------------
// Topic context — injected into stage system prompts
// ---------------------------------------------------------------------------

/**
 * Per-topic configuration threaded into every stage. `audience` and `voice`
 * are nullable: when null, stages fall back to their original hardcoded copy,
 * so the default `enterprise-ai` topic produces byte-identical prompts.
 */
export interface TopicContext {
  readonly topicId: string;
  readonly name: string;
  readonly audience: string | null;
  readonly voice: string | null;
  /** Output language for curation stages; read sites default to 'tr' when omitted. */
  readonly language?: 'tr' | 'en';
}

// ---------------------------------------------------------------------------
// Options shared by all stages
// ---------------------------------------------------------------------------

export interface StageOptions {
  readonly client: AnthropicClient;
  readonly repository: PipelineRepository;
  readonly logger: Logger;
  /** Topic configuration injected into stage prompts + repository calls. */
  readonly topicContext: TopicContext;
  /** Issue id — used to tag PipelineRun rows. */
  readonly issueId?: string;
}
