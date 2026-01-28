# Mobile Optimization Standards

Nexus VIP is a **Mobile-First Progressive Web App**. To maintain its world-class feel, the following standards must be upheld:

## 1. Safe Area Insets
The UI must use `env(safe-area-inset-*)` variables.
- **Header**: Padding-top handles the Dynamic Island/Notch.
- **Footer**: `safe-bottom` class ensures the home indicator doesn't overlap input fields.

## 2. Touch Interactivity
- **Hit Area**: Minimum `48px` for all buttons.
- **Feedback**: Every click must have an `active:scale-95` transition for haptic visual feedback.
- **Tap Highlight**: `-webkit-tap-highlight-color: transparent` is used to prevent the default grey box on iOS.

## 3. Performance Budgets
- **Bundle Size**: Initial JS must stay below **500KB**.
- **Images**: All generated assets use modern aspect ratios (`1:1`) to minimize layout shift.
- **Transitions**: CSS transforms only (`scale`, `translate`, `opacity`) to ensure 60fps on low-tier mobile GPUs.

## 4. Offline Resilience
The app is designed to load shell assets (CSS, Icons) instantly via CDN caching, even on high-latency 3G connections.