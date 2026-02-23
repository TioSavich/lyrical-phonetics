# Initial Prompt: 
Help me write a good prompt to one-shot a vibe-coded app for songwriters and poets to help visualize their song drafts. The problem: I’ve got a bunch of scraps that I keep trying to put together into songs. When I edit a poem, I will ‘fix’ a semantic issue, but lose a beautiful pattern. I’d kind of like two versions. One I can run locally with python, and one that calls the python script iteratively within an llm, like what I can do with aistudio. Here’s the draft of the prompt I have so far - I want you to help separate the feasible from the unfeasible, local (Python) from web-interface (LLM+Python), and which Python libraries to choose. 

Users upload a poem or song lyrics; phonetic analysis is conducted using python libraries; rhymes, near rhymes, assonance, and vowel cascades (drip, drop, drape, droop) are detected. This involves ambiguity; Eminem famously 'rhymed' lots of stuff with "orange" based on which syllable is emphasized. "Tear" can rhyme with "ear" or "hair" - if "hair" is elsewhere in the poem, the phonetic representation of "tear" should tend toward "tare" to maximize the number of reported poetic connections. Python should give ‘exact’ reports of syllable counts. Prosody should be analyzed as well to uncover rhythmic patterns. These exact values should be downloadable. But it should be reporting to an LLM that can use fuzzy logic. Like if python reports conflicting rhymes, like “ear” and “hair” are both present in the original song, an LLM should conduct a semantic analysis and the python script should be run again on the meaningful result. 

- oh, it’s important that none of these poetic devices need to be obvious. The juiciest rhymes are internal, crossing stanzas, to give a sense of flow while allowing the singer to maintain something like natural speech.

Other poetic devices (alliteration, anaphora etc.) may be added later as modules. The user is presented with their original poem and color-coded poetic connections (e.g., “tear” and “hair” are both highlighted green when “rhyme” is selected, “drip” “drop” highlighted green, “ship” “shape” highlighted red when “vowel cascade” is highlighted). Radio buttons should be used to let the user choose which poetic device is being represented. It must be easy to print these basic reports. Think of them kind of like notes a singer would make on a lead sheet. 

It would be cool if the app then ‘did the math’ to maximize the attributes they’re interested in. That would be computationally expensive with a whole phonetic dictionary, but maybe unpaired words could be prioritized. I’m imagining clicking on a word like “curtains” that is maybe low-score on the poetic connections metric, but the word “drop” is present in the poem, so “drapes” is suggested. But the original also contains the word “mind” so “blinds” is a possible in a presented word-cloud. 

This is kind of a graph problem, which is what I mean by ‘did the math.’ The LLm might need to bound the problem to thematic analysis of the song. But I’m not sure. 

It would be cool if the basic analysis set could be rebuilt as a feature for VS Code, like code-complete, but for poets. 

# Response from Gemini: 
This is an incredibly cool concept. The tension between preserving the phonetic scaffolding—the "vibe" and flow—and fixing the semantic meaning is the exact friction that makes songwriting and poetry so difficult. Building a tool to visualize those invisible phonetic threads like notes on a lead sheet is a brilliant use case for a hybrid deterministic/LLM architecture.

Let’s break down your idea to separate what Python can do perfectly, where an LLM is actually necessary, and how to structure the graph problem. Then, I’ll give you the optimized one-shot prompts.

---

### 1. Separating the Tech Stack: Feasible vs. Unfeasible

**What is highly feasible for Local Python (The Deterministic Core):**

* **Exact Syllable Counts & Phonemes:** The `CMUDict` (Carnegie Mellon University Pronouncing Dictionary), accessed via the `nltk` or `pronouncing` libraries, is the gold standard for this.
* **Rhyme, Assonance, & Alliteration:** Python can deterministically map internal and cross-stanza relationships by comparing the phonetic stress markers in `CMUDict`.
* **The UI (Color-coding & Radio buttons):** A local web server (using Flask or FastAPI) serving HTML/CSS/JS is perfect here. You can easily build a responsive interface that dynamically wraps words in `<span>` tags with specific background colors based on the selected radio button.

