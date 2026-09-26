import { useEffect, useRef, useState } from 'react';
import type { PreparedImage } from '../lib/multimodal';
import { formatBytes } from '../lib/multimodal';
import { MAX_IMAGE_EDGE } from '../config';

export function EvidencePanel({
  images,
  onAdd,
  onRemove,
  context,
  setContext,
  disabled,
}: {
  images: PreparedImage[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  context: string;
  setContext: (value: string) => void;
  disabled: boolean;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // paste anywhere: the clipboard image goes in without a file dialog
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (disabled) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith('image/')
      );
      if (files.length) {
        e.preventDefault();
        onAdd(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [disabled, onAdd]);

  return (
    <>
      <p className="sub">
        One image becomes one context, so several images are decided in one pass and come back as
        one result each. Drag and drop, paste from the clipboard, or pick a file. Images are
        downscaled to {MAX_IMAGE_EDGE} px and re-encoded in the page before they reach the model.
      </p>

      <label
        className={`drop${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (disabled) return;
          onAdd(
            Array.from(e.dataTransfer.files).filter((f) =>
              f.type.startsWith('image/')
            )
          );
        }}
      >
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={disabled}
          onChange={(e) => {
            onAdd(Array.from(e.target.files ?? []));
            if (input.current) input.current.value = '';
          }}
        />
        <strong>drop an image</strong>
        <div style={{ fontSize: 12 }}>
          or click to choose · or paste from the clipboard · no image is fine too
        </div>
      </label>

      {images.length > 0 && (
        <div className="thumbs">
          {images.map((img) => (
            <figure className="thumb" key={img.id}>
              <img src={img.url} alt={img.name} />
              <figcaption className="meta">
                {img.error ? (
                  <span className="error">{img.error}</span>
                ) : (
                  <>
                    {img.name} · {formatBytes(img.size)}
                    <br />
                    {img.note}
                  </>
                )}
                <br />
                <button
                  type="button"
                  className="danger"
                  onClick={() => onRemove(img.id)}
                  disabled={disabled}
                >
                  remove
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <label className="field" style={{ marginTop: 14 }}>
        <span>
          context text (optional) · the image is attached after this text, in the same message
        </span>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. this is the screenshot the customer sent with their message"
          disabled={disabled}
          rows={5}
        />
      </label>
    </>
  );
}
