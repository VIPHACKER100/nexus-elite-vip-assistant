# Nexus VIP API Reference

## Gemini Service (`services/geminiService.ts`)

### `generateAssistantResponseStream`
Streaming reasoning response for the main chat.
- **Params**: `prompt: string`, `history: Message[]`, `onChunk: (text: string) => void`
- **Model**: `gemini-3-pro-preview`

### `generateAssistantResponse`
Grounding-enabled static response.
- **Params**: `prompt: string`, `history: Message[]`, `useSearch: boolean`, `useMaps: boolean`
- **Model**: Dynamic (Flash or Pro)

### `generateVideo`
Cinematic video synthesis.
- **Params**: `prompt: string`
- **Model**: `veo-3.1-fast-generate-preview`

---

## Function Registry (`constants.tsx`)

The `FUNCTION_REGISTRY` allows for modular expansion of the assistant's capabilities. Each function follows the `AIFunction` interface:

```typescript
interface AIFunction {
  id: string;
  name: string;
  category: FunctionCategory;
  description: string;
  icon: string; // FontAwesome 6 class
  color: string; // Tailwind bg- class
}
```

---

## Live Voice Commands (`components/VoiceOverlay.tsx`)

Voice control is handled via `FunctionDeclaration`. Current supported tools:
- `authenticate_user`: Triggers Face ID.
- `navigate_to`: Destination switch (`chat`, `functions`, `profile`).
- `close_voice_control`: Cleanup and exit.