**What requires an LLM / Web Interface (The Semantic & Fuzzy Logic):**

* **Contextual Disambiguation ("tear" vs "tear"):** Pure Python struggles here without heavy NLP models. An LLM excels at reading the surrounding text and outputting the correct phonetic representation to feed *back* into the Python engine.
* **The "Curtains -> Drapes" Recommender:** As you rightly identified, brute-forcing a phonetic dictionary to find a word that means "curtains", rhymes with "mind", and alliterates with "drop" is computationally brutal.

**What is currently unfeasible (or very difficult) for a one-shot script:**

* **Perfect Natural Prosody:** Python can pull the *standard* lexical stress (0, 1, or 2) from a dictionary, but natural speech prosody changes based on the singer's phrasing. We have to settle for dictionary-stress as a proxy.
* **VS Code Extension:** This requires a completely different tech stack (TypeScript/Node.js) and API structure. It’s a great Phase 2, but we should leave it out of the initial one-shot prompt to keep the AI focused.

---

### 2. Solving "The Math" (The Graph Problem)

You are spot-on that this is a graph problem. Think of the poem as a state space: words are **nodes**, and the phonetic relationships (rhymes, vowel cascades) are **edges**.

Instead of doing a massive, expensive search across the entire English language, the most efficient architecture is an **LLM-bounded semantic search paired with a deterministic phonetic filter**:

1. **User Action:** You click the word "curtains".
2. **LLM Semantic Bound:** The app asks the LLM, *"Generate 30 synonyms or thematically related words for 'curtains' in the context of this song."* (This bounds the computation).
3. **Python Phonetic Filter:** The Python backend takes those 30 words, cross-references them with the poem's existing phonetic graph, and scores them.
4. **Result:** "Drapes" scores highest because it forms a vowel cascade edge with "drop". "Blinds" scores high because it forms an assonance edge with "mind".

---

### 3. The One-Shot Prompts

To get the best result from an AI coder, we should split this into two prompts: one to build the rock-solid local Python/Web app, and one to build the LLM-agent wrapper.

#### Prompt 1: The Local Deterministic App (Python + HTML/JS/CSS)

*Use this in an AI coding assistant (like Cursor, or pasting into Claude/Gemini) to build the core engine.*

> **System Context:** You are an expert Python developer and linguist building a local web application for songwriters. The app visualizes the phonetic scaffolding of song lyrics, acting like notes on a lead sheet.
> **Task:** Build a local web app using FastAPI (backend) and vanilla HTML/CSS/JS (frontend).
> **Backend Requirements (Python):**
> 1. Use the `nltk` library (`CMUDict`) and the `pronouncing` library for phonetic analysis.
> 2. Create endpoints to analyze a submitted text for:
> * Exact syllable counts per line.
> * Exact Rhymes and Near Rhymes.
> * Assonance (vowel matching).
> * Vowel Cascades (e.g., drip, drop, drape).
> 
> 
> 3. The phonetic analysis must detect internal and cross-stanza connections, not just end-rhymes.
> 4. Create an endpoint that exports these exact values as a downloadable JSON or plain text report.
> 
> 
> **Frontend Requirements (HTML/CSS/JS):**
> 1. A clean, minimal UI where users paste their lyrics.
> 2. A control panel with radio buttons for: Rhymes, Assonance, Alliteration, and Vowel Cascades.
> 3. When a radio button is selected, the lyrics are dynamically highlighted. Words that share a phonetic connection should share a distinct color (e.g., if "Rhyme" is selected, "tear" and "hair" are both highlighted green; "boat" and "float" are highlighted blue).
> 4. Ensure the output is printer-friendly so a singer can take it into the booth.
> 
> 
> **Constraints:** Keep the architecture modular so I can easily wrap the phonetic engine in an LLM agent later. Provide all code in complete, copy-pasteable blocks.

