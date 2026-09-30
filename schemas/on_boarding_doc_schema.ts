import z from "zod";

const onBoardingDocSchema = z.object({
    title: z.string(),
    sections: z.array(z.object({ heading: z.string(), content: z.string() })),
});

export type onBoardingDoc = z.infer<typeof onBoardingDocSchema>;

export default onBoardingDocSchema;