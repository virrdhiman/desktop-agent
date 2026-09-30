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
| **Free Official** | Official APIs with a free tier or signup credits, for example Groq, Cerebras, SambaNova, Google Gemini, GitHub Models, OpenRouter, Mistral, and Hugging Face. Some, such as DeepSeek, Together, and Fireworks, are credit-based rather than permanently free. | Yes, when they have a key |
| **Local** | Ollama, LM Studio, and llama.cpp running on your machine | No |
| **Community** | Unofficial third-party proxies. **They receive your prompts and code.** | No |
| **Image/Video** | Image and video generation services. Not chat providers. | No |
| **Paid** | OpenAI, Anthropic, Cohere, and Perplexity, billed by the provider | No |

## Recommended starting points

| Provider | Get a key | Notes |
|----------|-----------|-------|
| Groq | [console.groq.com/keys](https://console.groq.com/keys) | Fast. Keys start with `gsk_`. |
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Keys start with `AIza`. Also used by the `image_analysis` tool. |
| OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) | With a free key, VD Agent only picks models whose ID ends in `:free`. |
| Cerebras | [cloud.cerebras.ai](https://cloud.cerebras.ai/) | Fast inference with rate limits. |
| GitHub Models | [github.com/settings/tokens](https://github.com/settings/tokens) | Uses a GitHub personal access token. See GitHub's Models docs for the required permission. |
| Hugging Face | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) | Router with monthly free credits. Tokens start with `hf_`. |

To add a key: **Settings →** select the provider **→ Get API Key →** paste the key **→ Save**. Selecting a provider in the list also makes it the active provider, marked with ●.

## Local models (no key)

| Server | Default URL | Setup |
|--------|-------------|-------|
| Ollama | `http://localhost:11434/v1` | [Install](https://ollama.com/download), then `ollama pull llama3.3` |
| LM Studio | `http://localhost:1234/v1` | [Install](https://lmstudio.ai/), load a model, and start the local server |
| llama.cpp | `http://localhost:8080/v1` | Run [`llama-server`](https://github.com/ggml-org/llama.cpp) |

Set the model name in Settings to a model you have installed. Local models keep prompts on your machine. Coding quality depends on the model size your hardware can run.

## How model selection works

For OpenAI-compatible providers, on each request:

1. VD Agent lists the models your key can call (`/models`, 8-second timeout, cached for 10 minutes).
2. It drops non-chat models: embeddings, rerank, moderation, audio, speech, transcription, image, and video.
3. It ranks the rest by coding quality, then efficiency. Previews and very small models rank lower.
4. It tries the best model first, then the next few, and the model set in Settings last.
5. It moves to the next model on 404, 429, 503, overload, capacity, quota, model-not-found, and unsupported-model errors.
6. On an invalid key (401 or an auth error) it **stops** and tells you, without trying other models or providers.
7. The model that worked is saved as the provider's model, unless you pinned one.

**Pin a model**: pick it from the model menu in the Agent header, which lists the models discovered for the active provider. Choose **Auto** to go back to automatic selection.

**Anthropic** uses its own Messages API and has no model discovery, so VD Agent uses the model set in Settings.

## Provider fallback

If the active provider fails for a reason other than an invalid key, VD Agent tries up to three other **Free Official** providers that have keys, in catalog order. Fallback happens automatically. If every provider fails, the chat shows the last error. Local servers, community proxies, image/video services, and paid providers are only used when you make them the active provider.

## Community proxies

Community entries are unofficial services run by third parties. They see everything you send, including code, and may be unreliable or disappear. Settings shows a warning for them. Don't use them for private or proprietary code.

## Adding a provider (developers)

See [ARCHITECTURE.md → Add a provider](../ARCHITECTURE.md#add-a-provider).
