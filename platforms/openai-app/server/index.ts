import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { z } from "zod";

const server = new McpServer({
  name: "voicebrief",
  version: "1.0.0",
});

// ---------------------------------------------------------------------------
// Product data
// ---------------------------------------------------------------------------

const FEATURES = {
  ai_summary: {
    name: "AI Summary",
    description: "Concise GPT-4o summary of your document. Generated in seconds.",
    free: true,
    pro: true,
  },
  audio_narration: {
    name: "Audio Narration",
    description: "Natural text-to-speech of the full document or summary. Multiple voices available.",
    free: "In-app only",
    pro: "Yes + MP3 download",
  },
  podcast_lessons: {
    name: "Podcast-Style Lessons",
    description: "Conversational audio that explains the material like a podcast episode.",
    free: false,
    pro: true,
  },
  teach_mode: {
    name: "Teach Mode",
    description: "AI analyzes each section and narrates with optimal pacing, emphasis, and tone — like a great professor.",
    free: false,
    pro: true,
  },
  voice_chat: {
    name: "Voice Chat with AI Tutor",
    description: "Real-time voice conversation with an AI professor about your document. Uses Socratic questioning.",
    free: false,
    pro: true,
  },
  quizzes: {
    name: "Spaced-Repetition Quizzes",
    description: "AI-generated multiple choice questions using the SM-2 algorithm (same as Anki).",
    free: false,
    pro: true,
  },
  flashcards: {
    name: "Flashcards",
    description: "Create and study flashcards linked to your documents.",
    free: false,
    pro: true,
  },
  pdf_chat: {
    name: "PDF Chat / Q&A",
    description: "Ask questions about your document and get answers with citations.",
    free: false,
    pro: true,
  },
  slideshows: {
    name: "AI Slideshows",
    description: "Auto-generated presentation slides from document content.",
    free: false,
    pro: true,
  },
};

const PLANS = {
  free: {
    name: "Free",
    price: "$0",
    pdfs_per_month: 1,
    tts_minutes: 30,
    max_file_mb: 10,
    max_pages: 20,
    download_audio: false,
  },
  pro: {
    name: "Pro",
    price: "$9.99/month",
    annual_price: "$7.99/month (billed $95.88/year)",
    pdfs_per_month: "Unlimited",
    tts_minutes: "Unlimited",
    max_file_mb: 100,
    max_pages: 500,
    download_audio: true,
    priority_support: true,
    money_back: "30-day guarantee",
  },
  lifetime: {
    name: "Lifetime",
    price: "$99 one-time",
    pdfs_per_month: "Unlimited",
    tts_minutes: "Unlimited",
    max_file_mb: 100,
    max_pages: 500,
    download_audio: true,
    priority_support: true,
  },
};

const VOICES = [
  { id: "echo", name: "Echo", style: "Calm, professor-like", best_for: "Textbooks, academic content", tier: "all" },
  { id: "alloy", name: "Alloy", style: "Clear, methodical", best_for: "Technical material", tier: "all" },
  { id: "fable", name: "Fable", style: "Storytelling", best_for: "Making complex ideas simple", tier: "all" },
  { id: "nova", name: "Nova", style: "Warm, engaging, friendly", best_for: "General content", tier: "all" },
  { id: "onyx", name: "Onyx", style: "Deep, authoritative", best_for: "Dense academic reading", tier: "all" },
  { id: "shimmer", name: "Shimmer", style: "Smooth, conversational", best_for: "Lighter content", tier: "all" },
  { id: "hindi", name: "Hindi", style: "Hindi language", best_for: "Hindi documents", tier: "all" },
  { id: "eleven_pro", name: "ElevenLabs Pro", style: "Premium clarity", best_for: "Best quality narration", tier: "pro" },
];

