import { useState } from 'react';
import { DECISION_SEQS, type ModelChoice } from '../config';

/**
 * The close is an input, not a button island.
 *
 * The request the reader just ran is the endpoint's own body, so it can be posted to a native
 * `llama-server` unchanged. That is the end of the argument the page makes, and it ends with a
 * cursor in an editable command line rather than a call to action.
 *
 * Every value in the command is real: the weights filename and projector come from the model the
 * page has loaded, the sequence count is the page's own configured limit, and the request file is
 * the one the download button above writes.
 */
export function NativeHandoff({ model }: { model: ModelChoice }) {
  const initial =
    `llama-server -m ${model.file} --mmproj ${model.mmprojFile} ` +
    `--decision-seqs ${DECISION_SEQS} --host 127.0.0.1 --port 8080`;
  const [command, setCommand] = useState(initial);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked: the command is on screen and editable anyway */
    }
  };

  return (
    <section className="close" id="stage-wire">
      <h2>The same request, on a native server</h2>
      <p>
        Nothing here is a new model: the same autoregressive weights, scored as a decision in one
        pass instead of generated token by token. That is the whole conversion, and nothing in the
        body above is browser-specific. Download the request from the decision panel, start the
        fork with the line below, and post the file to it: the decisions come back identical,
        because the wasm build runs the same <code>handle_decision</code> as the server.
      </p>

      <div className="cmd">
        <div className="cmd-field">
          <label htmlFor="native-command">the command, editable</label>
          <input
            id="native-command"
            value={command}
            spellCheck={false}
            onChange={(e) => setCommand(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
        <button type="button" onClick={copy}>
          {copied ? 'copied' : 'copy'}
        </button>
      </div>

      <p className="status">
        then: curl -X POST http://127.0.0.1:8080/v1/decision -H &apos;content-type:
        application/json&apos; -d @momo-s1-decision-request.json
      </p>
    </section>
  );
}
