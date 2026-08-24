# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

## Communication
- User communicates in Spanish; respond and write commit messages/PR text in Spanish unless asked otherwise. Confidence: 0.6

## Workflow
- When performing git operations (e.g., committing), the user wants the agent to follow the repo's declared skills/policies (e.g., `commit-policy`, `git-commit` skills) instead of improvising conventions. Confidence: 0.7
- Do not add a `Co-authored-by` trailer to commit messages; remove it from any commits that already include it. Confidence: 0.9

