import type { onBoardingDoc } from "../schemas/on_boarding_doc_schema.ts";

export function generateMarkdownFromDoc(doc: onBoardingDoc): string {
    const sections = doc.sections
        .map((s) => `## ${s.heading}\n\n${s.content}`)
        .join("\n\n");
    return `# ${doc.title}\n\n${sections}`;
}