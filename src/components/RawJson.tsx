import { useState } from 'react';
import { shrinkPayload } from '../lib/multimodal';

// The exact request and response, so the page doubles as the endpoint's reference. Base64 blobs are
// shrunk to their size: the full bytes are not useful to read and too large to print.
export function RawJson({
  label,
  value,
  filename,
  open = false,
}: {
  label: string;
  value: unknown;
  filename: string;
  open?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(shrinkPayload(value), null, 2);
  const size = new Blob([text]).size;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked: the text is on screen anyway */
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <details className="json" open={open}>
      <summary>
        {label} · {size > 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`}
      </summary>
      <div className="body">
        <div className="row" style={{ marginBottom: 8 }}>
          <button type="button" onClick={copy}>
            {copied ? 'copied' : 'copy'}
          </button>
          <button type="button" onClick={download}>
            download
          </button>
        </div>
        <pre>{text}</pre>
      </div>
    </details>
  );
}
