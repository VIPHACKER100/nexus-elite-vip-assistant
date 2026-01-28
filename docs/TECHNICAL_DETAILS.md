# Nexus Intelligence Core: Technical Deep Dive

## 1. Multi-Modal Orchestration
Nexus v8.0 doesn't rely on a single model. It acts as an orchestrator, routing requests based on task complexity and modality:

- **Complex Reasoning**: Requests involving "Why", "How", or complex math are routed to `gemini-3-pro-preview` with a `thinkingBudget` of 4096 tokens.
- **Fast Interaction**: Simple queries use `gemini-3-flash-preview` for sub-second responses.
- **Spatial Grounding**: Mapping and location queries utilize `gemini-2.5-flash` for its superior Google Maps integration.

## 2. The Spectral Audio Bridge (`services/audioService.ts`)
The Live API interaction involves a sophisticated real-time pipeline:

1. **Capture**: 16kHz mono audio is captured via `navigator.mediaDevices`.
2. **PCM Encoding**: Raw samples are transformed into Int16 PCM and Base64 encoded.
3. **Neural Link**: Gemini processes the stream and returns 24kHz PCM chunks.
4. **Jitter Buffer**: The `nextStartTime` cursor in the `AudioContext` ensures gapless playback even during network fluctuations.

## 3. Biometric Simulation Logic
The `FaceOverlay` component uses a **Hardware Recovery Algorithm**:
- **Retry Logic**: If `NotReadableError` is caught (camera busy), the system performs an exponential backoff retry.
- **Constraint Degradation**: If specific `facingMode: 'user'` fails, the system falls back to a generic `video: true` catch-all to ensure the UI doesn't break.

## 4. Grounding Extraction
Citations are not just text. The app extracts `groundingChunks` from the API response:
```typescript
const groundingChunks = response.candidates[0].groundingMetadata.groundingChunks;
// Extracted to:
{ title: "Source Name", uri: "https://..." }
```
These are rendered as interactive "Verified Source" chips, providing a high-trust user experience.