#### Prompt 2: The LLM "Graph" Recommender

*Once the base app is running, use this prompt to build the LLM-powered suggestion tool (e.g., using a framework that allows tool-calling, like `smolagents` or LangChain).*

> **System Context:** You are an AI agent designed to help a songwriter optimize the phonetic connections in a draft without losing semantic meaning.
> **The Problem:** The user has a poem analyzed by a local Python phonetic engine. They want to replace a specific word (e.g., "curtains") with a word that fits the theme BUT maximizes phonetic connections (rhyme, assonance) with the rest of the text. This is a graph optimization problem.
> **Task:** Write a Python script using an LLM API (e.g., Google Gemini or OpenAI) that does the following:
> 1. Accepts a target word to replace, the full text of the poem, and the desired phonetic target (e.g., "I want to rhyme with 'mind' or match the vowels of 'drop'").
> 2. **Step 1 (Semantic Bounding):** The LLM generates a list of 30 synonyms, slang, or thematically related words for the target word based on the poem's context. This includes disambiguating words like "tear" based on surrounding semantics.
> 3. **Step 2 (Phonetic Filtering):** A Python function runs those 30 words through `CMUDict`/`pronouncing`.
> 4. **Step 3 (Scoring):** The script scores the generated words based on how many phonetic edges they create with the rest of the poem, prioritizing internal and cross-stanza connections.
> 5. Output a top-3 recommended word list to the user with a brief explanation of *why* it fits both the vibe and the math.
> 
> 

---

### A Quick Note on Libraries

* **`pronouncing`**: This is a fantastic, lightweight wrapper for CMUDict. It makes finding rhymes and syllable counting much easier than parsing raw CMUDict data yourself.
* **`spacy`**: If you want to try pushing the *local* Python app to disambiguate words without an LLM, `spacy` can do Part-of-Speech tagging. If "tear" is tagged as a verb, it pronounces it "tare"; if tagged as a noun, "teer". It's not perfect, but it's a good offline fallback.

Would you like me to mock up a quick Python script using the `pronouncing` library to show you exactly how the vowel cascade detection (drip/drop/drape) would work under the hood?


# I loaded prompt 1 into ai studio and it produced lyrical-phonetics - I added a folder called output_examples after running it a few times; look at the json a bit 

# My follow up prompt failed, but here it is.


Phase 1 with aistudio made an LLM dependent typescript app instead of using python, I think. It's a little buggy but still provides some useful analysis. It seems kind of bound to line punctuation, like it isn't catching all the poetic devices across stanzas. It's capturing some. I Don't really read IPA but it seems like the correct unit of analysis is the phoneme. I wonder if what I'm really after is a graph of phonemes. All the poetic devices are just patterns and knowing what patterns to look for helps limit the problem. But rhythms are important too. So, I wonder if it could kind of store the location of each phoneme as a vector that includes absolute and relative location. Like the 37th phoneme of the poem is "u", it occurs on line 3, at the end of a word that begins with the phoneme "t" making the word "to" which is the 3rd syllable in the line. 

I did a little analysis on the json output (with help). One thing that was useful was sorta collecting the lines that use similar poetic devices together. They do kind of serve different purposes in conveying emotional valence. So, forming clusters of devices. But then I wasn't able to get my helper to draw on those clusters to regularize how the devices are used. It would be nice if I could somehow include common song structures like chorus, bridge, verse, pre-chorus etc. And then have the program (after the initial analysis) recognize "oh, you're using a cascade at the end of verse 1, and at the end of verse 2, maybe you want to include one at the end of the third verse?" But the first thing to do is, I think, getting the analysis to be pure python. 

Ultimately, I'm thinking about loading a manuscript into Big Red (supercomputer) and seeing if I can't make my dull, academic prose more lyrical. So getting the words to phonemes to numerical representations, then doing pattern recognition on those numerals needs to be pretty much bug free, and optimized to look at large texts. Or small texts. I guess I'm saying it needs to scale.