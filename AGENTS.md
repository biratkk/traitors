# Working on the Traitors Dashboard

## Scope and behavior

- Read `README.md`, `docs/GLOSSARY.md`, and the relevant code before changing behavior.
- Treat `GOAL.md` as the original brief. It describes planned features as well as current behavior.
- Keep the host a non-player. Do not expose secret roles to the host when those roles are implemented.
- Do not claim that multiplayer, private roles, voting, or personalized narration already works.
- Keep audio files local to the app. Test offline behavior on the target device before promising it works.
- Keep controls usable on a tablet. Preserve keyboard access and clear labels.
- Do not overwrite player work or delete files outside the requested change.

## Code

- Prefer small, focused changes. Keep state close to the code that owns it.
- Give variables and functions names that describe their role. Avoid unexplained abbreviations.
- Remove duplication when it makes a change easier to understand. Do not build abstractions for hypothetical requirements.
- Handle errors at the point where the user can act on them. Do not hide failures behind success messages.
- Test behavior rather than implementation details where practical. Run `npm run lint` and `npm test` before committing changes.
- Keep tests independent and deterministic. The end-to-end suite uses a production build with no sample players.

## Writing

- Use plain, specific language. Say what the code or feature does.
- Use short sentences and active voice. Avoid filler, vague claims, decorative metaphors, and repeated ideas.
- Use sentence case for headings. Do not add emojis to headings or lists.
- Keep product terms consistent with `docs/GLOSSARY.md`. Update the glossary when a term changes.
- Keep documentation honest about limits. Do not invent metrics, features, or guarantees.
- Preserve the original brief in `GOAL.md` unless the user asks to change it.

## References

- [A Philosophy of Software Design](https://web.stanford.edu/~ouster/cgi-bin/book.php), John Ousterhout. Manage complexity through clear interfaces and modules.
- [Refactoring](https://martinfowler.com/books/refactoring.html), Martin Fowler. Change code in small steps while tests protect behavior.
- [Write the docs: Documentation guide](https://www.writethedocs.org/guide/). Organize documentation around the reader and the task.
- [Google developer documentation style guide](https://developers.google.com/style). Use clear, consistent language for technical writing.
- [Testing Library guiding principles](https://testing-library.com/docs/guiding-principles/). Prefer tests that resemble how people use the app.
