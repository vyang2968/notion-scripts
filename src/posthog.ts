import { PostHog } from "posthog-node";

export function createPosthogClient(env: {
  POSTHOG_API_KEY?: string;
  POSTHOG_HOST?: string;
}) {
  if (!env.POSTHOG_API_KEY) return null;
  return new PostHog(env.POSTHOG_API_KEY, {
    host: env.POSTHOG_HOST || "https://us.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });
}
