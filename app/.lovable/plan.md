# Rename "Map" nav to "Ask A Bird" + verify chat

## Chat status

The chatbot is already fully wired and working. The recent network log shows the streaming `bird-chat` edge function returning HTTP 200 with token-by-token chunks (e.g. the Great-tailed Grackle replied just a few minutes ago: *"Caw! Welcome to my favorite parking lot!…"*). No runtime errors are reported. So no chat fix is needed — the requirement is just to **rename the nav item** so it points users to the chat experience.

## What changes

In `src/components/Layout.tsx`:

- Replace the nav item `{ to: "/", icon: Map, label: "Map" }` with `{ to: "/", icon: Bird, label: "Ask A Bird" }`.
- Drop the unused `Map` import from `lucide-react` and keep `Bird` (already imported for the brand).

That's it — the route, the page, and the chatbot itself are unchanged.

## Files touched

- `src/components/Layout.tsx` — rename nav label, swap icon.

## After this

Header order will read: **Ask A Bird · Find a Spot · Our Story**, with the chat-enabled map page now clearly labelled.
