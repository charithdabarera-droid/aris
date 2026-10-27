# ARIS (browser-only build)
A static version of the ARIS assistant that runs entirely in the browser and is hosted on GitHub Pages.
- LLM: the free, keyless Pollinations endpoint `text.pollinations.ai/openai` (model `openai`), called directly from the browser.
- Search: DuckDuckGo Instant Answers plus Wikipedia search. Page reading uses r.jina.ai. The model asks for these with `[[SEARCH: q]]` and `[[FETCH: url]]` lines, and saves facts with `[[REMEMBER: fact]]`.
- Memory and settings are kept in this browser's localStorage and never leave the device. Chat text is sent to Pollinations and searches go to the services above.
- Voice uses the Web Speech API: speech-to-text works in Chrome/Edge, and replies are read in an en-GB voice when one is available.
