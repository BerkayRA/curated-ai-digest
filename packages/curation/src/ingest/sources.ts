// ---------------------------------------------------------------------------
// Curated RSS feed list and Exa search queries for AI-news ingestion.
// Edit FEEDS and EXA_QUERIES to add / remove sources without touching logic.
// ---------------------------------------------------------------------------

export interface FeedDefinition {
  /** Human-readable source name stored in candidateArticle.sourceName. */
  readonly name: string;
  /** RSS / Atom feed URL. */
  readonly url: string;
}

/**
 * Curated list of major AI-news RSS feeds.
 * Each entry maps to a source in the curation pipeline.
 */
export const FEEDS: readonly FeedDefinition[] = [
  {
    name: 'OpenAI Blog',
    url: 'https://openai.com/blog/rss.xml',
  },
  {
    name: 'Anthropic News',
    url: 'https://www.anthropic.com/rss.xml',
  },
  {
    name: 'Google DeepMind Blog',
    url: 'https://deepmind.google/blog/rss.xml',
  },
  {
    name: 'MIT Technology Review AI',
    url: 'https://www.technologyreview.com/feed/',
  },
  {
    name: 'VentureBeat AI',
    url: 'https://venturebeat.com/category/ai/feed/',
  },
  {
    name: 'The Verge AI',
    url: 'https://www.theverge.com/ai-artificial-intelligence/rss/index.xml',
  },
  {
    name: 'Ars Technica AI',
    url: 'https://feeds.arstechnica.com/arstechnica/technology-lab',
  },
  {
    name: 'Hugging Face Blog',
    url: 'https://huggingface.co/blog/feed.xml',
  },
  {
    name: 'TechCrunch AI',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
  },
] as const;

/**
 * Neural search queries sent to Exa for supplemental AI-news discovery.
 * Scoped to the past 7 days via Exa's startPublishedDate param.
 */
export const EXA_QUERIES: readonly string[] = [
  'latest artificial intelligence breakthroughs and research',
  'large language model releases and updates this week',
  'AI safety alignment news and developments',
  'generative AI applications and products launched',
  'machine learning industry news and funding rounds',
] as const;
