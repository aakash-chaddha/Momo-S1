/**
 * The other way to hand the work over: not to a server, but to an agent.
 *
 * Every function the buttons call is registered as a tool on `document.modelContext` (WebMCP), so
 * an LLM that can reach this tab can run the page itself - load the model, set the evidence, ask
 * the question, run either pass, stop one. This section says so in the reader's terms: no clicks
 * required, and the page stays visible and interruptible while the agent works.
 */
export function AgentHandoff() {
  // kept whole on a line: a tool name that breaks at its hyphen is no longer a name you can copy
  const tools = [
    'get-page-state',
    'load-model',
    'set-evidence',
    'apply-preset',
    'set-question',
    'run-decision',
    'run-generation',
    'run-both',
    'stop-run',
  ];
  return (
    <section className="close" id="stage-agent">
      <h2>Any LLM can run this page for you</h2>
      <p>
        You do not have to run any of this by hand. Every function the buttons call - load the
        model, set the evidence, apply a preset, ask the question, run the decision, run it token by
        token, stop a run - is registered as a tool on <code>document.modelContext</code>, the WebMCP
        API. Any LLM that can reach this tab can call the page directly and run all of it itself:
        you ask for the outcome, it does the stages in the order they need to be done, and it reads
        the results back to you.
      </p>
      <p>
        These are not guessed clicks on a screenshot: the tools call the same handlers the buttons
        call, and every one returns JSON - the assembled answer, a probability per field, the
        timing split. The agent built into Chrome or Edge, ChatGPT Desktop, a browser extension, or
        an agent in an iframe you allow can all drive it (a browser with WebMCP: Chrome or Edge with{' '}
        <code>about:flags#enable-webmcp-testing</code> today). You keep the stop button and the
        whole page in front of you while it works.
      </p>
      <figure className="shot">
        <img
          src={`${import.meta.env.BASE_URL}img/use-it-using-chatgpt-directly.png`}
          alt="A chat driving this page: its site tools menu lists the nine WebMCP functions the page registered, and the chat has loaded the model, set the evidence and run both passes, with the two answers and their probabilities in the table below."
        />
        <figcaption className="status">
          it is not a mock-up: the chat opened the page&apos;s own site tools and ran them - loaded
          the model, set the evidence, ran both passes - while the stages on the right updated as it
          went
        </figcaption>
      </figure>

      <p className="status">
        nine tools{' '}
        {tools.map((t, i) => (
          // the name stays whole, the separator is where a line may break
          <span key={t}>
            {i ? ' · ' : ''}
            <span style={{ whiteSpace: 'nowrap' }}>{t}</span>
          </span>
        ))}
      </p>
    </section>
  );
}