const WORKFLOWS: Record<string, { student_type: string; steps: string[] }> = {
  medical: {
    student_type: "Medical / Nursing",
    steps: [
      "Upload textbook chapter PDFs",
      "Generate Teach Mode audio for hardest topics",
      "Use Voice Chat to ask the AI tutor about difficult concepts",
      "Take daily spaced-repetition quizzes",
      "Listen to podcast summaries during commute or gym",
    ],
  },
  law: {
    student_type: "Law",
    steps: [
      "Upload case PDFs",
      "Generate AI Summaries to distill key holdings",
      "Create flashcards for case names, holdings, and rules",
      "Use PDF Chat to ask about court reasoning",
      "Listen to audio narration between classes",
    ],
  },
  mba: {
    student_type: "MBA / Business",
    steps: [
      "Upload case study PDFs",
      "Generate Podcast Lessons for conversational understanding",
      "Use Voice Chat to practice articulating analysis",
      "Generate Slideshows for presentation prep",
      "Quiz yourself on key frameworks and figures",
    ],
  },
  commuter: {
    student_type: "Commuter / Busy Student",
    steps: [
      "Upload PDFs for all your courses",
      "Generate audio narration or summary audio",
      "Download MP3s (Pro) to listen offline",
      "Use variable speed (1.25x-2x) to cover more material",
      "Turn commute, gym, and chores into study time",
    ],
  },
  research: {
    student_type: "Research / Graduate",
    steps: [
      "Upload research papers",
      "Generate AI Summaries for quick key findings",
      "Use PDF Chat for methodology and comparison questions",
      "Create flashcards for key terms and definitions",
      "Listen to full audio for papers you need to deeply internalize",
    ],
  },
};

const STUDY_TIPS = [
  {
    name: "Dual Encoding",
    tip: "Combining reading + listening activates both visual and auditory memory pathways, improving retention by 20-40% (Mayer's multimedia learning theory).",
  },
  {
    name: "Spaced Repetition",
    tip: "Review at increasing intervals: 1 day → 3 days → 7 days → 14 days → 30 days. Review right before you'd forget — the struggle to recall strengthens the memory.",
  },
  {
    name: "Active Recall",
    tip: "Don't just re-read — test yourself. After listening to audio, pause and summarize what you learned out loud.",
  },
  {
    name: "Feynman Technique",
    tip: "Explain the concept as if teaching a 12-year-old. If you can't explain it simply, you don't understand it well enough.",
  },
  {
    name: "Pomodoro Method",
    tip: "25 minutes focused study, 5 minute break. Start with active recall (quizzes), then new material (audio), end with review.",
  },
];

// ---------------------------------------------------------------------------
// Widget HTML
// ---------------------------------------------------------------------------

