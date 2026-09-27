import { useEffect, useRef, useState } from 'react';
import type { PreparedImage } from '../lib/multimodal';
import { formatBytes } from '../lib/multimodal';
import { MAX_IMAGE_EDGE } from '../config';
import { SAMPLES, fetchSample, sampleUrl, type Sample } from '../lib/samples';
import { useTilt } from '../lib/motion';

/** anything with pixels that can be opened: the attached image, or a sample before it is attached */
interface Viewable {
  url: string;
  name: string;
  note: string;
}

/** the image at its own size: the thumb is a crop, and the pixels are the evidence */
function Lightbox({ view, onClose }: { view: Viewable; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="lightbox" onClick={onClose}>
      <button
        type="button"
        className="lightbox-close"
        onClick={onClose}
        autoFocus
        aria-label="Close full-size view"
      >
        ×
      </button>
      <figure
        className="lightbox-plate"
        role="dialog"
        aria-modal="true"
        aria-label={`${view.name} at full size`}
        onClick={(e) => e.stopPropagation()}
      >
        <img src={view.url} alt={view.name} />
        <figcaption>
          <span>
            {view.name} · {view.note}
          </span>
          <button type="button" className="ghost quiet" onClick={onClose}>
            close
          </button>
        </figcaption>
      </figure>
    </div>
  );
}

/** the one image, as a plate you can pick up: it tilts toward the pointer and settles back */
function Thumb({
  img,
  onRemove,
  onView,
  disabled,
}: {
  img: PreparedImage;
  onRemove: () => void;
  onView: (view: Viewable) => void;
  disabled: boolean;
}) {
  const tilt = useTilt<HTMLElement>(3.2);
  return (
    <figure className="thumb tilt" ref={tilt}>
      <button
        type="button"
        className="thumb-open"
        onClick={() =>
          onView({ url: img.url, name: img.name, note: img.note || formatBytes(img.size) })
        }
      >
        <img src={img.url} alt={img.name} />
        <span className="thumb-open-label">view full size</span>
      </button>
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
          className="danger quiet"
          onClick={() => onRemove()}
          disabled={disabled}
        >
          remove
        </button>
      </figcaption>
    </figure>
  );
}

export function EvidencePanel({
  image,
  onAdd,
  onRemove,
  context,
  setContext,
  disabled,
}: {
  image: PreparedImage | null;
  onAdd: (file: File) => void;
  onRemove: () => void;
  context: string;
  setContext: (value: string) => void;
  disabled: boolean;
}) {
  const [over, setOver] = useState(false);
  const [view, setView] = useState<Viewable | null>(null);
  const [loadingSample, setLoadingSample] = useState('');
  const [sampleError, setSampleError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  // a sample goes through the same path as a dropped file, so it is downscaled and re-encoded
  // exactly like anything the reader brings in
  const addSample = async (sample: Sample) => {
    setLoadingSample(sample.file);
    setSampleError('');
    try {
      onAdd(await fetchSample(sample));
    } catch (e) {
      setSampleError((e as Error).message || `could not load ${sample.file}`);
    } finally {
      setLoadingSample('');
    }
  };

  // paste anywhere: the clipboard image goes in without a file dialog
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (disabled) return;
      const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith('image/')
      );
      if (file) {
        e.preventDefault();
        onAdd(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [disabled, onAdd]);

  return (
    <>
      <p className="lede">
        This is what the model gets to look at, one image at a time: the same pixels go to both
        routes below. Drag and drop, paste from the clipboard, pick a file, or take one of the
        samples below; adding another image replaces the one that is there. Images are downscaled
        to {MAX_IMAGE_EDGE} px and re-encoded in the page before they reach the model. Click the
        image to see it at full size.
      </p>

      <div className="evidence-grid">
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
            const file = Array.from(e.dataTransfer.files).find((f) =>
              f.type.startsWith('image/')
            );
            if (file) onAdd(file);
          }}
        >
          <input
            ref={input}
            type="file"
            accept="image/*"
            hidden
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onAdd(file);
              if (input.current) input.current.value = '';
            }}
          />
          <strong>drop an image</strong>
          <span className="drop-sub">
            or click to choose · or paste from the clipboard · one image at a time
          </span>
        </label>

        <div className="thumbs-wrap">
          {image ? (
            <div className="thumbs">
              <Thumb img={image} onRemove={onRemove} onView={setView} disabled={disabled} />
            </div>
          ) : (
            <p className="status">
              no image attached. a text-only question works without one.
            </p>
          )}
        </div>
      </div>

      <div className="samples">
        <div className="row" style={{ marginBottom: 'var(--s-3)' }}>
          <span className="panel-key">or start from a sample</span>
          <span className="spacer" />
          <span className="status">complaint emails and product screenshots, as a customer would send them</span>
        </div>
        <div className="sample-row">
          {SAMPLES.map((s) => {
            const attached = image?.name === s.file;
            return (
              <div className="sample" key={s.file}>
                <button
                  type="button"
                  className="sample-open"
                  onClick={() => setView({ url: sampleUrl(s.file), name: s.name, note: s.caption })}
                  disabled={disabled}
                  aria-label={`view ${s.name} at full size`}
                >
                  <img src={sampleUrl(s.file)} alt="" />
                  <span className="thumb-open-label">view</span>
                </button>
                <span className="sample-name">{s.name}</span>
                <span className="sample-caption">{s.caption}</span>
                <button
                  type="button"
                  className="sample-add"
                  onClick={() => void addSample(s)}
                  disabled={disabled || attached || !!loadingSample}
                >
                  {attached
                    ? 'attached'
                    : loadingSample === s.file
                      ? 'attaching…'
                      : image
                        ? 'attach instead'
                        : 'attach'}
                </button>
              </div>
            );
          })}
        </div>
        {sampleError ? <div className="error">sample: {sampleError}</div> : null}
      </div>

      <label className="field" style={{ marginTop: 'var(--s-4)' }}>
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

      {view ? <Lightbox view={view} onClose={() => setView(null)} /> : null}
    </>
  );
}
