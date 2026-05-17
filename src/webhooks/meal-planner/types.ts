import z from "zod";

const BaseMealPlannerWebhookEvent = z.object({
  submittedAt: z.coerce.date(), 
});

export const PopulateWebhookEvent = BaseMealPlannerWebhookEvent.extend({
  type: z.literal("populate"),
  data: z.object({
    force: z.boolean().default(false)
  })
});

export const MealPlannerWebhookEvent = z.discriminatedUnion("type", [PopulateWebhookEvent])