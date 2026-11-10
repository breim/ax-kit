export const WILDCARD_AGENT = '*';

export const USER_DIRECTED_AGENTS = [
  {
    token: 'ChatGPT-User',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  },
  { token: 'Claude-User', userAgent: null },
  {
    token: 'Perplexity-User',
    userAgent: 'Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
  },
];

export const USER_DIRECTED_TOKENS = USER_DIRECTED_AGENTS.map((agent) => agent.token);

export const TRAINING_CRAWLERS = [
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
  'CCBot',
  'Applebot-Extended',
  'Meta-ExternalAgent',
  'Amazonbot',
];

const SEARCH_CRAWLERS = ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot', 'Meta-WebIndexer', 'Amzn-SearchBot', 'MistralAI-Index'];

// Bytespider has no vendor documentation. The Cloudflare managed robots.txt names it as an AI crawler.
const OTHER_AI_AGENTS = ['Meta-ExternalFetcher', 'Amzn-User', 'MistralAI-User', 'MistralAI-Training', 'Bytespider'];

export const AI_AGENT_TOKENS = [...USER_DIRECTED_TOKENS, ...TRAINING_CRAWLERS, ...SEARCH_CRAWLERS, ...OTHER_AI_AGENTS];

export function entryPathOf(ctx) {
  const url = new URL(ctx.entryUrl);
  return `${url.pathname}${url.search}`;
}

export const blockedOn = (robots, tokens, path) => tokens.filter((token) => !robots.allows(token, path));
