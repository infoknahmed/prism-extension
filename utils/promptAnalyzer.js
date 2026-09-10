/**
 * Prism — context-aware, privacy-first prompt analysis.
 *
 * Everything here is pure heuristic text analysis — 100% local, no network.
 * It powers the offline rule-based coach and provides the quick metrics
 * shown alongside AI-powered optimization.
 *
 * Scoring dimensions (each 0–100):
 *   clarity      — is the request unambiguous?
 *   specificity  — does it carry enough detail to act on?
 *   tone         — formal / casual / technical (not scored, reported)
 *   efficiency   — token economy (can it be shorter without losing meaning?)
 *   safety       — flags potentially harmful / biased phrasing (100 = clean)
 *   overall      — weighted blend
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------ goals

  const GOAL_PATTERNS = [
    { goal: 'explain', re: /\b(explain|what is|what are|how does|how do|why does|teach me|describe|eli5|clarify)\b/i },
    { goal: 'debug', re: /\b(debug|fix|error|bug|exception|stack ?trace|traceback|not working|fails?|broken|crash)\b/i },
    { goal: 'generate', re: /\b(write|generate|create|draft|compose|make me|produce|build|design)\b/i },
    { goal: 'rewrite', re: /\b(rewrite|rephrase|improve|polish|shorten|summarize|condense|translate|tone)\b/i },
    { goal: 'analyze', re: /\b(analyze|review|audit|compare|evaluate|assess|critique|pros and cons)\b/i },
    { goal: 'code', re: /\b(function|code|script|api|regex|sql|component|class|algorithm|refactor|unit test)\b/i },
    { goal: 'research', re: /\b(research|sources?|cite|evidence|studies?|latest|statistics|state of the art)\b/i },
    { goal: 'plan', re: /\b(plan|roadmap|strategy|steps|schedule|itinerary|checklist|curriculum)\b/i }
  ];

  const VAGUE_WORDS = [
    'good', 'nice', 'better', 'stuff', 'things', 'something', 'somehow', 'etc',
    'various', 'some', 'few', 'many', 'very', 'really', 'basically', 'just',
    'kind of', 'sort of', 'a lot', 'big', 'small', 'soon', 'later', 'modern',
    'interesting', 'amazing', 'great', 'cool', 'optimal', 'best'
  ];

  // Markers of a prompt that already carries structure.
  const STRUCTURE_SIGNALS = [
    /\n\s*[-*\d]/,                    // bullet or numbered list
    /\bstep[s]?\s*[:\d]/i,
    /\bformat\s*:/i,
    /\bact(?:ing)?\s+as\b/i,
    /\byou\s+are\b/i,
    /\bcontext\s*:/i,
    /\bgoal\s*:/i,
    /\bconstraints?\s*:/i,
    /\bexample[s]?\s*:/i,
    /\baudience\s*:/i,
    /\boutput\s*:/i,
    /```/
  ];

  const OUTPUT_FORMAT_HINTS = [
    { name: 'JSON', re: /\bjson\b/i },
    { name: 'markdown', re: /\bmarkdown|bullet|table|list\b/i },
    { name: 'code', re: /\bcode|snippet|function|regex|sql\b/i },
    { name: 'table', re: /\btable\b/i },
    { name: 'email', re: /\bemail|subject line\b/i }
  ];

  const SAFETY_RULES = [
    { id: 'harm', re: /\b(how (do|to|can) (i|we) (make|build|create) (a )?(bomb|explosive|weapon|meth|poison)|harm (someone|myself)|kill (a|my|someone))\b/i, weight: 45, msg: 'Request may relate to causing harm. Refine toward a safe, legitimate goal (e.g. chemistry homework, self-defense, mental-health support).' },
    { id: 'malware', re: /\b(keylogger|ransomware|botnet|ddos|steal (passwords|credit cards?)|credit card dump|sql.?injection (attack|payload))\b/i, weight: 30, msg: 'Looks like it could request malware/attack techniques. Security research is fine — state the authorized, educational context.' },
    { id: 'personal-data', re: /\b(social security number|passport number|credit card number|cvv)\b\s*[:]?\s*\d{3,}/i, weight: 40, msg: 'Sensitive personal data detected. Remove it — sharing it with an AI service is a privacy risk.' },
    { id: 'deception', re: /\b(write (a |me )?(fake|false) (review|news|receipt)|pass (this|my) (ai detector|turnitin)|plagiar)/i, weight: 30, msg: 'Request may facilitate deception or plagiarism. Rephrase toward legitimate use (drafting, learning, disclosed fiction).' },
    { id: 'group-blame', re: /\b(all|most|those)?\s*(women|men|immigrants|muslims|christians|jews|blacks|whites|asians|hispanics|gays|boomers|millennials)\s+(are|is|always|never)\b/i, weight: 25, msg: 'Contains a broad generalization about a group. Ask about patterns or policies instead of group traits.' },
    { id: 'medical-absolute', re: /\b(cure|guaranteed) (cancer|covid|autism|depression)\b/i, weight: 20, msg: 'Absolute medical claim detected. Ask for evidence-based information instead.' }
  ];

  const ROLE_SUGGESTIONS = {
    code: 'an experienced software engineer',
    debug: 'a senior engineer who has debugged this stack for years',
    explain: 'a patient teacher who explains from first principles',
    generate: 'a professional {domain} writer',
    rewrite: 'a sharp editor',
    analyze: 'a rigorous analyst',
    research: 'a research librarian',
    plan: 'an experienced project planner'
  };

  const CONTEXT_EXTRA_PATTERNS = [
    { key: 'audience', re: /\b(audience|for beginners|for kids|for my (boss|team)|client)\b/i, missing: "state your audience (e.g. 'for a non-technical manager')" },
    { key: 'examples', re: /\b(example|for instance|such as|like this:)\b/i, missing: 'include one concrete example of what good output looks like' },
    { key: 'constraints', re: /\b(must|should|don'?t|avoid|at most|at least|no more than|limit|only)\b/i, missing: 'add constraints (length, what to avoid, must-haves)' },
    { key: 'format', re: /\b(format|json|table|bullet|list|markdown|csv)\b/i, missing: 'specify the output format (table, JSON, bullets…)' }
  ];

  // ----------------------------------------------------------- helpers

  function detectGoal(text) {
    for (const { goal, re } of GOAL_PATTERNS) {
      if (re.test(text)) return goal;
    }
    return 'general';
  }

  function countVagueWords(text) {
    let count = 0;
    for (const w of VAGUE_WORDS) {
      const re = new RegExp('\\b' + w.replace(/ /g, '\\s+') + '\\b', 'gi');
      const m = text.match(re);
      if (m) count += m.length;
    }
    return count;
  }

  function estimateTokens(text) {
    // ~4 chars per token for English — good enough for guidance.
    return Math.max(1, Math.round(text.length / 4));
  }

  function clamp(n) {
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function detectTone(text) {
    const formal = (text.match(/\b(please|kindly|therefore|regarding|furthermore|accordingly|i would like|request)\b/gi) || []).length;
    const casual = (text.match(/\b(hey|hi|gonna|wanna|yeah|pls|thx|lol|u\b|ur\b|asap)\b/gi) || []).length;
    const technical = (text.match(/\b(api|function|async|css|sql|endpoint|compile|deploy|schema|parameter|library|framework)\b/gi) || []).length;
    const scores = { formal, casual, technical };
    let best = 'neutral';
    let bestScore = 0;
    for (const [tone, s] of Object.entries(scores)) {
      if (s > bestScore) { best = tone; bestScore = s; }
    }
    return bestScore === 0 ? 'neutral' : best;
  }

  function findSafetyIssues(text) {
    const issues = [];
    for (const rule of SAFETY_RULES) {
      if (rule.re.test(text)) {
        issues.push({ id: rule.id, message: rule.msg, weight: rule.weight });
      }
    }
    return issues;
  }

  // --------------------------------------------------------- analysis

  /**
   * Analyze a prompt in the context of the surrounding conversation.
   * @param {string} text      the prompt text
   * @param {object} [context] { conversation: string, site: string, goal: string }
   * @returns {object} analysis result
   */
  function analyze(text, context) {
    context = context || {};
    const original = String(text || '');
    const trimmed = original.trim();
    const conversation = String(context.conversation || '');
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
    const wordCount = words.length;
    const sentences = trimmed.split(/[.!?]+\s/).filter((s) => s.trim().length > 0);
    const hasQuestion = /\?\s*$/.test(trimmed);
    const hasStructure = STRUCTURE_SIGNALS.some((re) => re.test(trimmed));
    const goal = context.goal || detectGoal(trimmed + ' ' + conversation.slice(-400));

    // --- clarity: sentence length, vagueness, question form, structure
    const vagueCount = countVagueWords(trimmed);
    const avgSentenceLen = sentences.length ? wordCount / Math.max(1, sentences.length) : wordCount;
    let clarity = 62;
    clarity -= Math.min(18, vagueCount * 4.5);
    clarity += hasQuestion ? 6 : 0;
    clarity += hasStructure ? 10 : 0;
    clarity += wordCount >= 5 && wordCount <= 12 ? 6 : 0;          // crisp ask
    clarity -= wordCount > 120 ? 8 : 0;                            // wall of text
    clarity -= avgSentenceLen > 32 ? 10 : 0;
    if (wordCount === 0) clarity = 0;
    clarity = clamp(clarity);

    // --- specificity: numbers, names, explicit context
    const numbers = (trimmed.match(/\b\d+([.,]\d+)?\b/g) || []).length;
    const quoted = (trimmed.match(/["“”][^"“”]{3,}["“”]/g) || []).length;
    const properNouns = (trimmed.match(/\b[A-Z][a-zA-Z]{2,}\b/g) || []).length;
    const contextHits = CONTEXT_EXTRA_PATTERNS.filter((p) => p.re.test(trimmed)).length;
    const missingContext = CONTEXT_EXTRA_PATTERNS.filter((p) => !p.re.test(trimmed)).map((p) => p.missing);
    let specificity = 40;
    specificity += Math.min(12, numbers * 4);
    specificity += Math.min(10, quoted * 5);
    specificity += Math.min(10, properNouns * 2.5);
    specificity += contextHits * 9;
    specificity += wordCount > 25 ? 8 : 0;
    specificity -= wordCount < 8 ? 25 : wordCount < 15 ? 12 : 0;
    if (wordCount === 0) specificity = 0;
    specificity = clamp(specificity);

    // --- efficiency: filler, repetition, redundancy vs. information
    const fillers = (trimmed.match(/\b(please note that|it is important to note|as you know|i want you to|kindly|basically|actually|in order to)\b/gi) || []).length;
    const seenWords = new Map();
    let repeated = 0;
    for (const w of words) {
      const k = w.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (k.length > 3) {
        seenWords.set(k, (seenWords.get(k) || 0) + 1);
        if (seenWords.get(k) > 2) repeated++;
      }
    }
    let efficiency = 88;
    efficiency -= fillers * 7;
    efficiency -= repeated * 3;
    efficiency -= wordCount > 150 ? 18 : wordCount > 90 ? 8 : 0;
    efficiency += wordCount > 0 && wordCount <= 60 ? 6 : 0;
    if (wordCount === 0) efficiency = 0;
    efficiency = clamp(efficiency);

    // --- safety
    const safetyIssues = findSafetyIssues(trimmed + ' ' + conversation.slice(-600));
    let safety = 100;
    for (const issue of safetyIssues) safety -= issue.weight;
    safety = clamp(safety);

    // --- overall
    let overall = clarity * 0.3 + specificity * 0.4 + efficiency * 0.2 + safety * 0.1;
    if (safety < 60) overall = Math.min(overall, 45);
    overall = clamp(overall);

    const outputFormat = OUTPUT_FORMAT_HINTS.find((h) => h.re.test(trimmed));

    return {
      goal,
      site: context.site || '',
      hasConversation: conversation.trim().length > 0,
      conversationTurns: conversation ? conversation.split(/\n{2,}/).filter(Boolean).length : 0,
      wordCount,
      tokenEstimate: estimateTokens(trimmed),
      scores: { clarity, specificity, efficiency, safety, overall },
      tone: detectTone(trimmed),
      hasStructure,
      hasQuestion,
      outputFormat: outputFormat ? outputFormat.name : null,
      vagueWords: vagueCount,
      missingContext,
      safetyIssues,
      ok: wordCount > 0
    };
  }

  // ------------------------------------------------- rule-based rewrite

  /**
   * Offline, rule-based optimization. Builds an improved prompt using the
   * analysis: adds role, goal, constraints, format and structure. No network.
   */
  function suggestOffline(promptText, analysis, prefs) {
    prefs = prefs || {};
    const trimmed = String(promptText || '').trim();
    const goal = analysis.goal;
    const lines = [];

    // Role
    const wantsRole = /\b(act as|you are|as a)\b/i.test(trimmed);
    let role = ROLE_SUGGESTIONS[goal] || 'an expert assistant';
    if (prefs.role && prefs.role.trim()) role = prefs.role.trim();
    if (!wantsRole) {
      role = role.replace('{domain}', prefs.domain || '');
      lines.push('You are ' + role + '.');
    }

    // The user's ask, cleaned of filler.
    let ask = trimmed
      .replace(/\b(please note that|it is important to note that|i want you to|i would like you to|as you know)\b/gi, '')
      .replace(/\b(kindly|basically|actually)\b\s*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([.,!?])/g, '$1')
      .trim();
    if (!ask) ask = trimmed;
    // Capitalize first letter.
    ask = ask.charAt(0).toUpperCase() + ask.slice(1);

    const isListish = /\n\s*[-*\d]/.test(trimmed) || trimmed.length > 220;
    if (isListish) {
      lines.push('', ask); // long/multi-line input: keep verbatim under the role
    } else {
      lines.push('', 'Task: ' + ask.replace(/\.$/, '') + '.');
    }

    // Goal-specific guidance
    const guidance = {
      explain: ['Start from what I likely already know, use one concrete example and one analogy.', 'Flag anything you are unsure about instead of guessing.'],
      debug: ['List 2–4 likely root causes ranked by probability, with reasoning.', 'Give the minimal fix plus a regression test.', 'Mention edge cases the fix could break.'],
      generate: ['Prioritize substance over length; cut every sentence that does not add information.'],
      rewrite: ['Keep my original meaning; change wording, not intent.', 'Mark anything you had to assume with [brackets].'],
      analyze: ['Separate facts from interpretation; label each claim as one or the other.', 'End with the 3 most important takeaways.'],
      code: ['Give working, complete code — no placeholders.', 'Briefly note assumptions and time/space complexity if relevant.'],
      research: ['Prefer primary sources; note publication dates.', 'Explicitly mark claims that are contested or speculative.'],
      plan: ['Break the work into phases with concrete deliverables and time estimates.', 'Surface the riskiest assumption first.'],
      general: ['If the request is ambiguous, ask up to 2 clarifying questions before answering.']
    };
    for (const g of guidance[goal] || guidance.general) lines.push('- ' + g);

    // Context the prompt was missing (max 3, phrased as prompts to the user, not to the AI)
    // These go into "What I added / what to add" notes instead of the prompt body when unknown.

    // Format
    if (!analysis.outputFormat) {
      lines.push('- Format the answer with short sections and bullets.');
    }

    // Tone preference from settings/history
    const tone = prefs.tone && prefs.tone !== 'auto' ? prefs.tone : (analysis.tone === 'casual' ? 'casual' : 'neutral');
    if (tone && tone !== 'neutral') lines.push('- Tone: ' + tone + '.');
    if (prefs.length) lines.push('- Target length: ' + prefs.length + '.');

    let optimized = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    // Efficiency pass: strip repeated whitespace, dedupe adjacent bullets
    const outLines = [];
    for (const line of optimized.split('\n')) {
      if (!(line.trim() === '' && outLines.length && outLines[outLines.length - 1].trim() === '')) {
        outLines.push(line);
      }
    }
    optimized = outLines.join('\n');

    const notes = [];
    for (const m of (analysis.missingContext || []).slice(0, 3)) {
      notes.push({ type: 'add', text: 'Consider adding: ' + m + '.' });
    }
    if (analysis.scores.efficiency < 70 && analysis.wordCount > 60) {
      notes.push({ type: 'shorten', text: 'Your prompt is long — trimming filler usually improves results.' });
    }
    if (analysis.tone === 'casual') {
      notes.push({ type: 'tone', text: 'Detected casual tone; the optimized version keeps it but adds structure.' });
    }

    return { optimized, notes };
  }

  // -------------------------------------------------- learning helpers

  /**
   * Adaptive learning: derive small preference hints from past history.
   */
  function learnFromHistory(history, learningProfile) {
    const hints = { suggestTone: null, topGoals: [], frequentWords: [] };
    if (!Array.isArray(history) || history.length < 3) return hints;
    const recent = history.slice(0, 30);

    // Top goals
    const goalCounts = {};
    for (const e of recent) if (e.goal) goalCounts[e.goal] = (goalCounts[e.goal] || 0) + 1;
    hints.topGoals = Object.entries(goalCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);

    // Tone the user's prompts tend to use
    const tones = {};
    for (const e of recent) {
      const t = detectTone(e.original || '');
      if (t !== 'neutral') tones[t] = (tones[t] || 0) + 1;
    }
    const toneEntries = Object.entries(tones).sort((a, b) => b[1] - a[1]);
    if (toneEntries.length && toneEntries[0][1] >= recent.length * 0.5) {
      hints.suggestTone = toneEntries[0][0];
    }

    // Recurring vocabulary the user relies on (for template suggestions)
    const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'you', 'your', 'can', 'please', 'write', 'make', 'about', 'from', 'have', 'what', 'how', 'need', 'want']);
    const words = {};
    for (const e of recent) {
      for (const w of String(e.original || '').toLowerCase().match(/[a-z]{4,}/g) || []) {
        if (!stop.has(w)) words[w] = (words[w] || 0) + 1;
      }
    }
    hints.frequentWords = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);

    // Respect explicit learning-profile overrides
    if (learningProfile && learningProfile.tonePreference && learningProfile.tonePreference !== 'auto') {
      hints.suggestTone = learningProfile.tonePreference;
    }
    return hints;
  }

  const PrismAnalyzer = {
    analyze,
    detectGoal,
    detectTone,
    suggestOffline,
    learnFromHistory,
    estimateTokens,
    findSafetyIssues
  };

  root.PrismAnalyzer = PrismAnalyzer;
  if (typeof self !== 'undefined' && self !== root) self.PrismAnalyzer = PrismAnalyzer;
})(typeof globalThis !== 'undefined' ? globalThis : self);
