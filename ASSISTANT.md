# Q, Quest's assistant

Q is an original chibi anime companion with fluffy white hair, large blue eyes, rosy cheeks, a tiny blue hoodie and an orange scarf. His limbs animate separately for breathing, waving, blinking, talking and dancing. The chat header and minimised button show his face. He stands along the bottom of the signed-in dashboard, can be dragged or moved with arrow keys, and can be minimised. Reduced-motion settings stop the animations. The panel adapts to phone screens and the height available above a keyboard.

Workspace shortcuts work immediately: My day, navigation, reviewed task/event drafts and dance breaks. Replies produced by those shortcuts are labelled **Workspace helper**. OpenAI-backed replies are labelled **AI reply**. A missing key is shown as an owner setup requirement, not simulated AI.

## Enable AI replies

The new Vercel function deploys with the app. In the Vercel project, open **Settings → Environment Variables** and add **OPENAI_API_KEY**, using an API key from your own OpenAI project. Enable it for Production, save, and redeploy the latest deployment so the function receives it. Keep the key out of chat, `config.js` and the repository. OpenAI API usage is billed through that API project.

The default model is `gpt-4.1-mini`. Set **OPENAI_MODEL** on Vercel if a different Responses API model with structured-output support is required. The function reads the existing public Supabase URL/publishable key from the packaged `config.js`. Optional **SUPABASE_URL** and **SUPABASE_PUBLISHABLE_KEY** environment variables can replace them together; no service-role key is used.

After redeploying, open Q and send a workspace question. **AI chat configured** means a key is present; it does not establish that billing, model access or provider availability have been verified. A successful response changes the mode to **AI chat connected** and is marked **Q · AI reply**. A ChatGPT subscription does not configure this API connection or provide API credits.

Q distinguishes insufficient API credits/usage limits, rejected keys, project permissions, unavailable models, request-format errors, rate limits, outages, timeouts and incomplete replies. Setup errors show **AI setup needs attention** while preserving the question. The owner gets a fixed billing/key-management link where appropriate; members get an owner-help message. After activating API billing or adding credits, use **Try again** with the same key. Billing-only changes normally do not require another Vercel redeploy. Key/model environment-variable changes still require redeployment. Raw upstream error messages and API keys are never shown to the browser.

## Permissions and actions

`api/assistant.mjs` authenticates the member's Supabase access token with `/auth/v1/user` and checks current team membership and dashboard access. A POST then fetches a limited context through that same member JWT: accessible projects, assigned unfinished tasks, and upcoming accessible events with explicit time zones. RLS remains authoritative. It does not accept a client-supplied workspace context or use an administrator credential.

A question sends this permitted snapshot and up to six recent chat turns to OpenAI. Private chat bodies, project-note bodies, files, credentials and the membership-management roster are not included. Responses use `store: false`; that setting should not be described as a guarantee about every aspect of provider retention. Conversations remain in the open app's memory and are not written to local storage, a database or offline caches. Changing accounts or project/access scope clears the conversation, draft, speech and outstanding requests.

The model can suggest navigation, dancing, a task draft or an event draft. The server filters unknown/forbidden actions, owner-only pages, inaccessible project IDs and invalid dates. Client checks run again when an action is clicked. Drafts open the existing app editor and require the member to press Save. The assistant does not place trades, send messages/emails, save records, change permissions or delete work automatically.

Requests and responses use `no-store`. The endpoint requires membership and bounds input/history/context/output size. It limits requests per member in each warm function instance; that counter is not a durable, distributed quota. Provider project limits remain the place to control total API usage.

## Verification

- `node tests/assistant-server.mjs`: mocked Supabase/OpenAI requests exercise authentication, membership, member-JWT context reads, rejected client-forged context, scoped actions, reviewed drafts, missing configuration, invalid dates/history, rate limits and classified provider failures without raw-error/secret leakage.
- `python tests/assistant-browser.py`: the actual controller and SVG/portraits, dance/drag/minimise, phone/keyboard layout, local shortcuts, AI request and reply handling, draft review without saving, owner-only billing recovery links, same-question retry, failure/offline preservation, reduced motion and account isolation. Provider replies are fixtures.
- The installable suite checks that unsent assistant input blocks an explicit release update. Mobile layout checks include the dock and panel.

This development environment has no configured OpenAI secret and cannot reach the OpenAI API under its current network policy. A real AI reply and actual phone keyboard/voice behaviour need a check after the owner configures the Vercel key. No database migration is needed for Q.
