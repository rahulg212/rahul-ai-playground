# Rahul's AI Nexus — Multi-Model LLM Arena & Playground

A fast, private, local-first playground & multi-model arena to chat, test, stream, and race models from **OpenAI**, **Anthropic Claude**, **Google Gemini**, and **OpenRouter** directly in your browser.

🌐 **Live GitHub Pages URL:** [https://rg212.github.io/rahul-ai-playground/](https://rg212.github.io/rahul-ai-playground/)

---

## ⚡ 10x Improvements & Key Capabilities

- **Zero-Backend Direct Browser Streaming**: 100% client-side architecture. Provider calls stream directly from the browser to Gemini, OpenRouter, and Claude without needing any intermediate Node.js server or proxy. Zero latency, zero server hosting costs, and 100% private.
- **Interactive Code Artifacts & HTML/SVG Live Preview**: Whenever an AI responds with HTML, SVG, or interactive code, toggle seamlessly between **Code** and **Live Preview** to run and inspect the live interactive UI right inside the chat (like Claude Artifacts and ChatGPT Canvas).
- **Voice Dictation (Speech-to-Text)**: Speak your prompts directly using the browser's native Web Speech API with real-time transcription and microphone feedback.
- **Text-to-Speech (Audio Read Aloud)**: Click the speaker button on any assistant message to listen to the response spoken aloud using native speech synthesis.
- **Synthesized Audio Effects**: Native Web Audio API sound effects for message send blips and completion chimes (can be muted anytime in the top bar or settings).
- **Model Arena (Race Mode)**: Fire the same prompt across up to 3 models simultaneously in parallel, observe live streaming progress, and automatically grade and select the best candidate.
- **Quality Score Engine ("Tastemaker")**: Every AI response is automatically evaluated on structure, completeness, directness, richness, and speed with an objective 0–100 score and grade badge.
- **Liquid Refine (Version Navigator)**: One-click iterative refinement to prompt the same model to improve its output while preserving full version history (v1, v2, v3...).
- **Prompt Starter Cards**: Clean empty state with high-value starter prompts across Coding, UI Design, Deep Reasoning, and AI Analysis.
- **Persona Quick-Switcher**: One-click top-bar switcher for curated personas (Code Expert, Concise, Teacher, Creative, Analyst) with calibrated temperature and system instructions.
- **Full Privacy & Storage**: All API keys, conversations, and presets are saved locally in browser `localStorage`. No keys ever touch a 3rd party backend.
- **Three Immersive Themes**: Light, Dark, and retro green-on-black phosphor Terminal mode with scanlines and glowing JetBrains Mono typography.

---

## 🚀 Supported Providers

1. **OpenRouter**:
   - One-click **"Login with OpenRouter"** (OAuth PKCE flow — no copy-pasting required).
   - Instant access to completely free models (`:free`) such as DeepSeek, Llama 3.3, and Qwen with zero credit card required.
   - Public models directory search with context size and token pricing info.
2. **Google Gemini**:
   - Direct browser streaming via Gemini 2.5 / 1.5 Flash and Pro models.
   - High speed and generous free tiers via Google AI Studio.
3. **Anthropic Claude**:
   - Claude 3.5 Sonnet, Haiku, and Opus.
   - Full support for extended thinking / reasoning tokens.
   - Official direct browser CORS with `anthropic-dangerous-direct-browser-access`.
4. **OpenAI**:
   - GPT-4o, GPT-4o-mini, o1, o3-mini, and custom model IDs.
   - Direct browser mode or optional custom CORS proxy URL configurable in Settings.

---

## 🛠️ Getting Started Locally

Prerequisites: Node.js 18.18+

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Static Build (for GitHub Pages / Hosting)

```bash
# Build static export
npm run build
```

This exports pure static HTML/CSS/JS into the `out/` folder, ready for deployment to GitHub Pages, Cloudflare Pages, Netlify, Vercel, or any static host.

---

## 📦 Automated GitHub Pages Deployment

The repository includes a ready-to-use GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically builds and publishes the site to GitHub Pages on every push to `main`.
