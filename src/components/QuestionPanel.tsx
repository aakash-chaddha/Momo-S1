import { useEffect, useMemo, useRef, useState } from 'react';
import {
  parseForm,
  serializeForm,
  summary,
  validateSchema,
  TYPES,
  type FieldType,
  type FormField,
  type FormSchema,
  type Json,
} from '../lib/schema';
import { PRESETS } from '../lib/presets';

// The fields a user writes are the compact form the endpoint documents; the form is a view over
// that object, so the JSON view and the wire request are always the same thing.
export function QuestionPanel({
  instructions,
  setInstructions,
  schemaText,
  setSchemaText,
  onPreset,
  disabled,
}: {
  instructions: string;
  setInstructions: (value: string) => void;
  schemaText: string;
  setSchemaText: (value: string) => void;
  onPreset: (id: string) => void;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [form, setForm] = useState<FormSchema | null>(null);
  const [parseError, setParseError] = useState('');
  const emitted = useRef<string | null>(null);

  // re-read the form only when the text changed from outside (a preset, the JSON view)
  useEffect(() => {
    if (schemaText === emitted.current) return;
    try {
      setForm(parseForm(JSON.parse(schemaText || '{}')));
      setParseError('');
    } catch (e) {
      setParseError((e as Error).message);
    }
  }, [schemaText]);

  const schemaObj = useMemo<Json | null>(() => {
    try {
      const parsed = JSON.parse(schemaText || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Json)
        : null;
    } catch {
      return null;
    }
  }, [schemaText]);

  const problem = !schemaObj
    ? 'the schema is not a JSON object'
    : validateSchema(schemaObj);

  const commit = (next: FormSchema) => {
    setForm(next);
    const text = JSON.stringify(serializeForm(next), null, 2);
    emitted.current = text;
    setSchemaText(text);
  };
  const edit = (i: number, patch: Partial<FormField>) => {
    if (!form) return;
    commit({
      ...form,
      fields: form.fields.map((f, k) => (k === i ? { ...f, ...patch } : f)),
    });
  };
  const remove = (i: number) => {
    if (!form) return;
    commit({ ...form, fields: form.fields.filter((_, k) => k !== i) });
  };
  const add = () => {
    if (!form) return;
    let n = form.fields.length + 1;
    while (form.fields.some((f) => f.name === `field_${n}`)) n++;
    commit({
      ...form,
      fields: [
        ...form.fields,
        {
          name: `field_${n}`,
          type: 'enum',
          description: '',
          choices: ['yes', 'no'],
          extra: {},
        },
      ],
    });
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="inline">
          <span>preset</span>
          <select
            defaultValue=""
            disabled={disabled}
            onChange={(e) => {
              if (e.target.value) onPreset(e.target.value);
              e.target.value = '';
            }}
          >
            <option value="">choose an example…</option>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
      </div>

      <label className="field">
        <span>
          instructions · plain language rules for the fields; this is the only thing steering the
          answer besides the pixels
        </span>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={6}
          disabled={disabled}
          placeholder="e.g. kind: the main subject of the image. count: how many…"
        />
      </label>

      <div className="row" style={{ marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>schema</strong>
        <button
          type="button"
          className={mode === 'form' ? 'primary' : 'ghost'}
          onClick={() => setMode('form')}
          disabled={disabled}
        >
          form
        </button>
        <button
          type="button"
          className={mode === 'json' ? 'primary' : 'ghost'}
          onClick={() => setMode('json')}
          disabled={disabled}
        >
          JSON
        </button>
        <span className="spacer" />
        <span className="status">
          {schemaObj ? `${Object.keys((schemaObj.properties as Json) ?? schemaObj).length} fields` : '—'}
        </span>
      </div>

      {problem && <div className="notice">schema: {problem}</div>}

      {mode === 'json' || parseError ? (
        <textarea
          value={schemaText}
          onChange={(e) => setSchemaText(e.target.value)}
          rows={16}
          disabled={disabled}
          spellCheck={false}
        />
      ) : (
        form && (
          <>
            {form.fields.map((f, i) => {
              const s = summary(f);
              return (
                <div className="fieldrow" key={i}>
                  <div className="head">
                    <input
                      className="name"
                      value={f.name}
                      onChange={(e) => edit(i, { name: e.target.value })}
                      disabled={disabled}
                      aria-label="field name"
                    />
                    <select
                      value={f.type}
                      onChange={(e) =>
                        edit(i, { type: e.target.value as FieldType })
                      }
                      disabled={disabled}
                      aria-label="field type"
                    >
                      {TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    {(f.type === 'integer' || f.type === 'number') && (
                      <select
                        value={f.aggregate ?? 'mode'}
                        onChange={(e) =>
                          edit(i, {
                            aggregate: e.target.value as FormField['aggregate'],
                          })
                        }
                        disabled={disabled}
                        aria-label="numeric aggregate"
                      >
                        <option value="mode">mode</option>
                        <option value="median">median</option>
                        <option value="mean">mean</option>
                      </select>
                    )}
                    <span className="spacer" />
                    <button
                      type="button"
                      className="danger"
                      onClick={() => remove(i)}
                      disabled={disabled}
                    >
                      remove
                    </button>
                  </div>
                  <textarea
                    value={f.description}
                    onChange={(e) => edit(i, { description: e.target.value })}
                    placeholder="what this field means; your words steer the answer"
                    rows={2}
                    disabled={disabled}
                  />
                  {f.type === 'enum' && (
                    <input
                      style={{ width: '100%', marginTop: 6 }}
                      value={f.choices.join(', ')}
                      onChange={(e) =>
                        edit(i, {
                          choices: e.target.value
                            .split(',')
                            .map((v) => v.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="allowed values, comma separated"
                      disabled={disabled}
                      aria-label="allowed values"
                    />
                  )}
                  {(f.type === 'integer' || f.type === 'number') && (
                    <div className="row" style={{ marginTop: 6 }}>
                      <label className="inline">
                        min
                        <input
                          type="number"
                          style={{ width: 84 }}
                          value={f.minimum ?? 0}
                          onChange={(e) =>
                            edit(i, { minimum: Number(e.target.value) })
                          }
                          disabled={disabled}
                        />
                      </label>
                      <label className="inline">
                        max
                        <input
                          type="number"
                          style={{ width: 84 }}
                          value={f.maximum ?? 9}
                          onChange={(e) =>
                            edit(i, { maximum: Number(e.target.value) })
                          }
                          disabled={disabled}
                        />
                      </label>
                      {f.type === 'number' && (
                        <label className="inline">
                          step
                          <input
                            type="number"
                            style={{ width: 84 }}
                            value={f.step ?? 1}
                            onChange={(e) =>
                              edit(i, { step: Number(e.target.value) })
                            }
                            disabled={disabled}
                          />
                        </label>
                      )}
                    </div>
                  )}
                  <div className={`hint${s.bad ? ' bad' : ''}`}>{s.text}</div>
                </div>
              );
            })}
            <button type="button" onClick={add} disabled={disabled}>
              + add field
            </button>
          </>
        )
      )}
    </>
  );
}
