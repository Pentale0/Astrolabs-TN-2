import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { vigilApi } from './api/client.ts';
import { BodyMap } from './components/BodyMap.tsx';
import { CheckinModal } from './components/CheckinModal.tsx';
import { ReadinessView } from './components/ReadinessView.tsx';
import { ReportView } from './components/ReportView.tsx';
import { Sparkline } from './components/Sparkline.tsx';
import { StatusLabel } from './components/StatusLabel.tsx';
import { TrendsView } from './components/TrendsView.tsx';
import type {
  Catalog,
  CrewMember,
  ScenarioDescriptor,
  Summary,
  TrendDirection,
} from './shared/types.ts';

type ActiveTab = 'monitor' | 'trends' | 'readiness' | 'report';

function TrendBadge({ trend }: { trend: TrendDirection }) {
  if (trend === 'up') {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-xs text-slate-300">
        <ArrowUpRight className="h-3.5 w-3.5 text-cyan-400" />
        <span>Up</span>
      </span>
    );
  }
  if (trend === 'down') {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-xs text-slate-300">
        <ArrowDownRight className="h-3.5 w-3.5 text-amber-400" />
        <span>Down</span>
      </span>
    );
  }
  if (trend === 'flat') {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-xs text-slate-400">
        <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
        <span>Steady</span>
      </span>
    );
  }
  return <span className="font-mono text-xs text-slate-500">—</span>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('monitor');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [crewList, setCrewList] = useState<CrewMember[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioDescriptor[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState<string>('c1');
  const [selectedRegionId, setSelectedRegionId] = useState<string>('neuro_ocular');
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadBootstrap = useCallback(async () => {
    const [cat, crew, scs] = await Promise.all([
      vigilApi.getCatalog(),
      vigilApi.listCrew(),
      vigilApi.listScenarios(),
    ]);
    setCatalog(cat);
    setCrewList(crew);
    setScenarios(scs);
    return crew;
  }, []);

  const loadCrewSummary = useCallback(async (crewId: string) => {
    const sum = await vigilApi.getSummary(crewId);
    setSummary(sum);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadBootstrap()
      .then((crew) => {
        if (!active) return;
        const firstId = crew[0]?.id ?? 'c1';
        setSelectedCrewId(firstId);
        return loadCrewSummary(firstId);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load Vigil data.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadBootstrap, loadCrewSummary]);

  const handleCrewChange = async (crewId: string) => {
    setSelectedCrewId(crewId);
    setSelectedScenarioId('');
    setError(null);
    try {
      await loadCrewSummary(crewId);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to switch crew member.');
    }
  };

  const handleEnvironmentChange = async (envId: string) => {
    if (!summary) return;
    setError(null);
    try {
      const updatedCrew = await vigilApi.updateCrew(summary.crew.id, { environment: envId });
      setCrewList((prev) => prev.map((c) => (c.id === updatedCrew.id ? updatedCrew : c)));
      await loadCrewSummary(summary.crew.id);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update habitat environment.');
    }
  };

  const handleScenarioApply = async (scenarioId: string) => {
    if (!scenarioId) return;
    setSelectedScenarioId(scenarioId);
    setError(null);
    try {
      const updatedSummary = await vigilApi.applyScenario(selectedCrewId, scenarioId);
      setSummary(updatedSummary);
      const alertReg = updatedSummary.regions.find((r) => r.status === 'alert') ??
        updatedSummary.regions.find((r) => r.status === 'watch');
      if (alertReg) {
        setSelectedRegionId(alertReg.region_id);
      }
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to apply scenario.');
    }
  };

  const handleResetAll = async () => {
    setError(null);
    try {
      await vigilApi.resetAll();
      setSelectedScenarioId('');
      const crew = await vigilApi.listCrew();
      setCrewList(crew);
      await loadCrewSummary(selectedCrewId);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset demo dataset.');
    }
  };

  const handleCheckinSubmitted = async () => {
    await loadCrewSummary(selectedCrewId);
    setRefreshKey((k) => k + 1);
  };

  const selectedRegion =
    summary?.regions.find((r) => r.region_id === selectedRegionId) ??
    summary?.regions[0] ??
    null;

  return (
    <div className="min-h-screen bg-[#070B12] text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="border-b border-slate-800 bg-[#0A0F1A]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-2 sm:gap-8 px-3 sm:px-6 py-3">
          <a
            href="#monitor"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('monitor');
            }}
            className="text-base sm:text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            Vigil
          </a>

          <nav className="flex items-center gap-2.5 sm:gap-6 min-w-0" aria-label="Primary navigation">
            {(
              [
                { id: 'monitor', label: 'Monitor' },
                { id: 'trends', label: 'Trends' },
                { id: 'readiness', label: 'Readiness' },
                { id: 'report', label: 'Report' },
              ] as Array<{ id: ActiveTab; label: string }>
            ).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`border-b-2 py-1 text-[11px] sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                    isActive
                      ? 'border-cyan-400 text-slate-100'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setCheckinOpen(true)}
              disabled={!summary || !catalog}
              className="rounded-md bg-cyan-500 px-2.5 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-300"
            >
              Log Check-In
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 sm:px-6 py-6 space-y-6">
        {/* Workspace Toolbar: Crew, Environment, Scenario, Reset */}
        <section
          aria-label="Mission context controls"
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 rounded-lg border border-slate-800 bg-[#0E1522] px-4 py-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 min-w-0">
              <label htmlFor="crew-select" className="text-xs text-slate-400 whitespace-nowrap">
                Crew Member
              </label>
              <select
                id="crew-select"
                value={selectedCrewId}
                onChange={(e) => handleCrewChange(e.target.value)}
                className="w-full sm:w-auto max-w-full min-w-0 rounded border border-slate-700 bg-[#070B12] px-2.5 py-1.5 text-xs font-medium text-slate-100 focus:border-cyan-500 focus:outline-none"
              >
                {crewList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.role})
                  </option>
                ))}
              </select>
            </div>

            {catalog && summary && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 min-w-0">
                <label htmlFor="env-select" className="text-xs text-slate-400 whitespace-nowrap">
                  Environment
                </label>
                <select
                  id="env-select"
                  value={summary.crew.environment}
                  onChange={(e) => handleEnvironmentChange(e.target.value)}
                  className="w-full sm:w-auto max-w-full min-w-0 rounded border border-slate-700 bg-[#070B12] px-2.5 py-1.5 text-xs font-medium text-slate-100 focus:border-cyan-500 focus:outline-none"
                >
                  {catalog.environments.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 min-w-0 flex-1 sm:flex-initial">
              <label htmlFor="scenario-select" className="text-xs text-slate-400 whitespace-nowrap">
                Demo Scenario
              </label>
              <select
                id="scenario-select"
                value={selectedScenarioId}
                onChange={(e) => handleScenarioApply(e.target.value)}
                className="w-full sm:w-auto max-w-full min-w-0 rounded border border-slate-700 bg-[#070B12] px-2.5 py-1.5 text-xs font-medium text-slate-100 focus:border-cyan-500 focus:outline-none"
              >
                <option value="">Select scenario...</option>
                {scenarios.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleResetAll}
              className="inline-flex items-center justify-center gap-1.5 rounded border border-slate-700 bg-[#070B12] px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-slate-100 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Demo</span>
            </button>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-200"
          >
            {error}
          </div>
        )}

        {loading || !summary || !catalog ? (
          <div className="rounded-lg border border-slate-800 bg-[#0E1522] p-10 text-center text-sm text-slate-400">
            Loading crew telemetry console...
          </div>
        ) : (
          <>
            {/* Status Overview Banner */}
            <section className="rounded-lg border border-slate-800 bg-[#0E1522] p-5">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <StatusLabel status={summary.overall_status} />
                    <span aria-hidden="true">·</span>
                    <span>{summary.crew.name}</span>
                    <span aria-hidden="true">·</span>
                    <span>{summary.environment.name}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">Link: {summary.environment.comm_delay_label}</span>
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-100 text-balance">
                    {summary.headline}
                  </h1>
                  <p className="text-sm text-slate-300">{summary.subline}</p>
                </div>

                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-xs text-slate-400">Checks Due</p>
                    <p className="font-mono text-2xl font-semibold text-slate-100">
                      {summary.due_count}
                      <span className="ml-1.5 text-xs font-normal text-slate-400">ITEMS</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Baseline Mass</p>
                    <p className="font-mono text-2xl font-semibold text-slate-100">
                      {summary.crew.baseline_mass_kg.toFixed(1)}
                      <span className="ml-1.5 text-xs font-normal text-slate-400">KG</span>
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Tab Views */}
            {activeTab === 'monitor' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left: Clickable Anatomical Body Map */}
                <section
                  aria-label="Anatomical body region selector"
                  className="lg:col-span-5 rounded-lg border border-slate-800 bg-[#0E1522] p-5 space-y-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-slate-100">
                      Anatomical System Map
                    </h2>
                    <span className="text-xs text-slate-400">Select region to inspect</span>
                  </div>
                  <BodyMap
                    regions={summary.regions}
                    selectedRegionId={selectedRegion?.region_id ?? 'neuro_ocular'}
                    onSelectRegion={setSelectedRegionId}
                  />
                </section>

                {/* Right: Selected Region Inspector + Insights & Escalation */}
                <div className="lg:col-span-7 space-y-6">
                  {selectedRegion && (
                    <section
                      aria-label="Selected body region details"
                      className="rounded-lg border border-slate-800 bg-[#0E1522] p-5 space-y-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold text-slate-100">
                              {selectedRegion.name}
                            </h2>
                            <StatusLabel status={selectedRegion.status} />
                          </div>
                          <p className="text-xs text-slate-400">
                            {selectedRegion.subtitle} · Hazard: {selectedRegion.hazard}
                          </p>
                        </div>
                      </div>

                      <p className="text-sm text-slate-200">{selectedRegion.headline}</p>

                      {selectedRegion.actions.length > 0 && (
                        <div className="rounded-md border border-slate-800 bg-[#0A0F1A] p-4 space-y-2">
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                            Recommended Countermeasures
                          </h3>
                          <ul className="list-disc pl-5 text-xs text-slate-200 space-y-1">
                            {selectedRegion.actions.map((act) => (
                              <li key={act}>{act}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {selectedRegion.active_symptoms.length > 0 && (
                        <div className="space-y-2">
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Active Region Symptoms
                          </h3>
                          <div className="divide-y divide-slate-800 rounded-md border border-slate-800 bg-[#0A0F1A]">
                            {selectedRegion.active_symptoms.map((sym) => (
                              <div
                                key={sym.symptom_id}
                                className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                              >
                                <div>
                                  <p className="text-sm font-medium text-slate-100">
                                    {sym.name}
                                  </p>
                                  <p className="font-mono text-xs text-slate-400">
                                    Severity {sym.severity}/3 · Logged {sym.reported_at.slice(0, 10)}
                                  </p>
                                </div>
                                <StatusLabel status={sym.status} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Indicators in Region */}
                      <div className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Measured Indicators
                        </h3>
                        <div className="grid grid-cols-1 gap-3">
                          {selectedRegion.indicators.map((ind) => (
                            <div
                              key={ind.indicator_id}
                              className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-800 bg-[#0A0F1A] p-4"
                            >
                              <div className="space-y-1 min-w-[200px] flex-1">
                                <div className="flex items-center gap-2.5">
                                  <span className="text-sm font-semibold text-slate-100">
                                    {ind.name}
                                  </span>
                                  <StatusLabel status={ind.status} />
                                </div>
                                <p className="text-xs text-slate-400">{ind.message}</p>
                                <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                                  <span>{ind.cadence === 'weekly' ? 'Weekly' : 'Daily'}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{ind.eval_mode}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    {ind.days_since === null
                                      ? 'Never logged'
                                      : ind.days_since === 0
                                        ? 'Logged today'
                                        : `${ind.days_since}d ago`}
                                  </span>
                                  {ind.due && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="text-amber-400">Due</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-5 shrink-0">
                                <Sparkline values={ind.sparkline} status={ind.status} />
                                <div className="text-right min-w-[96px]">
                                  <div className="font-mono text-2xl font-semibold text-slate-100">
                                    {ind.display_value}
                                    <span className="ml-1.5 text-xs font-normal text-slate-400">
                                      {ind.unit}
                                    </span>
                                  </div>
                                  <div className="flex justify-end">
                                    <TrendBadge trend={ind.trend} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Escalation & Prioritized Insights */}
                  <section
                    aria-label="Insights and escalation guidance"
                    className="rounded-lg border border-slate-800 bg-[#0E1522] p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-base font-semibold text-slate-100">
                        Active Health Insights
                      </h2>
                      <span className="font-mono text-xs text-slate-400">
                        {summary.escalation.autonomous_protocol
                          ? 'Autonomous Crew Protocol'
                          : 'Ground Flight Surgeon Link'}
                      </span>
                    </div>

                    <div
                      className={`flex items-start gap-3 rounded-md border p-3.5 text-xs ${
                        summary.escalation.required
                          ? 'border-amber-500/40 bg-amber-950/20 text-amber-100'
                          : 'border-slate-800 bg-[#0A0F1A] text-slate-300'
                      }`}
                    >
                      <ShieldAlert
                        className={`h-4 w-4 shrink-0 mt-0.5 ${
                          summary.escalation.required ? 'text-amber-400' : 'text-cyan-400'
                        }`}
                      />
                      <div className="space-y-0.5">
                        <p className="font-semibold">
                          Escalation Guidance ({summary.environment.comm_delay_label})
                        </p>
                        <p className="text-slate-300">{summary.escalation.note}</p>
                      </div>
                    </div>

                    {summary.insights.length === 0 ? (
                      <p className="text-sm text-slate-400">
                        No insights generated yet. Log a check-in to evaluate crew health.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-800 rounded-md border border-slate-800 bg-[#0A0F1A]">
                        {summary.insights.map((ins) => (
                          <div key={ins.id} className="p-4 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <StatusLabel status={ins.severity} />
                                <h3 className="text-sm font-semibold text-slate-100">
                                  {ins.title}
                                </h3>
                              </div>
                              {ins.region_id && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedRegionId(ins.region_id!)}
                                  className="text-xs font-medium text-cyan-400 hover:text-cyan-300 whitespace-nowrap"
                                >
                                  Inspect Region
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-slate-300">{ins.message}</p>
                            {ins.actions.length > 0 && (
                              <ul className="list-disc pl-5 text-xs text-slate-400 space-y-0.5">
                                {ins.actions.map((a) => (
                                  <li key={a}>{a}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            )}

            {activeTab === 'trends' && (
              <TrendsView crewId={selectedCrewId} refreshKey={refreshKey} />
            )}

            {activeTab === 'readiness' && (
              <ReadinessView crewId={selectedCrewId} refreshKey={refreshKey} />
            )}

            {activeTab === 'report' && (
              <ReportView crewId={selectedCrewId} refreshKey={refreshKey} />
            )}
          </>
        )}
      </main>

      {checkinOpen && catalog && summary && (
        <CheckinModal
          catalog={catalog}
          summary={summary}
          onClose={() => setCheckinOpen(false)}
          onSubmitted={handleCheckinSubmitted}
        />
      )}
    </div>
  );
}
