import type { BaseMessage } from "langchain";

export function lastMessageText(result: { messages: BaseMessage[] }): string {
    const content = result.messages.at(-1)?.content;
    return typeof content === "string" ? content : JSON.stringify(content ?? "");
}