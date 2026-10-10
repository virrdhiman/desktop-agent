<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# AI Providers

VD Agent talks to AI providers with API keys that you create on the provider's website. The full catalog, with counts per category, is in **Settings**. It is defined in `electron/handlers/settings.ts`, and new entries are added to existing installs automatically.

Free tiers, credits, and rate limits are set by each provider and change often. Check the provider's site for current terms.

## Categories

| Category in Settings | What it means | Used for automatic fallback? |
|----------------------|---------------|------------------------------|
| **Free Official** | Official APIs with a free tier or signup credits, for example Groq, Cerebras, SambaNova, Google Gemini, GitHub Models, OpenRouter, Mistral, NVIDIA NIM, and Hugging Face. Some, such as DeepSeek, Together, and Fireworks, are credit-based rather than permanently free. | Yes, when they have a key |
| **Local** | Ollama, LM Studio, llama.cpp, and other OpenAI-compatible servers on your machine | No |
| **Image/Video** | Official image and video APIs. Not chat providers. | No |
| **Paid** | OpenAI, Anthropic, Cohere, LLM7, Perplexity, and a custom OpenAI-compatible slot, billed by the provider | No |

## Recommended starting points

| Provider | Get a key | Notes |
|----------|-----------|-------|
| Groq | [console.groq.com/keys](https://console.groq.com/keys) | Fast. Keys start with `gsk_`. |
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Keys start with `AIza`. Also used by the `image_analysis` tool. |
| OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) | With a free key, VD Agent only picks models whose ID ends in `:free`. |
| Mistral AI | [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys/) | OpenAI-compatible chat endpoint. `mistral-large-latest` is the default fallback model, and live model refresh can replace it with the strongest model your key can call. |
| NVIDIA NIM | [build.nvidia.com](https://build.nvidia.com/) | OpenAI-compatible endpoint at `https://integrate.api.nvidia.com/v1`. |
| Cerebras | [cloud.cerebras.ai](https://cloud.cerebras.ai/) | Fast inference with rate limits. |
| GitHub Models | [github.com/settings/tokens](https://github.com/settings/tokens) | Uses a GitHub personal access token. See GitHub's Models docs for the required permission. |
| Hugging Face | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) | Router with monthly free credits. Tokens start with `hf_`. |

LLM7 can also be configured from Settings with `https://api.llm7.io/v1`, but
VD Agent treats it as a paid/credit provider and does not use it in automatic
free fallback.

For providers that are not in the catalog yet, use **Add compatible provider** in Settings.
Set the provider's `/v1` base URL, paste its key, set a starting model, then
click **Refresh Live Models**. If the provider supports `/models`, Auto will
rank the returned models and drop stale IDs the same way it does for built-in
providers. You can add multiple custom providers and choose whether each has
a free tier. Remove a custom provider in its settings to delete its saved key.

To add a key: **Settings →** select the provider **→ Get API Key →** paste the key **→ Save**. Selecting a provider in the list also makes it the active provider, marked with ●.

## Local models (no key)

| Server | Default URL | Setup |
|--------|-------------|-------|
| Ollama | `http://localhost:11434/v1` | [Install](https://ollama.com/download), then `ollama pull qwen2.5-coder:7b` |
| LM Studio | `http://localhost:1234/v1` | [Install](https://lmstudio.ai/), load a model, and start the local server |
| llama.cpp | `http://localhost:8080/v1` | Run [`llama-server`](https://github.com/ggml-org/llama.cpp) |

Set the model name in Settings to a model you have installed. Local models keep prompts on your machine. Coding quality depends on the model size your hardware can run.

## How model selection works

For OpenAI-compatible providers, on each request:

1. VD Agent lists the models your key can call (`/models`, 8-second timeout, cached for 10 minutes).
2. It drops non-chat models: embeddings, rerank, moderation, audio, speech, transcription, image, and video.
3. It ranks the rest by coding quality, budget, then efficiency. On free-tier aggregators with explicit `:free` model IDs, Auto stays on those models in every budget. To let Auto use other model IDs on such providers, enable **Allow paid model IDs** in Settings. Selecting a paid provider explicitly also allows its models. Providers without explicit free model IDs may still charge for usage; check their terms.
4. It tries the best model first, then the next few. If `/models` returns a usable list, stale saved model IDs are dropped instead of retried.
5. It moves to the next model on 404, 429, 503, overload, capacity, quota, model-not-found, unsupported-model, and intermediate empty-answer errors. A final empty answer goes through VD's corrective retry. Failed model IDs are cooled down for two minutes; explicitly retired IDs for an hour.
6. On an invalid key (401 or an auth error) it **stops** and tells you, without trying other models or providers.
7. The refreshed live model list and the model that worked are saved, unless you pinned one.

When **Auto** is selected, VD Agent does not cling to an expired or deprecated saved model. If live discovery returns a usable list, that list becomes the source of truth. If discovery is temporarily unavailable but a previous live list is saved, Auto still tries the saved live models in ranked order before failing over to another provider.

**Pin a model**: pick it from the model menu in the Agent header, which lists the models discovered for the active provider. Choose **Auto** to go back to automatic selection.

**Anthropic** uses its own Messages API and has no model discovery, so VD Agent uses the model set in Settings.

Screenshots pasted or dropped into the current chat request are sent as image content
to compatible chat models. VD converts the same request for Anthropic's Messages API.
It accepts up to four PNG, JPEG, WebP, or GIF images totaling 10 MB. Saved chat
history keeps attachment names; the image bytes are used only for the current
request and are not stored in the text history.

## Provider fallback

If the active provider fails for a reason other than an invalid key, VD Agent tries compatible fallbacks with keys. Free providers fall back only to other **Free Official** providers so Auto does not spend money unexpectedly. Paid providers are used only when you intentionally select one; then VD can fall back across your configured paid and free providers. The active provider remains first and fallbacks are ordered by locally observed reliability and latency; repeated failures create a short cooldown. When another provider answers, the chat says which one, and the rest of that request stays on it. If every provider fails, the chat lists each provider's error with next steps. Local servers and image/video services are only used when you make them the active provider.

The catalog does not include unofficial or reverse-engineered proxies. Older settings files drop those entries on the next load. If one of them was the active provider, VD Agent switches back to Groq.

## Adding a provider (developers)

See [ARCHITECTURE.md → Add a provider](../ARCHITECTURE.md#add-a-provider).
