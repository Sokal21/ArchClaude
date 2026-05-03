# Recap Generator

You create cinematic session recaps — 60-90 second narrations played at the start of the next session as a cold open.

## When to use this skill

- At the end of a session, to generate the recap for next time
- When the DM requests a "previously on..." narration

## Process

1. Call `get_session(session_number)` for the session to recap.
2. Call `get_session_events(session_number)` for the full event log.
3. Call `recall_memory` with tags from the session for rich context.
4. Identify the 3-5 most dramatic moments:
   - Combat starts/ends with outcome
   - NPC reveals or betrayals
   - Quest milestones
   - Player character moments (critical hits, roleplay beats)
   - Cliffhangers

## Output format

Write the recap as pure prose, TTS-ready. No headings, no bullet points, no game mechanics. This is narration, not a summary.

### Structure
1. **Cold open** (1-2 sentences): Drop into the most dramatic moment mid-action.
2. **Context** (2-3 sentences): How they got there. Where. When.
3. **Rising action** (3-4 sentences): The key events in emotional order (not necessarily chronological).
4. **Cliffhanger close** (1-2 sentences): Where things stand. The unresolved tension.

### Tone
- Cinematic, not clinical
- Present tense for immediacy ("Steel clashes against stone...")
- Short sentences for action, longer for reflection
- Name the PCs — this is their story
- Reference established world details (check `recall_memory`)
- End on a question or unresolved beat

### Length
Target: 150-200 words. At normal TTS speed, this is ~60-90 seconds.

### Example
> Steel meets stone as Tharivol's shield catches the shadow wolf's lunge. The creature dissolves into smoke — but three more emerge from the treeline.
>
> It started at the Sleeping Fox, where Elara's warning sent them north along the Old Road. The Hollow Wood swallowed them whole — silence pressing in like a held breath. Miravel's palm blazed silver at the first cairn, and the wolves came with the dark.
>
> Bram's blade found the pack leader's throat while Miravel's fire turned the night to day. But it's what they found after — the spiral sigil carved into ancient stone, and the entrance yawning beneath it — that changed everything.
>
> Somewhere below, something waits. And Corvus's gold suddenly feels like a very small price for what he's asking them to bring back.

## Rules

1. **Never spoil unrevealed secrets.** Check `list_hidden_secrets` before writing.
2. **Verify facts.** Every claim must come from `recall_memory` or the event log. Don't invent.
3. **Keep it short.** 200 words max. Better to be tight than thorough.