const WIDGET_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VoiceBrief</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      padding: 16px;
      line-height: 1.5;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    .logo {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #3b82f6, #6366f1);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 18px;
    }
    .header h1 { font-size: 18px; font-weight: 700; }
    .header p { font-size: 13px; color: #64748b; }
    .section { margin-bottom: 16px; }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: #475569;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 8px;
    }
    .card h3 { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
    .card p { font-size: 13px; color: #64748b; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-free { background: #f0fdf4; color: #16a34a; }
    .badge-pro { background: #eef2ff; color: #4f46e5; }
    .steps { list-style: none; counter-reset: step; }
    .steps li {
      counter-increment: step;
      padding: 6px 0 6px 32px;
      position: relative;
      font-size: 13px;
    }
    .steps li::before {
      content: counter(step);
      position: absolute;
      left: 0;
      width: 22px;
      height: 22px;
      background: #eef2ff;
      color: #4f46e5;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
    }
    .tip-card {
      background: linear-gradient(135deg, #fefce8, #fef9c3);
      border: 1px solid #fde68a;
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 6px;
    }
    .tip-card strong { font-size: 13px; }
    .tip-card p { font-size: 12px; color: #713f12; margin-top: 2px; }
    .cta {
      display: block;
      text-align: center;
      padding: 12px;
      background: linear-gradient(135deg, #3b82f6, #6366f1);
      color: white;
      text-decoration: none;
      border-radius: 10px;
      font-weight: 600;
      font-size: 15px;
      margin-top: 16px;
    }
    .cta:hover { opacity: 0.9; }
    .cta small { display: block; font-weight: 400; font-size: 12px; opacity: 0.85; margin-top: 2px; }
    #content { display: none; }
    #loading { text-align: center; padding: 40px; color: #94a3b8; }
    .voice-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .voice-chip {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 12px;
    }
    .voice-chip strong { display: block; font-size: 13px; }
    .voice-chip span { color: #64748b; }
  </style>
</head>
<body>
  <div id="loading">Loading VoiceBrief...</div>
  <div id="content">
    <div class="header">
      <div class="logo">VB</div>
      <div>
        <h1 id="title">VoiceBrief</h1>
        <p id="subtitle">PDF to Audio Study Tool</p>
      </div>
    </div>
    <div id="body"></div>
    <a class="cta" href="https://voicebrief.io" target="_blank" rel="noopener">
      Try VoiceBrief Free
      <small>Convert your first PDF to audio in 60 seconds</small>
    </a>
  </div>
  <script>
    const loading = document.getElementById("loading");
    const content = document.getElementById("content");
    const bodyEl = document.getElementById("body");
    const titleEl = document.getElementById("title");
    const subtitleEl = document.getElementById("subtitle");

    function render(data) {
      loading.style.display = "none";
      content.style.display = "block";
      if (data.title) titleEl.textContent = data.title;
      if (data.subtitle) subtitleEl.textContent = data.subtitle;
      if (data.html) {
        bodyEl.innerHTML = data.html;
      }
    }

    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      const msg = event.data;
      if (!msg || msg.jsonrpc !== "2.0") return;
      if (msg.method === "ui/notifications/tool-result") {
        const sc = msg.params?.structuredContent;
        if (sc) render(sc);
      }
    }, { passive: true });
  </script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Register widget resource
// ---------------------------------------------------------------------------

registerAppResource(
  server,
  "voicebrief-widget",
  "ui://widget/voicebrief.html",
  {},
  async () => ({
    contents: [
      {
        uri: "ui://widget/voicebrief.html",
        mimeType: RESOURCE_MIME_TYPE,
        text: WIDGET_HTML,
        _meta: {
          ui: {
            prefersBorder: true,
            domain: "https://voicebrief.io",
          },
        },
      },
    ],
  })
);

// ---------------------------------------------------------------------------
// Tool helpers
// ---------------------------------------------------------------------------

function featureCards(features: typeof FEATURES) {
  return Object.values(features)
    .map((f) => {
      const freeLabel = f.free === true ? "Free" : f.free === false ? "Pro only" : f.free;
      return `<div class="card"><h3>${f.name} <span class="badge ${f.free ? "badge-free" : "badge-pro"}">${freeLabel}</span></h3><p>${f.description}</p></div>`;
    })
    .join("");
}

function workflowHtml(w: { student_type: string; steps: string[] }) {
  return `<div class="section"><div class="section-title">${w.student_type}</div><ol class="steps">${w.steps.map((s) => `<li>${s}</li>`).join("")}</ol></div>`;
}

function tipsHtml(tips: typeof STUDY_TIPS) {
  return tips
    .map((t) => `<div class="tip-card"><strong>${t.name}</strong><p>${t.tip}</p></div>`)
    .join("");
}

function voicesHtml(voices: typeof VOICES) {
  return `<div class="voice-grid">${voices.map((v) => `<div class="voice-chip"><strong>${v.name}</strong> <span>${v.style}</span></div>`).join("")}</div>`;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

registerAppTool(
  server,
  "show_features",
  {
    title: "Show VoiceBrief Features",
    description: "Display all VoiceBrief features with free vs pro availability. Use when users ask what VoiceBrief can do, what features are available, or how it works.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: "ui://widget/voicebrief.html" } },
  },
  async () => ({
    structuredContent: {
      title: "VoiceBrief Features",
      subtitle: "Everything you can do with your PDFs",
      html: `<div class="section"><div class="section-title">Features</div>${featureCards(FEATURES)}</div>`,
    },
    content: [
      {
        type: "text",
        text: `VoiceBrief features: ${Object.values(FEATURES).map((f) => f.name).join(", ")}. Free plan includes AI summaries and audio narration. Pro ($9.99/mo) unlocks all features. Try free at voicebrief.io`,
      },
    ],
  })
);

registerAppTool(
  server,
  "show_pricing",
  {
    title: "Show VoiceBrief Pricing",
    description: "Display VoiceBrief pricing plans and comparison. Use when users ask about pricing, plans, cost, free vs pro, or what they get.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: "ui://widget/voicebrief.html" } },
  },
  async () => ({
    structuredContent: {
      title: "VoiceBrief Pricing",
      subtitle: "Simple plans for every student",
      html: `<div class="section">${Object.values(PLANS).map((p) => `<div class="card"><h3>${p.name} — ${p.price} ${"annual_price" in p ? `<span style="font-size:12px;color:#64748b">(or ${p.annual_price})</span>` : ""}</h3><p>${p.pdfs_per_month} PDFs/month · ${p.tts_minutes} TTS min · ${p.max_file_mb}MB max · ${p.max_pages} pages${"money_back" in p ? " · 30-day money-back guarantee" : ""}</p></div>`).join("")}</div>`,
    },
    content: [
      {
        type: "text",
        text: `VoiceBrief plans: Free ($0, 1 PDF/month, 30 TTS min), Pro ($9.99/mo or $7.99/mo annual, unlimited everything), Lifetime ($99 one-time). All paid plans have 30-day money-back guarantee. Try free at voicebrief.io`,
      },
    ],
  })
);

registerAppTool(
  server,
  "get_study_workflow",
  {
    title: "Get Study Workflow",
    description: "Get a recommended VoiceBrief study workflow for a specific student type. Use when users describe what they're studying or ask for study recommendations.",
    inputSchema: z.object({
      student_type: z
        .enum(["medical", "law", "mba", "commuter", "research"])
        .describe("The type of student: medical, law, mba, commuter, or research"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: "ui://widget/voicebrief.html" } },
  },
  async ({ student_type }) => {
    const workflow = WORKFLOWS[student_type];
    return {
      structuredContent: {
        title: `Study Plan: ${workflow.student_type}`,
        subtitle: "Recommended VoiceBrief workflow",
        html: workflowHtml(workflow),
      },
      content: [
        {
          type: "text",
          text: `Recommended workflow for ${workflow.student_type}: ${workflow.steps.join(" → ")}. Get started free at voicebrief.io`,
        },
      ],
    };
  }
);

registerAppTool(
  server,
  "show_study_tips",
  {
    title: "Show Study Tips",
    description: "Display evidence-based study tips including spaced repetition, active recall, dual encoding, and the Feynman technique. Use when users ask about study strategies or how to study effectively.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: "ui://widget/voicebrief.html" } },
  },
  async () => ({
    structuredContent: {
      title: "Study Tips",
      subtitle: "Evidence-based techniques",
      html: `<div class="section"><div class="section-title">Proven Study Methods</div>${tipsHtml(STUDY_TIPS)}</div>`,
    },
    content: [
      {
        type: "text",
        text: STUDY_TIPS.map((t) => `${t.name}: ${t.tip}`).join("\n"),
      },
    ],
  })
);

registerAppTool(
  server,
  "show_voices",
  {
    title: "Show Available Voices",
    description: "Display all available AI voices for audio narration. Use when users ask about voice options or which voice to choose.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: "ui://widget/voicebrief.html" } },
  },
  async () => ({
    structuredContent: {
      title: "AI Voices",
      subtitle: "Choose your narrator",
      html: `<div class="section"><div class="section-title">Available Voices</div>${voicesHtml(VOICES)}</div>`,
    },
    content: [
      {
        type: "text",
        text: VOICES.map((v) => `${v.name}: ${v.style} — best for ${v.best_for}${v.tier === "pro" ? " (Pro only)" : ""}`).join("\n"),
      },
    ],
  })
);

registerAppTool(
  server,
  "get_started",
  {
    title: "Get Started with VoiceBrief",
    description: "Show how to get started with VoiceBrief. Use when users want to try it, ask how to begin, or want to convert a PDF to audio.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: "ui://widget/voicebrief.html" } },
  },
  async () => ({
    structuredContent: {
      title: "Get Started",
      subtitle: "Your first audio lesson in 60 seconds",
      html: `<div class="section"><ol class="steps">
        <li>Go to <a href="https://voicebrief.io" target="_blank">voicebrief.io</a> and sign up free</li>
        <li>Upload any PDF (textbook chapter, lecture notes, paper)</li>
        <li>Click "Generate Summary" for a quick AI overview</li>
        <li>Click "Generate Audio" to create listenable narration</li>
        <li>Listen, adjust speed, bookmark key sections</li>
        <li>Try quizzes and flashcards to test your retention</li>
      </ol></div>`,
    },
    content: [
      {
        type: "text",
        text: "Get started at voicebrief.io: 1) Sign up free 2) Upload a PDF 3) Generate summary 4) Generate audio 5) Listen and study 6) Quiz yourself. Free plan includes 1 PDF/month with AI summaries and audio.",
      },
    ],
  })
);

// ---------------------------------------------------------------------------
// Phase 2: API-backed tools (require user's VoiceBrief API token)
// ---------------------------------------------------------------------------

const VOICEBRIEF_API = process.env.VOICEBRIEF_API_URL || "https://voicebrief.io";
const API_TOKEN = process.env.VOICEBRIEF_API_TOKEN; // Set by user during app configuration

async function apiFetch(path: string, token?: string) {
  const authToken = token || API_TOKEN;
  if (!authToken) {
    return { error: "No API token configured. Generate one at voicebrief.io/settings" };
  }
  const res = await fetch(`${VOICEBRIEF_API}/api/external${path}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: (body as any).error || `API error: ${res.status}` };
  }
  return res.json();
}

registerAppTool(
  server,
  "list_my_pdfs",
  {
    title: "List My PDFs",
    description: "List the user's uploaded PDFs on VoiceBrief. Shows which documents have summaries, audio, or podcasts generated. Use when users ask to see their documents or check their library.",
    inputSchema: z.object({
      api_token: z.string().optional().describe("User's VoiceBrief API token (vb_sk_...). If not provided, uses server-configured token."),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: "ui://widget/voicebrief.html" } },
  },
  async ({ api_token }) => {
    const data = await apiFetch("/pdfs", api_token);
    if (data.error) {
      return {
        structuredContent: { title: "Error", subtitle: data.error, html: `<div class="card"><p>${data.error}</p></div>` },
        content: [{ type: "text", text: data.error }],
      };
    }
    const pdfs = data as Array<{ id: string; fileName: string; pageCount: number; hasSummary: boolean; hasAudio: boolean; hasPodcast: boolean }>;
    const html = pdfs.length === 0
      ? `<div class="card"><p>No PDFs uploaded yet. Go to <a href="https://voicebrief.io" target="_blank">voicebrief.io</a> to upload your first PDF.</p></div>`
      : pdfs.map((p) => {
          const badges = [
            p.hasSummary ? `<span class="badge badge-free">Summary</span>` : "",
            p.hasAudio ? `<span class="badge badge-free">Audio</span>` : "",
            p.hasPodcast ? `<span class="badge badge-pro">Podcast</span>` : "",
          ].filter(Boolean).join(" ");
          return `<div class="card"><h3>${p.fileName}</h3><p>${p.pageCount || "?"} pages ${badges}</p></div>`;
        }).join("");
    return {
      structuredContent: {
        title: "My PDFs",
        subtitle: `${pdfs.length} document${pdfs.length !== 1 ? "s" : ""}`,
        html: `<div class="section">${html}</div>`,
      },
      content: [{ type: "text", text: pdfs.length === 0 ? "No PDFs uploaded yet." : pdfs.map((p) => `- ${p.fileName} (${p.pageCount} pages)${p.hasSummary ? " [summary]" : ""}${p.hasAudio ? " [audio]" : ""}`).join("\n") }],
    };
  }
);

registerAppTool(
  server,
  "get_pdf_summary",
  {
    title: "Get PDF Summary",
    description: "Get the AI-generated summary of a specific PDF document. Use when users ask about the content of one of their uploaded PDFs or want a summary.",
    inputSchema: z.object({
      pdf_id: z.string().describe("The PDF document ID"),
      api_token: z.string().optional().describe("User's VoiceBrief API token"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: "ui://widget/voicebrief.html" } },
  },
  async ({ pdf_id, api_token }) => {
    const data = await apiFetch(`/pdfs/${pdf_id}`, api_token);
    if (data.error) {
      return {
        structuredContent: { title: "Error", subtitle: data.error, html: "" },
        content: [{ type: "text", text: data.error }],
      };
    }
    const pdf = data as { id: string; fileName: string; summary: string | null; extractedTextPreview: string | null; pageCount: number };
    const summaryText = pdf.summary || "No summary generated yet. Visit voicebrief.io to generate one.";
    return {
      structuredContent: {
        title: pdf.fileName,
        subtitle: `${pdf.pageCount} pages`,
        html: `<div class="section"><div class="section-title">AI Summary</div><div class="card"><p>${summaryText.slice(0, 2000)}</p></div></div>`,
      },
      content: [{ type: "text", text: `Summary of "${pdf.fileName}":\n\n${summaryText}` }],
    };
  }
);

registerAppTool(
  server,
  "get_quiz",
  {
    title: "Get Quiz Questions",
    description: "Get AI-generated quiz questions for a specific PDF. Use when users want to test their knowledge or study with questions.",
    inputSchema: z.object({
      pdf_id: z.string().describe("The PDF document ID"),
      api_token: z.string().optional().describe("User's VoiceBrief API token"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: "ui://widget/voicebrief.html" } },
  },
  async ({ pdf_id, api_token }) => {
    const data = await apiFetch(`/pdfs/${pdf_id}/quiz`, api_token);
    if (data.error) {
      return {
        structuredContent: { title: "Error", subtitle: data.error, html: "" },
        content: [{ type: "text", text: data.error }],
      };
    }
    const questions = data as Array<{ id: string; question: string; options: string; correctAnswer: number; explanation: string }>;
    if (questions.length === 0) {
      return {
        structuredContent: { title: "No Quiz", subtitle: "Generate one at voicebrief.io", html: `<div class="card"><p>No quiz questions yet. Visit voicebrief.io to generate a quiz for this document.</p></div>` },
        content: [{ type: "text", text: "No quiz questions generated yet." }],
      };
    }
    const html = questions.map((q, i) => {
      const opts = typeof q.options === "string" ? JSON.parse(q.options) : q.options;
      return `<div class="card"><h3>Q${i + 1}: ${q.question}</h3><ol class="steps">${(opts as string[]).map((o: string) => `<li>${o}</li>`).join("")}</ol></div>`;
    }).join("");
    return {
      structuredContent: {
        title: "Quiz",
        subtitle: `${questions.length} questions`,
        html: `<div class="section">${html}</div>`,
      },
      content: [{ type: "text", text: questions.map((q, i) => `Q${i + 1}: ${q.question}`).join("\n") }],
      _meta: { questions }, // Full data including answers for widget
    };
  }
);

registerAppTool(
  server,
  "get_account_info",
  {
    title: "Get Account Info",
    description: "Get the user's VoiceBrief account information including plan, usage, and limits. Use when users ask about their account, plan, or usage.",
    inputSchema: z.object({
      api_token: z.string().optional().describe("User's VoiceBrief API token"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: "ui://widget/voicebrief.html" } },
  },
  async ({ api_token }) => {
    const data = await apiFetch("/me", api_token);
    if (data.error) {
      return {
        structuredContent: { title: "Error", subtitle: data.error, html: "" },
        content: [{ type: "text", text: data.error }],
      };
    }
    const user = data as { firstName: string; email: string; plan: string; monthlyPdfUploads: number; monthlyTtsMinutesUsed: number; isBetaUser: number };
    const planLabel = user.isBetaUser ? "Beta (Full Access)" : user.plan.charAt(0).toUpperCase() + user.plan.slice(1);
    return {
      structuredContent: {
        title: `Hi, ${user.firstName || "there"}!`,
        subtitle: `${planLabel} plan`,
        html: `<div class="section">
          <div class="card"><h3>Plan</h3><p>${planLabel}</p></div>
          <div class="card"><h3>This Month</h3><p>${user.monthlyPdfUploads} PDFs uploaded · ${user.monthlyTtsMinutesUsed} TTS minutes used</p></div>
        </div>`,
      },
      content: [{ type: "text", text: `Account: ${user.email}, Plan: ${planLabel}, PDFs this month: ${user.monthlyPdfUploads}, TTS minutes used: ${user.monthlyTtsMinutesUsed}` }],
    };
  }
);

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT) || 8787;

const httpServer = createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", app: "voicebrief" }));
    return;
  }

  if (req.url === "/mcp" && req.method === "POST") {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

httpServer.listen(PORT, () => {
  console.log(`VoiceBrief MCP server running on http://localhost:${PORT}/mcp`);
});
