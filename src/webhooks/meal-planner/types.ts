import z from "zod";

const BaseMealPlannerWebhookEvent = z.object({
  submittedAt: z.coerce.date(),
});

export const PopulateWebhookEvent = BaseMealPlannerWebhookEvent.extend({
  type: z.literal("populate"),
  data: z.object({}),
});

export type PopulateWebhookEventType = z.infer<typeof PopulateWebhookEvent>;

export const MealPlannerWebhookEvent = z.discriminatedUnion("type", [
  PopulateWebhookEvent,
]);
export type MealPlannerWebhookEventType = z.infer<
  typeof MealPlannerWebhookEvent
>;
