class OllamaClient {
  constructor() {
    this.baseUrl = 'http://localhost:11434/api/chat';
    this.model = 'gemma3:1b';
    this.basePrompt = `You are "AI Mix Master", a witty radio DJ with encyclopedic music knowledge.

Your job: respond in valid JSON only. The JSON is parsed by the app to search YouTube Music, so search_queries must contain real, specific songs.

REQUIRED JSON STRUCTURE:
{"message": "your DJ response here (1-2 sentences, use **Markdown** for emphasis)", "search_queries": [{"search_query": "Artist Name - Song Title"}, ...]}

You can use **bold**, *italic*, and \`inline code\` in your message. Keep it punchy and energetic.

CRITICAL RULES FOR search_queries:
- "search_query" MUST be a REAL song like "The Neighbourhood - Sweater Weather"
- NEVER use placeholder text like "Artist - Song Name" or "Genre - Indie Pop"
- NEVER use descriptors like BPM, genre names, or moods as search queries
- If user names a specific song, include it as the first query
- For theme/mood requests, provide 3-5 real specific songs that fit
- If message is not music-related (greeting, question, etc.), use empty array []

EXAMPLES:
User: "Play sweater weather"
{"message": "Great choice! Here's that cozy vibe.", "search_queries": [{"search_query": "The Neighbourhood - Sweater Weather"}, {"search_query": "Mac Demarco - Chamber of Reflection"}]}

User: "play something dark"
{"message": "Getting dark! Here's some moody tracks.", "search_queries": [{"search_query": "Carpenter Brut - Turbo Killer"}, {"search_query": "Perturbator - Humans Are Such Easy Prey"}, {"search_query": "Gesaffelstein - Aleph"}]}

User: "hello"
{"message": "Hey there! Ready to find some tunes?", "search_queries": []}

BELOW IS THE USER'S PROFILE — use it to match recommendations to their taste:
`;
    this.activeFilters = [];
    this.profileSummary = null;
  }

  setFilters(filters) {
    this.activeFilters = filters;
  }

  setProfile(summary) {
    this.profileSummary = summary;
  }

  async sendMessage(userMessage) {
    const parts = [this.basePrompt];

    if (this.profileSummary) {
      parts.push('\n' + this.profileSummary);
    }

    if (this.activeFilters.length > 0) {
      parts.push(`\nActive filters: ${this.activeFilters.join(', ')}. Apply these filters to search queries by appending the filter word.`);
    }

    parts.push('\nRemember: respond ONLY with the JSON structure. Do not include any text before or after the JSON.');

    const systemPrompt = parts.join('\n');

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
          format: 'json',
          options: { temperature: 0.7 },
        }),
      });

      if (!response.ok) throw new Error(`Ollama returned ${response.status}`);

      const data = await response.json();
      return this.parseResponse(data);
    } catch (err) {
      console.error('Ollama error:', err);
      return {
        message: '⚠️ Could not reach the AI DJ (is Ollama running?). Try `ollama serve` and make sure gemma3:1b is pulled.',
        search_queries: [],
      };
    }
  }

  parseResponse(data) {
    try {
      const content = JSON.parse(data.message.content);
      return {
        message: content.message || 'Got it! Let me find some tracks.',
        search_queries: Array.isArray(content.search_queries) ? content.search_queries : [],
      };
    } catch {
      const raw = data.message.content;
      const msgMatch = raw.match(/"message"\s*:\s*"([^"]+)"/);
      const message = msgMatch ? msgMatch[1] : 'Check these out!';
      const queries = [];
      const sqRegex = /"search_query"\s*:\s*"([^"]+)"/g;
      let match;
      while ((match = sqRegex.exec(raw)) !== null) {
        queries.push({ search_query: match[1] });
      }
      return { message, search_queries: queries };
    }
  }
}
