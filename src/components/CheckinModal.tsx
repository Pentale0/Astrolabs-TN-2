import { useState, type FormEvent } from 'react';
import { X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ApiRequestError, vigilApi } from '../api/client.ts';
import type {
  Catalog,
  CheckinEntryInput,
  CheckinResult,
  CheckinSymptomInput,
  Summary,
} from '../shared/types.ts';
import { StatusLabel } from './StatusLabel.tsx';

interface CheckinModalProps {
  catalog: Catalog;
  summary: Summary;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}

export function CheckinModal({
  catalog,
  summary,
  onClose,
  onSubmitted,
}: CheckinModalProps) {
  const dueMap = new Map<string, boolean>();
  for (const reg of summary.regions) {
    for (const ind of reg.indicators) {
      dueMap.set(ind.indicator_id, ind.due);
    }
  }

  const activeSymMap = new Map<string, number>();
  for (const reg of summary.regions) {
    for (const s of reg.active_symptoms) {
      activeSymMap.set(s.symptom_id, s.severity);
    }
  }

  const [values, setValues] = useState<Record<string, { v1: string; v2: string }>>(() => {
    const init: Record<string, { v1: string; v2: string }> = {};
    for (const ind of catalog.indicators) {
      init[ind.id] = { v1: '', v2: '' };
    }
    return init;
  });

  const [symptomSeverities, setSymptomSeverities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const sym of catalog.symptoms) {
      init[sym.id] = activeSymMap.get(sym.id) ?? 0;
    }
    return init;
  });

  const [symptomsReviewed, setSymptomsReviewed] = useState(true);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<CheckinResult | null>(null);

  const handlePrefillNominal = () => {
    const next: Record<string, { v1: string; v2: string }> = {};
    for (const ind of catalog.indicators) {
      if (ind.id === 'body_mass') {
        next[ind.id] = { v1: summary.crew.baseline_mass_kg.toFixed(1), v2: '' };
      } else {
        next[ind.id] = {
          v1: ind.input.fields[0]?.placeholder ?? '',
          v2: ind.input.fields[1]?.placeholder ?? '',
        };
      }
    }
    setValues(next);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const entries: CheckinEntryInput[] = [];
    for (const ind of catalog.indicators) {
      const pair = values[ind.id];
      const raw1 = pair?.v1.trim() ?? '';
      const raw2 = pair?.v2.trim() ?? '';

      if (raw1 === '' && raw2 === '') {
        continue;
      }

      if (raw1 === '') {
        setErrorMsg(`${ind.name}: ${ind.input.fields[0].label} is required.`);
        return;
      }
      const num1 = Number(raw1);
      if (!Number.isFinite(num1)) {
        setErrorMsg(`${ind.name}: ${ind.input.fields[0].label} must be numeric.`);
        return;
      }

      if (ind.input.fields.length === 2) {
        if (raw2 === '') {
          setErrorMsg(`${ind.name}: ${ind.input.fields[1].label} is required.`);
          return;
        }
        const num2 = Number(raw2);
        if (!Number.isFinite(num2)) {
          setErrorMsg(`${ind.name}: ${ind.input.fields[1].label} must be numeric.`);
          return;
        }
        entries.push({ indicator_id: ind.id, value: num1, value2: num2 });
      } else {
        entries.push({ indicator_id: ind.id, value: num1 });
      }
    }

    const symptoms: CheckinSymptomInput[] = [];
    for (const sym of catalog.symptoms) {
      const sev = symptomSeverities[sym.id] ?? 0;
      if (sev > 0) {
        symptoms.push({ symptom_id: sym.id, severity: sev });
      }
    }

    if (entries.length === 0 && symptoms.length === 0 && !symptomsReviewed) {
      setErrorMsg('Enter at least one measurement or confirm the symptom check.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await vigilApi.submitCheckin(summary.crew.id, {
        entries,
        symptoms,
        symptoms_reviewed: symptomsReviewed,
        note: note.trim() || null,
      });
      setResult(res);
      await onSubmitted();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrorMsg(err.field ? `${err.field}: ${err.message}` : err.message);
      } else {
        setErrorMsg('Failed to submit check-in.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkin-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border border-slate-800 bg-[#0B111C] text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 id="checkin-modal-title" className="text-lg font-semibold text-slate-100">
              {result ? 'Check-In Recorded' : 'Log Crew Health Check-In'}
            </h2>
            <p className="text-xs text-slate-400">
              {summary.crew.name} · {summary.environment.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close check-in dialog"
            className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        {result ? (
          <div className="overflow-y-auto p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-emerald-500/30 bg-emerald-950/20 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-slate-100">
                    Telemetry saved ({result.checkin_id})
                  </p>
                  <p className="text-xs text-slate-400">
                    Streak: {result.progress.current_streak} days · Level {result.progress.level} ({result.progress.level_name})
                  </p>
                </div>
              </div>
              <span className="font-mono text-sm font-semibold text-cyan-300">
                +{result.points_earned} pts
              </span>
            </div>

            {result.new_badges.length > 0 && (
              <div className="rounded-md border border-cyan-500/40 bg-cyan-950/20 p-4">
                <p className="text-xs font-semibold text-cyan-300 mb-2">
                  New Badges Unlocked
                </p>
                <div className="space-y-1.5">
                  {result.new_badges.map((b) => (
                    <div key={b.badge_id} className="text-sm text-slate-100">
                      <span className="font-semibold">{b.name}</span>{' '}
                      <span className="text-slate-400">— {b.description} (+{b.points} pts)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.entries.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Evaluated Measurements
                </h3>
                <div className="divide-y divide-slate-800 rounded-md border border-slate-800 bg-[#0E1522]">
                  {result.entries.map((entry) => (
                    <div key={entry.indicator_id} className="p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-slate-100">
                          {entry.name}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm font-semibold text-slate-100">
                            {entry.display_value}
                          </span>
                          <StatusLabel status={entry.status} />
                        </div>
                      </div>
                      <p className="text-xs text-slate-400">{entry.message}</p>
                      {entry.actions.length > 0 && (
                        <ul className="list-disc pl-5 text-xs text-slate-300 space-y-0.5">
                          {entry.actions.map((act) => (
                            <li key={act}>{act}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-cyan-300"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
            <div className="overflow-y-auto p-6 space-y-6">
              {errorMsg && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-md border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-200"
                >
                  <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Biometric & Environmental Indicators
                  </h3>
                  <p className="text-xs text-slate-400">
                    Fill the measurements you captured today; leave unmeasured items blank.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handlePrefillNominal}
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  Prefill Nominal Sample
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {catalog.indicators.map((ind) => {
                  const isDue = dueMap.get(ind.id) ?? false;
                  const pair = values[ind.id] ?? { v1: '', v2: '' };

                  return (
                    <div
                      key={ind.id}
                      className="rounded-md border border-slate-800 bg-[#0E1522] p-3.5 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-100">
                          {ind.name}
                        </span>
                        <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
                          {ind.cadence === 'weekly' ? 'Weekly' : 'Daily'}
                          {isDue ? ' · Due' : ''}
                        </span>
                      </div>

                      <div className={`grid gap-2 ${ind.input.fields.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {ind.input.fields.map((field, fIdx) => {
                          const inputId = `ck-${ind.id}-${field.key}`;
                          const val = fIdx === 0 ? pair.v1 : pair.v2;
                          return (
                            <div key={field.key}>
                              <label
                                htmlFor={inputId}
                                className="block text-xs text-slate-400 mb-1"
                              >
                                {field.label} ({field.min}–{field.max} {field.unit})
                              </label>
                              <input
                                id={inputId}
                                type="number"
                                step={field.decimals === 0 ? '1' : field.decimals === 1 ? '0.1' : '0.01'}
                                placeholder={field.placeholder ?? ''}
                                value={val}
                                onChange={(e) => {
                                  const nextVal = e.target.value;
                                  setValues((prev) => ({
                                    ...prev,
                                    [ind.id]: {
                                      v1: fIdx === 0 ? nextVal : prev[ind.id]?.v1 ?? '',
                                      v2: fIdx === 1 ? nextVal : prev[ind.id]?.v2 ?? '',
                                    },
                                  }));
                                }}
                                className="w-full rounded border border-slate-700 bg-[#070B12] px-2.5 py-1.5 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Symptoms Check */}
              <div className="space-y-3 border-t border-slate-800 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      Symptom Self-Assessment
                    </h3>
                    <p className="text-xs text-slate-400">
                      Report active symptoms or leave at None to clear resolved ones.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={symptomsReviewed}
                      onChange={(e) => setSymptomsReviewed(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                    />
                    <span>All symptoms reviewed</span>
                  </label>
                </div>

                <div className="divide-y divide-slate-800 rounded-md border border-slate-800 bg-[#0E1522]">
                  {catalog.symptoms.map((sym) => {
                    const currentSev = symptomSeverities[sym.id] ?? 0;
                    return (
                      <div
                        key={sym.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5"
                      >
                        <div className="min-w-[200px] flex-1">
                          <p className="text-sm font-medium text-slate-100">{sym.name}</p>
                          <p className="text-xs text-slate-400">{sym.description}</p>
                        </div>
                        <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-[#070B12] p-0.5">
                          {[
                            { val: 0, label: 'None' },
                            { val: 1, label: 'Mild' },
                            { val: 2, label: 'Mod' },
                            { val: 3, label: 'Sev' },
                          ].map((opt) => (
                            <button
                              key={opt.val}
                              type="button"
                              onClick={() =>
                                setSymptomSeverities((prev) => ({
                                  ...prev,
                                  [sym.id]: opt.val,
                                }))
                              }
                              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                                currentSev === opt.val
                                  ? opt.val === 0
                                    ? 'bg-slate-700 text-slate-100'
                                    : opt.val === 1
                                      ? 'bg-amber-500/25 text-amber-300'
                                      : 'bg-rose-500/25 text-rose-300'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Clinical Note */}
              <div className="space-y-1.5">
                <label htmlFor="ck-note" className="block text-xs font-medium text-slate-300">
                  Shift Note (optional)
                </label>
                <input
                  id="ck-note"
                  type="text"
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="EVA pre-breathe completed, normal appetite..."
                  className="w-full rounded border border-slate-700 bg-[#070B12] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-800 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Submit Check-In'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
