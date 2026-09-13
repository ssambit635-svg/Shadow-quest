/** Small, local keyword guide. No messages, account data, or API keys leave the device. */
export const MIZU_REPLIES = {
  welcome: {
    text: "Konnichiwa! I’m Mizu, your little samurai guide. Welcome to Shadow Quest, where real action creates real growth. Turn your goals into daily quests, stay focused, and build your streak one day at a time. New here? Start with one small task you can finish today. You don’t have to be perfect. Just show up! I’ll be right here in the corner if you need a little guidance. Ready for your first quest?",
    audio: "welcome",
  },
  start: {
    text: "Start small, samurai! Open the app, sign in, and add one task to your daily list. Make it something you can actually finish today. Complete real work, then mark it done. One honest step is better than ten perfect plans.",
    audio: "start",
  },
  focus: {
    text: "Need a quiet mind? Try Deep Work. Choose a focus technique, set aside distractions, and give one task your full attention. Start with a short session. You can take a breath and build from there.",
    audio: "focus",
  },
  streak: {
    text: "Your streak is a reminder to keep showing up. Complete your real tasks and check your progress in the app. If you miss a day, don’t be hard on yourself. A fresh start still counts as courage.",
    audio: "streak",
  },
  motivation: {
    text: "Hey, you’ve got this. Even a samurai starts with one small practice. Pick the easiest useful thing, work on it for five minutes, and celebrate showing up. Real action. Real growth. I’m cheering for you!",
    audio: "motivation",
  },
  hello: {
    text: "Konnichiwa, friend! I’m Mizu, your little samurai guide. How’s your day going? I can help with getting started, focus sessions, streaks, or a little encouragement. I’m a simple scripted guide, not an AI chat service.",
    audio: "hello",
  },
  fallback: {
    text: "That’s beyond my little guidebook! I’m a scripted helper, not an LLM. Try asking about tasks, focus, streaks, or motivation using the buttons below. Your message stays on this device.",
    audio: null,
  },
} as const;

export type MizuTopic = keyof typeof MIZU_REPLIES;

export function matchMizuReply(input: string): MizuTopic {
  const text = input.toLowerCase().trim();
  if (/\b(focus|pomodoro|deep work|timer|study|padhai|concentrat\w*)\b/.test(text)) return "focus";
  if (/\b(streak\w*|progress|point\w*|xp|habit\w*)\b/.test(text)) return "streak";
  if (/\b(motivat\w*|sad|tired|lazy|encourag\w*|stuck|overwhelm\w*|demotivat\w*)\b/.test(text)) return "motivation";
  if (/\b(start\w*|begin\w*|task\w*|quest\w*|login|sign in|goal\w*|shuru)\b/.test(text)) return "start";
  if (/\b(about|website|site|welcome|intro\w*)\b/.test(text)) return "welcome";
  if (/\b(hi|hey|hello|namaste|konnichiwa|mizu|thanks|thank you|kaise|how are you)\b/.test(text)) return "hello";
  return "fallback";
}
